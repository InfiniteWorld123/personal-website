import { env } from '#/shared/env'
import type { CallSeat } from '#/shared/types/call.types'

/**
 * What the site hands someone on their way into a call.
 *
 * The signalling Worker holds no database and asks no questions. Every check
 * worth making — does this booking exist, is it confirmed, is it a video call,
 * is the person holding the manage token, is it anywhere near the meeting time
 * — is made here, once, and the answer is compressed into a signed string that
 * is true for two minutes.
 *
 * Two minutes because a ticket is only ever spent opening one socket. A
 * longer life would let a link copied out of a browser's address bar be
 * reused; two minutes is long enough for a slow phone and short enough that
 * there is nothing to reuse.
 *
 * Wire format and payload keys are mirrored in `workers/call-room/src/ticket.ts`.
 * Deliberately duplicated rather than shared: the two are separate deploys,
 * and a package boundary between them would buy nothing but a build step.
 */

const TICKET_TTL_SECONDS = 120

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')

const toBase64Url = (value: string): string =>
  btoa(value).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')

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
 * The room's name, derived from the booking reference.
 *
 * Not the reference itself. `BK-7QF2MX` is printed in an email, quoted in a
 * reply, and read over the phone; it should not also be the name of a room
 * that anyone holding the secret-free half of the system could address. The
 * digest keeps the derivation stable — both sides compute the same room
 * without storing it — while making the room unguessable from the code.
 */
export const roomIdForBooking = async (reference: string): Promise<string> => {
  const secret = requireSecret()

  return (await hmac(`room:${reference}`, secret)).slice(0, 32)
}

export const signCallTicket = async (input: {
  room: string
  seat: CallSeat
  /** What the other side is shown. Signed, so the browser cannot rewrite it. */
  name: string
}): Promise<string> => {
  const secret = requireSecret()

  const payload = JSON.stringify({
    r: input.room,
    s: input.seat,
    e: Math.floor(Date.now() / 1000) + TICKET_TTL_SECONDS,
    n: input.name.slice(0, 80),
  })

  const body = toBase64Url(payload)

  return `${body}.${await hmac(body, secret)}`
}

export const isCallConfigured = (): boolean =>
  Boolean(env.CALL_ROOM_SECRET && env.CALL_ROOM_URL)

const requireSecret = (): string => {
  const secret = env.CALL_ROOM_SECRET

  // Reached only behind `isCallConfigured`, which the service checks first so
  // the visitor gets a sentence instead of a stack trace.
  if (!secret) throw new Error('CALL_ROOM_SECRET is not set')

  return secret
}
