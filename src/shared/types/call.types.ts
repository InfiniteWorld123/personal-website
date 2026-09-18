/**
 * The call, as the browser is told about it.
 *
 * Nothing here is stored. A call has no row: it is a window of time around a
 * booking, a room derived from that booking's reference, and a ticket that
 * expires two minutes after it is issued. See `docs/decisions.md` D33.
 */

export type CallSeat = 'host' | 'guest'

/**
 * Exactly the WebRTC `RTCIceServer` shape, because it is handed straight to
 * `new RTCPeerConnection`. Repeated here rather than imported from the DOM
 * types so the backend can name it too.
 */
export type CallIceServer = {
  urls: string[]
  username?: string
  credential?: string
}

export type CallAccess = {
  /** Where to open the socket. The full URL, ticket included. */
  url: string
  seat: CallSeat
  /** Who the other chair belongs to, for the label under their video. */
  peerName: string
  /** The meeting itself, so the room can count down and then wind up. */
  startsAt: string
  endsAt: string
  /** After this instant the room stops issuing tickets and the call is over. */
  closesAt: string
  iceServers: CallIceServer[]
}

/**
 * When a room exists.
 *
 * A call is a window of time around a booking, not a record: it opens shortly
 * before the meeting and closes a while after it should have ended. Outside
 * that window there is nothing to join, which is what keeps an emailed link
 * from being a door that stands open for months.
 *
 * Shared rather than duplicated because both sides ask the same question and
 * must not answer it differently — the server refuses outside the window, and
 * a button the browser offers anyway is a button that fails when pressed.
 */
export const CALL_OPENS_MINUTES_BEFORE = 15
export const CALL_CLOSES_MINUTES_AFTER = 60

const MINUTE = 60 * 1000

export const callOpensAt = (startsAt: string): number =>
  new Date(startsAt).getTime() - CALL_OPENS_MINUTES_BEFORE * MINUTE

export const callClosesAt = (endsAt: string): number =>
  new Date(endsAt).getTime() + CALL_CLOSES_MINUTES_AFTER * MINUTE

export const isCallOpen = (
  booking: { startsAt: string; endsAt: string; status: string; locationKind: string },
  now: number = Date.now(),
): boolean =>
  booking.status === 'CONFIRMED' &&
  booking.locationKind === 'VIDEO' &&
  now >= callOpensAt(booking.startsAt) &&
  now <= callClosesAt(booking.endsAt)
