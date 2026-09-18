import { conflictError, notFoundError } from '#/backend/shared/error'
import { env } from '#/shared/env'
import {
  CALL_OPENS_MINUTES_BEFORE,
  callClosesAt,
  callOpensAt,
  type CallAccess,
  type CallSeat,
} from '#/shared/types/call.types'
import { getBookingByToken, getBookingForAdmin } from '../bookings/booking.service'
import { getIceServers } from './call.ice'
import { isCallConfigured, roomIdForBooking, signCallTicket } from './call.ticket'

/**
 * Letting the two people who booked a call into the same room.
 *
 * There is no room table and no call record. A room is a booking seen through
 * a window of time: it opens shortly before the meeting, it closes a while
 * after it should have ended, and outside that window it simply does not
 * exist. That is what keeps a video call from becoming a portal — the link in
 * an email from March does not open anything in June.
 *
 * Both doors lead to the same room, because both derive its name from the same
 * booking reference. Neither door tells the browser the room's name; it is
 * sealed inside the ticket.
 */

type CallBooking = {
  reference: string
  status: string
  startsAt: string
  endsAt: string
  locationKind: string
  visitorName: string
}

const buildAccess = async (booking: CallBooking, seat: CallSeat): Promise<CallAccess> => {
  if (!isCallConfigured()) {
    throw conflictError('Video calls are not switched on yet')
  }

  if (booking.status !== 'CONFIRMED') {
    throw conflictError('That call is no longer confirmed')
  }
  if (booking.locationKind !== 'VIDEO') {
    throw conflictError('That booking is not a video call')
  }

  const opensAt = callOpensAt(booking.startsAt)
  const closesAt = callClosesAt(booking.endsAt)
  const now = Date.now()

  // Two different sentences on purpose. "Not yet" is a person who is early and
  // should wait; "over" is a person holding a link that has done its job.
  if (now < opensAt) {
    throw conflictError(
      `This call has not opened yet. The room opens ${CALL_OPENS_MINUTES_BEFORE} minutes before it starts.`,
    )
  }
  if (now > closesAt) {
    throw conflictError('This call is over')
  }

  const room = await roomIdForBooking(booking.reference)

  // Who is entering, and who they will find. The host is the owner; the guest
  // is whoever the booking is for.
  const ownName = seat === 'host' ? env.APP_NAME : booking.visitorName
  const peerName = seat === 'host' ? booking.visitorName : env.APP_NAME

  const ticket = await signCallTicket({ room, seat, name: ownName })

  const base = (env.CALL_ROOM_URL ?? '').replace(/\/$/, '')

  return {
    url: `${base}/room?ticket=${encodeURIComponent(ticket)}`,
    seat,
    peerName,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    closesAt: new Date(closesAt).toISOString(),
    iceServers: await getIceServers(),
  }
}

/** The visitor's door: the manage token they already hold, nothing new to learn. */
export const getVisitorCallAccess = async (
  reference: string,
  token: string,
): Promise<CallAccess> => {
  const booking = await getBookingByToken(reference, token)

  return buildAccess(booking, 'guest')
}

/** The owner's door: his admin session, from the booking he is looking at. */
export const getHostCallAccess = async (bookingId: string): Promise<CallAccess> => {
  const booking = await getBookingForAdmin(bookingId)

  if (!booking.reference) throw notFoundError('That booking does not exist')

  return buildAccess(booking, 'host')
}
