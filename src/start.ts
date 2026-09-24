import { createMiddleware, createStart } from '@tanstack/react-start'
import { responseFailure } from '#/backend2/http/response'
import { CF_BEACON_REPORT_ORIGIN, CF_BEACON_SCRIPT_ORIGIN, webAnalyticsToken } from '#/shared/web-analytics'

const UNSAFE_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT'])

const requestBodyLimits: Array<{ path: string; bytes: number }> = [
  // The V2 mail ingress (`docs/v2/inbox.md`): a letter with its files, base64
  // inside the JSON — 30 MB, matching the route's own ceiling. At a megabyte
  // every client attachment would be refused here with a 413 before the route
  // ever saw it.
  { path: '/api/v2/inbound-email', bytes: 30 * 1024 * 1024 },
]

/**
 * Endpoints a machine calls, never a browser.
 *
 * The origin rule is a CSRF defence: it stops another site from making a
 * visitor's browser post here with the visitor's cookies attached. A mail
 * forwarder sends no `Origin` header at all, so the rule would refuse every
 * letter — which is exactly what happened the first time one was tried.
 *
 * Exempting these is safe because they read no cookies and carry no
 * session: `/api/v2/inbound-email` believes nothing not signed with
 * `INBOX_INGRESS_SECRET` plus a timestamp, and `/api/v2/stripe/webhook`
 * nothing without Stripe's `Stripe-Signature` over the raw body — neither of
 * which a web page can produce. Stripe, too, sends no `Origin`. The body
 * limits above still apply.
 */
const signedWebhookPaths = new Set(['/api/v2/inbound-email', '/api/v2/stripe/webhook'])

const noStorePath = (pathname: string): boolean =>
  pathname.includes('/booking/manage/') ||
  // The call room renders the same private booking it is opened by, and is
  // reached with a live token. Cached, it outlives the call.
  pathname.includes('/booking/room/')

export const validateMutationRequest = (
  request: Request,
): 'BODY_TOO_LARGE' | 'FORBIDDEN_ORIGIN' | null => {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api') || !UNSAFE_METHODS.has(request.method.toUpperCase())) {
    return null
  }

  if (!signedWebhookPaths.has(url.pathname) && request.headers.get('origin') !== url.origin) {
    return 'FORBIDDEN_ORIGIN'
  }

  const limit = requestBodyLimits.find(({ path }) => url.pathname === path)
  const contentLength = Number(request.headers.get('content-length'))

  return limit && Number.isFinite(contentLength) && contentLength > limit.bytes
    ? 'BODY_TOO_LARGE'
    : null
}

/**
 * One address per page, answered with a permanent redirect.
 *
 * - `www.` is attached to the same Worker (`wrangler.jsonc`), so without this
 *   it served a second, complete copy of the site. Its canonical tags already
 *   name the bare domain; the redirect makes the address bar and every crawler
 *   agree.
 * - A trailing slash (`/de/work/`) was already sent to the slash-less page by
 *   the router, but with a *temporary* 307, which tells a search engine to
 *   keep both addresses. Same destination, now permanent, and in one hop when
 *   both apply.
 *
 * Reads only: a webhook or form posted to `www.` must not be turned into a GET
 * by a redirect, and the origin check refuses it anyway. `/api` keeps its own
 * paths untouched.
 */
export const canonicalRedirect = (request: Request): string | null => {
  const method = request.method.toUpperCase()

  if (method !== 'GET' && method !== 'HEAD') return null

  const url = new URL(request.url)
  let changed = false

  if (url.hostname.startsWith('www.')) {
    url.hostname = url.hostname.slice('www.'.length)
    changed = true
  }

  if (url.pathname.length > 1 && url.pathname.endsWith('/') && !url.pathname.startsWith('/api/')) {
    url.pathname = url.pathname.replace(/\/+$/, '') || '/'
    changed = true
  }

  return changed ? url.toString() : null
}

/** Private surfaces: never indexed, whatever a page's own meta tag says. */
const noIndexPath = (pathname: string): boolean =>
  pathname === '/dashboard' || pathname.startsWith('/dashboard/') || pathname.startsWith('/api/')

/** The Blog's click-to-load YouTube player (`docs/v2/blog.md`, answer 1A): the one frame origin it needs. */
const YOUTUBE_FRAME_ORIGIN = 'https://www.youtube-nocookie.com'

export const buildContentSecurityPolicy = (
  nonce: string,
  environment: Record<string, string | undefined> = process.env,
): string => {
  const images = ["'self'", 'data:', 'blob:'].join(' ')
  const frames = ['https://challenges.cloudflare.com', YOUTUBE_FRAME_ORIGIN].join(' ')
  // Cloudflare Web Analytics' beacon and where it reports, only while it is switched on.
  const beacon = webAnalyticsToken(environment) !== null
  const scripts = ["'self'", `'nonce-${nonce}'`, 'https://challenges.cloudflare.com', beacon ? CF_BEACON_SCRIPT_ORIGIN : '']
    .filter(Boolean)
    .join(' ')
  const connects = ["'self'", 'https://challenges.cloudflare.com', beacon ? CF_BEACON_REPORT_ORIGIN : '']
    .filter(Boolean)
    .join(' ')

  return [
    "default-src 'self'",
    `script-src ${scripts}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images}`,
    "font-src 'self'",
    `connect-src ${connects}`,
    `frame-src ${frames}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

const securityMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    const startedAt = Date.now()
    const url = new URL(request.url)
    const requestId = crypto.randomUUID()
    const isApi = url.pathname.startsWith('/api')

    const canonicalLocation = canonicalRedirect(request)

    if (canonicalLocation) {
      return new Response(null, {
        status: 301,
        headers: { Location: canonicalLocation, 'X-Request-ID': requestId },
      })
    }

    const mutationError = validateMutationRequest(request)

    if (mutationError) {
      if (mutationError === 'FORBIDDEN_ORIGIN') {
        return Response.json(
          responseFailure({ message: 'Request origin is not allowed', code: 'FORBIDDEN_ORIGIN' }),
          { status: 403, headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' } },
        )
      }

      return Response.json(
        responseFailure({ message: 'Request body is too large', code: 'BAD_REQUEST' }),
        { status: 413, headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' } },
      )
    }

    const nonce = crypto.randomUUID().replaceAll('-', '')
    const result = await next({ context: { nonce, requestId } })
    const response = new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers: new Headers(result.response.headers),
    })

    response.headers.set('X-Request-ID', requestId)
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('Referrer-Policy', 'no-referrer')
    // No page here needs a handle on a window it opened or was opened by;
    // every external link already carries `noopener`.
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
    if (noIndexPath(url.pathname)) response.headers.set('X-Robots-Tag', 'noindex, nofollow')
    response.headers.set(
      'Permissions-Policy',
      'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()',
    )

    if (process.env.NODE_ENV === 'production' && url.protocol === 'https:') {
      response.headers.set('Content-Security-Policy', buildContentSecurityPolicy(nonce))
      response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    }

    if (noStorePath(url.pathname)) response.headers.set('Cache-Control', 'no-store')

    if (isApi || response.status >= 500) {
      console.log(
        JSON.stringify({
          type: 'http_request',
          requestId,
          method: request.method,
          pathname: url.pathname,
          status: response.status,
          durationMs: Date.now() - startedAt,
        }),
      )
    }

    return response
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [securityMiddleware],
}))
