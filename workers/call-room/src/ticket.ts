/**
 * The ticket, and the only thing this Worker trusts.
 *
 * The site owns every question worth asking — does this booking exist, is it
 * confirmed, is the person holding the manage token, is it anywhere near the
 * meeting time — and answers them against Neon. This Worker asks none of them.
 * It checks one signature and lets the holder into one room.
 *
 * That split is deliberate. Signalling has to be fast and always up; a
 * database read on the way into a call is a way for the call to fail for a
 * reason that has nothing to do with the call. So the site hands out a ticket
 * that is true for two minutes, and this Worker needs no network at all.
 *
 * Wire format: `<base64url(payload)>.<hex hmac-sha256>`
 *
 * The payload is deliberately short — it travels in a URL, and a WebSocket
 * upgrade cannot carry headers the browser will set.
 */

export type Seat = 'host' | 'guest'

export type TicketPayload = {
  /** The room. Derived from the booking id by the site, never the reference. */
  r: string
  /** Which of the two chairs. A room holds one of each, and no third. */
  s: Seat
  /** Expiry, unix seconds. Two minutes: long enough to open a socket. */
  e: number
  /** What the other side should call this person. Signed, so unforgeable. */
  n: string
}

const fromBase64Url = (value: string): string =>
  atob(value.replaceAll('-', '+').replaceAll('_', '/'))

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const hmac = async (message: string, secret: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
}

/**
 * Compares in constant time.
 *
 * `a === b` on a signature leaks, through how long it takes to fail, how many
 * leading characters were right — which is enough to reconstruct a valid one
 * given patience. The cost of not leaking it is a loop.
 */
const equals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false

  let difference = 0
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }

  return difference === 0
}

const SEATS: readonly Seat[] = ['host', 'guest']

/** The payload if the ticket is genuine and current, otherwise null. */
export const readTicket = async (
  ticket: string,
  secret: string,
): Promise<TicketPayload | null> => {
  const separator = ticket.lastIndexOf('.')
  if (separator <= 0) return null

  const body = ticket.slice(0, separator)
  const signature = ticket.slice(separator + 1)

  if (!equals(signature, await hmac(body, secret))) return null

  let payload: unknown
  try {
    payload = JSON.parse(fromBase64Url(body))
  } catch {
    return null
  }

  if (typeof payload !== 'object' || payload === null) return null

  const { r, s, e, n } = payload as Record<string, unknown>

  if (typeof r !== 'string' || r === '' || r.length > 128) return null
  if (typeof s !== 'string' || !SEATS.includes(s as Seat)) return null
  if (typeof e !== 'number' || !Number.isFinite(e)) return null
  if (typeof n !== 'string' || n.length > 80) return null

  // Signed and current are two different questions. A ticket that verifies but
  // expired an hour ago is a replayed link, and is refused here.
  if (e * 1000 <= Date.now()) return null

  return { r, s: s as Seat, e, n }
}
