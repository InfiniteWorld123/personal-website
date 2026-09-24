/**
 * The bridge from the Worker's `scheduled` event to Backend2's jobs.
 *
 * Why a bridge at all: on Cloudflare, Nitro builds the Worker entry (where the
 * `cloudflare:scheduled` hook fires) and the TanStack Start server bundle
 * (where Backend2 lives) as two separate bundles. Importing the jobs from the
 * Nitro plugin would bundle every Backend2 module a second time, and the
 * Worker is already at the free plan's 3 MB limit. So the plugin hands the
 * run to the server bundle as one in-process request instead, and this file —
 * tiny and dependency-free, because both bundles import it — is the handshake.
 *
 * It is not a public endpoint. The request is only honoured when it carries a
 * single-use random token that the plugin registered on this isolate's global
 * object a moment earlier. Nothing outside the isolate can read that object,
 * so a request from the internet presenting any header at all is refused and
 * falls through to Backend2's ordinary "Route not found".
 */

export const SCHEDULED_HANDOFF_PATH = '/api/v2/_scheduled'
export const SCHEDULED_HANDOFF_HEADER = 'x-backend2-scheduled'

const TOKENS = Symbol.for('yamanwarda.backend2.scheduled-tokens')

type Pending = Map<string, number>

const pending = (): Pending => {
  const holder = globalThis as typeof globalThis & { [TOKENS]?: Pending }

  return (holder[TOKENS] ??= new Map())
}

const randomToken = (): string => {
  const bytes = new Uint8Array(32)

  crypto.getRandomValues(bytes)

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Nitro side: the one request that asks the server bundle to run the jobs. */
export const createScheduledHandoff = (scheduledTime: number): Request => {
  const token = randomToken()

  pending().set(token, scheduledTime)

  return new Request(`https://backend2.internal${SCHEDULED_HANDOFF_PATH}`, {
    method: 'GET',
    headers: { [SCHEDULED_HANDOFF_HEADER]: token },
  })
}

/**
 * Server side: the scheduled time when `request` is a genuine hand-off, else
 * `null`. A token is consumed on first use, so a copy cannot be replayed.
 */
export const acceptScheduledHandoff = (request: Request): number | null => {
  const token = request.headers.get(SCHEDULED_HANDOFF_HEADER)

  if (!token || request.method !== 'GET') return null

  let pathname: string

  try {
    pathname = new URL(request.url).pathname
  } catch {
    return null
  }

  if (pathname !== SCHEDULED_HANDOFF_PATH) return null

  const tokens = pending()
  const scheduledTime = tokens.get(token)

  if (scheduledTime === undefined) return null

  tokens.delete(token)

  return scheduledTime
}

/** Drops a token the server never consumed (the hand-off failed on the way). */
export const discardScheduledHandoff = (request: Request): void => {
  const token = request.headers.get(SCHEDULED_HANDOFF_HEADER)

  if (token) pending().delete(token)
}
