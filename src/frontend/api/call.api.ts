import type { CallAccess } from '#/shared/types/call.types'
import { api } from './client'
import { unwrap } from './response'

/**
 * Asking the site for a way into a call.
 *
 * Both calls return the same thing from two different doors: the visitor's is
 * opened by the token in their email, the owner's by his admin session.
 */

/**
 * Eden Treaty turns anything that parses as an ISO date back into a `Date`,
 * so these arrive as objects despite the type saying `string` — the same trap
 * `booking.api.ts` documents at length. Left as objects, the countdown in the
 * room compares a `Date` against a string and never fires.
 */
const toInstant = (value: string): string =>
  ((value as unknown) instanceof Date ? (value as unknown as Date).toISOString() : value)

const normalise = (access: CallAccess): CallAccess => ({
  ...access,
  startsAt: toInstant(access.startsAt),
  endsAt: toInstant(access.endsAt),
  closesAt: toInstant(access.closesAt),
})

export async function joinCallAsVisitor(reference: string, token: string): Promise<CallAccess> {
  return normalise(
    unwrap<CallAccess>(
      await api()
        .call.bookings({ reference })
        .join.post({}, { headers: { 'x-booking-token': token } }),
    ),
  )
}

export async function joinCallAsHost(bookingId: string): Promise<CallAccess> {
  return normalise(unwrap<CallAccess>(await api().admin.call.bookings({ id: bookingId }).join.post({})))
}
