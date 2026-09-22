import { responseOk } from '../http/response'
import { HttpStatus } from '../http/status'
import { V2_STEP_UP_HEADER } from './config'

/**
 * Auth responses are built as real `Response` objects rather than returned as
 * plain values.
 *
 * Two reasons. A sign-in has to set cookies, and Elysia hands a `Response`
 * straight through — no framework cookie API to depend on, and the same code
 * works on a Worker. And every auth reply must carry `Cache-Control:
 * no-store`, which is far easier to guarantee when there is one constructor
 * than when every handler has to remember a header.
 */
export const authJson = <T>(options: {
  data: T
  message?: string
  status?: number
  cookies?: string[]
}): Response => {
  const headers = new Headers({
    'content-type': 'application/json',
    // Also `no-store` for the proxy in front of us: an authenticated body in a
    // shared cache is the classic way one person receives another's page.
    'cache-control': 'no-store, no-cache, must-revalidate',
    pragma: 'no-cache',
    'x-content-type-options': 'nosniff',
    // Nothing under /api/v2/auth is ever meant to sit inside a frame.
    'x-frame-options': 'DENY',
    // Keeps a one-use token out of the Referer header on any navigation the
    // response leads to.
    'referrer-policy': 'no-referrer',
  })

  for (const cookie of options.cookies ?? []) headers.append('set-cookie', cookie)

  return new Response(
    JSON.stringify(responseOk({ data: options.data, message: options.message })),
    { status: options.status ?? HttpStatus.OK, headers },
  )
}

/** The step-up capability, read from its header. Never a cookie: see `session.ts`. */
export const readStepUpToken = (request: Request): string | null =>
  request.headers.get(V2_STEP_UP_HEADER)?.trim() || null

/**
 * The origin links in outgoing email should point at.
 *
 * Read from configuration, never from the request's own `Host` header: a
 * forged host would otherwise put an attacker's domain into a real password
 * reset email.
 */
export const readBaseUrl = (
  environment: Record<string, string | undefined> = process.env,
): string => {
  /*
   * A candidate counts only if it is a whole origin.
   *
   * Two ways this goes wrong otherwise, and both produce an email whose link
   * is `/dashboard/login/reset?token=...` with nothing in front of it. An
   * empty variable is present but useless — so `||`, never `??`. And
   * `BASE_URL` is a name Vite already owns: it defines it as `/`, which is
   * truthy and survives every `||`. So the shape is checked, not the presence.
   */
  const candidates = [
    ...(environment.AUTH_V2_ORIGIN?.split(',') ?? []),
    environment.BASE_URL,
    'http://localhost:3000',
  ]

  for (const candidate of candidates) {
    const trimmed = candidate?.trim().replace(/\/$/, '')

    if (trimmed && /^https?:\/\/[^/]+$/.test(trimmed)) return trimmed
  }

  return 'http://localhost:3000'
}
