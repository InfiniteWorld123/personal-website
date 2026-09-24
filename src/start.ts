import { createMiddleware, createStart } from '@tanstack/react-start'
import { responseError } from '#/backend/shared/response'

const UNSAFE_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT'])

const requestBodyLimits: Array<{ path: string; bytes: number }> = [
  { path: '/api/contact', bytes: 6 * 1024 * 1024 },
  { path: '/api/auth/sign-in/email', bytes: 32 * 1024 },
  { path: '/api/booking/bookings', bytes: 64 * 1024 },
  // A letter with its files, base64 inside the JSON: 30 MB, matching the
  // route's own ceiling. At the old megabyte every client attachment was
  // refused here with a 413 before the route ever saw it.
  { path: '/api/inbound-email', bytes: 30 * 1024 * 1024 },
  // The V2 mail ingress, same ceiling and same reason (`docs/v2/inbox.md`).
  { path: '/api/v2/inbound-email', bytes: 30 * 1024 * 1024 },
  // A new letter from the admin with its files. Each file is refused above
  // ten on its own; this stops a handful of large ones being buffered together.
  { path: '/api/admin/inbox/compose', bytes: 25 * 1024 * 1024 },
]

/**
 * Endpoints a machine calls, never a browser.
 *
 * The origin rule is a CSRF defence: it stops another site from making a
 * visitor's browser post here with the visitor's cookies attached. A mail
 * forwarder sends no `Origin` header at all, so the rule would refuse every
 * reply a client writes — which is exactly what happened the first time one
 * was tried.
 *
 * Exempting these is safe because they read no cookies and carry no session:
 * `/api/inbound-email` believes nothing that is not signed with
 * `INBOUND_MAIL_SECRET`, and `/api/stripe-webhook` nothing that is not signed
 * with `STRIPE_WEBHOOK_SECRET` — neither of which a web page can produce. The
 * body limit above still applies.
 */
// `/api/v2/inbound-email` believes nothing not signed with `INBOX_INGRESS_SECRET`
// plus a timestamp, and exists only where a V2 database is configured.
const signedWebhookPaths = new Set([
  '/api/inbound-email',
  '/api/stripe-webhook',
  '/api/v2/inbound-email',
])

const noStorePath = (pathname: string): boolean =>
  pathname.startsWith('/admin') ||
  pathname.startsWith('/api/admin') ||
  pathname.startsWith('/api/auth') ||
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

const r2Origin = (): string | undefined => {
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!publicUrl) return undefined

  try {
    return new URL(publicUrl).origin
  } catch {
    return undefined
  }
}

/**
 * The Blog's click-to-load YouTube player (`docs/v2/blog.md`, answer 1A): the
 * one frame origin it needs, allowed only while the public blog reads Backend2
 * (`PUBLIC_V2_MODULES` lists `blog`) — no legacy article can embed a video.
 * Read from the setting directly so this file does not load the V2 database
 * client.
 */
const youtubeFrameOrigin = (environment: Record<string, string | undefined>): string | undefined =>
  (environment.PUBLIC_V2_MODULES ?? '')
    .split(',')
    .some((name) => name.trim().toLowerCase() === 'blog')
    ? 'https://www.youtube-nocookie.com'
    : undefined

export const buildContentSecurityPolicy = (
  nonce: string,
  environment: Record<string, string | undefined> = process.env,
): string => {
  const images = ["'self'", 'data:', 'blob:', r2Origin()].filter(Boolean).join(' ')
  const frames = ['https://challenges.cloudflare.com', youtubeFrameOrigin(environment)]
    .filter(Boolean)
    .join(' ')

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${images}`,
    "font-src 'self'",
    "connect-src 'self' https://challenges.cloudflare.com",
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

    const mutationError = validateMutationRequest(request)

    if (mutationError) {
      if (mutationError === 'FORBIDDEN_ORIGIN') {
        return Response.json(
          responseError({ message: 'Request origin is not allowed', code: 'FORBIDDEN_ORIGIN' }),
          { status: 403, headers: { 'X-Request-ID': requestId, 'Cache-Control': 'no-store' } },
        )
      }

      return Response.json(
        responseError({ message: 'Request body is too large', code: 'BAD_REQUEST' }),
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
