import type {
  AdminAvailability,
  AdminBookingDetail,
  AdminBookingList,
  AdminBookingType,
  BookingSlotResponse,
  PublicBooking,
  PublicBookingType,
} from '#/shared/types/booking.types'
import type {
  AdminBookingCancelInput,
  AdminBookingCreateInput,
  AvailabilityExceptionWriteInput,
  AvailabilityRulesWriteInput,
  BookingCancelInput,
  BookingCreateInput,
  BookingFilterInput,
  BookingLanguage,
  BookingRescheduleInput,
  BookingStatusWriteInput,
  BookingTypeWriteInput,
  SlotQueryInput,
} from '#/shared/validation/booking.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * Eden Treaty revives anything that parses as an ISO date into a `Date`, so
 * every instant on the wire arrives as an object even though the type here
 * says `string` — the same trap `post.api.ts` documents. Rendering one of
 * these throws "Objects are not valid as a React child", and comparing two of
 * them as strings silently never matches.
 *
 * The cast through `unknown` is the point: the declared type says this is
 * already a string, and the whole reason this exists is that at runtime it is
 * not.
 */
const toInstant = <T extends string | null>(value: T): T =>
  ((value as unknown) instanceof Date
    ? (value as unknown as Date).toISOString()
    : value) as T

/** A date-only string comes back as UTC midnight, so the day cannot slip. */
const toDay = <T extends string | null>(value: T): T =>
  ((value as unknown) instanceof Date
    ? (value as unknown as Date).toISOString().slice(0, 10)
    : value) as T

const normaliseBooking = (booking: PublicBooking): PublicBooking => ({
  ...booking,
  startsAt: toInstant(booking.startsAt),
  endsAt: toInstant(booking.endsAt),
})

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

export async function fetchBookingTypes(language: BookingLanguage): Promise<PublicBookingType[]> {
  return unwrap<PublicBookingType[]>(await api().booking.types.get({ query: { language } }))
}

export async function fetchSlots(
  slug: string,
  language: BookingLanguage,
  query: SlotQueryInput,
): Promise<BookingSlotResponse> {
  const response = await unwrap<BookingSlotResponse>(
    await api()
      .booking.types({ slug })
      .slots.get({ query: { ...query, language } }),
  )

  return {
    ...response,
    lastBookableDate: toDay(response.lastBookableDate),
    days: response.days.map((day) => ({
      date: toDay(day.date),
      slots: day.slots.map((slot) => ({
        startsAt: toInstant(slot.startsAt),
        endsAt: toInstant(slot.endsAt),
      })),
    })),
  }
}

export async function createBooking(input: BookingCreateInput): Promise<PublicBooking> {
  return normaliseBooking(unwrap<PublicBooking>(await api().booking.bookings.post(input)))
}

export async function fetchBooking(reference: string, token: string): Promise<PublicBooking> {
  return normaliseBooking(
    unwrap<PublicBooking>(
      await api().booking.bookings({ reference }).get({ headers: { 'x-booking-token': token } }),
    ),
  )
}

export async function cancelBooking(
  reference: string,
  token: string,
  input: BookingCancelInput,
): Promise<PublicBooking> {
  return normaliseBooking(
    unwrap<PublicBooking>(
      await api()
        .booking.bookings({ reference })
        .cancel.post(input, { headers: { 'x-booking-token': token } }),
    ),
  )
}

export async function rescheduleBooking(
  reference: string,
  token: string,
  input: BookingRescheduleInput,
): Promise<PublicBooking> {
  return normaliseBooking(
    unwrap<PublicBooking>(
      await api()
        .booking.bookings({ reference })
        .reschedule.post(input, { headers: { 'x-booking-token': token } }),
    ),
  )
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

const normaliseType = (type: AdminBookingType): AdminBookingType => ({
  ...type,
  createdAt: toInstant(type.createdAt),
  updatedAt: toInstant(type.updatedAt),
})

export async function fetchAdminBookingTypes(): Promise<AdminBookingType[]> {
  const types = unwrap<AdminBookingType[]>(await api().admin.booking.types.get())

  return types.map(normaliseType)
}

export async function fetchAdminBookingType(id: string): Promise<AdminBookingType> {
  return normaliseType(unwrap<AdminBookingType>(await api().admin.booking.types({ id }).get()))
}

export async function createBookingType(input: BookingTypeWriteInput): Promise<AdminBookingType> {
  return normaliseType(unwrap<AdminBookingType>(await api().admin.booking.types.post(input)))
}

export async function updateBookingType(
  id: string,
  input: BookingTypeWriteInput,
): Promise<AdminBookingType> {
  return normaliseType(unwrap<AdminBookingType>(await api().admin.booking.types({ id }).put(input)))
}

export async function deleteBookingType(id: string): Promise<void> {
  unwrap(await api().admin.booking.types({ id }).delete())
}

const normaliseAvailability = (availability: AdminAvailability): AdminAvailability => ({
  ...availability,
  exceptions: availability.exceptions.map((entry) => ({ ...entry, onDate: toDay(entry.onDate) })),
})

export async function fetchAvailability(): Promise<AdminAvailability> {
  return normaliseAvailability(unwrap<AdminAvailability>(await api().admin.booking.availability.get()))
}

export async function saveAvailabilityRules(
  input: AvailabilityRulesWriteInput,
): Promise<AdminAvailability> {
  return normaliseAvailability(
    unwrap<AdminAvailability>(await api().admin.booking.availability.rules.put(input)),
  )
}

export async function createAvailabilityException(
  input: AvailabilityExceptionWriteInput,
): Promise<AdminAvailability> {
  return normaliseAvailability(
    unwrap<AdminAvailability>(await api().admin.booking.availability.exceptions.post(input)),
  )
}

export async function deleteAvailabilityException(id: string): Promise<void> {
  unwrap(await api().admin.booking.availability.exceptions({ id }).delete())
}

const normaliseDetail = (detail: AdminBookingDetail): AdminBookingDetail => ({
  ...detail,
  startsAt: toInstant(detail.startsAt),
  endsAt: toInstant(detail.endsAt),
  blockedStartsAt: toInstant(detail.blockedStartsAt),
  blockedEndsAt: toInstant(detail.blockedEndsAt),
  cancelledAt: toInstant(detail.cancelledAt),
  createdAt: toInstant(detail.createdAt),
})

export async function fetchAdminBookings(filter: BookingFilterInput): Promise<AdminBookingList> {
  const list = unwrap<AdminBookingList>(
    await api().admin.booking.bookings.get({
      query: {
        search: filter.search,
        status: filter.status,
        range: filter.range,
        page: String(filter.page),
      },
    }),
  )

  return {
    ...list,
    items: list.items.map((item) => ({
      ...item,
      startsAt: toInstant(item.startsAt),
      endsAt: toInstant(item.endsAt),
    })),
  }
}

export async function fetchAdminBooking(id: string): Promise<AdminBookingDetail> {
  return normaliseDetail(unwrap<AdminBookingDetail>(await api().admin.booking.bookings({ id }).get()))
}

/** A call the owner places himself. Same record, same confirmation mail. */
export async function createBookingAsAdmin(input: AdminBookingCreateInput): Promise<PublicBooking> {
  return normaliseBooking(unwrap<PublicBooking>(await api().admin.booking.bookings.post(input)))
}

export async function cancelBookingAsAdmin(
  id: string,
  input: AdminBookingCancelInput,
): Promise<AdminBookingDetail> {
  return normaliseDetail(
    unwrap<AdminBookingDetail>(await api().admin.booking.bookings({ id }).cancel.post(input)),
  )
}

export async function setBookingStatus(
  id: string,
  input: BookingStatusWriteInput,
): Promise<AdminBookingDetail> {
  return normaliseDetail(
    unwrap<AdminBookingDetail>(await api().admin.booking.bookings({ id }).status.patch(input)),
  )
}
