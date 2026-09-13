import type {
  BookingLanguage,
  BookingStatus,
  ExceptionKind,
  LocationKind,
} from '#/shared/validation/booking.validation'

/* -------------------------------------------------------------------------- */
/* Public                                                                     */
/* -------------------------------------------------------------------------- */

/** One bookable call, in the visitor's language. */
export type PublicBookingType = {
  slug: string
  name: string
  description: string
  durationMinutes: number
  locationKind: LocationKind
  priceCents: number
  currency: string
}

/**
 * One offerable time. `startsAt` and `endsAt` are UTC instants; the visitor's
 * zone is carried alongside so the browser formats rather than computes. A
 * slot is never a wall-clock string on the wire.
 */
export type BookingSlot = {
  startsAt: string
  endsAt: string
}

/** Slots grouped by the day they fall on in the visitor's own zone. */
export type BookingSlotDay = {
  /** `2026-09-14`, as that date reads where the visitor is. */
  date: string
  slots: BookingSlot[]
}

export type BookingSlotResponse = {
  bookingType: PublicBookingType
  timezone: string
  /** The furthest day this type can currently be booked on. */
  lastBookableDate: string
  days: BookingSlotDay[]
}

/**
 * What the visitor is shown after booking, and what the manage page reads.
 * Deliberately narrower than the row: no lead, no token, no internal id.
 */
export type PublicBooking = {
  reference: string
  status: BookingStatus
  startsAt: string
  endsAt: string
  timezone: string
  language: BookingLanguage
  visitorName: string
  visitorEmail: string
  locationKind: LocationKind
  locationValue: string | null
  bookingType: { slug: string; name: string; durationMinutes: number }
  /** Only ever set on a booking the visitor just created. */
  manageToken?: string
}

/* -------------------------------------------------------------------------- */
/* Admin                                                                      */
/* -------------------------------------------------------------------------- */

export type AdminBookingTypeTranslation = { name: string; description: string }

export type AdminBookingType = {
  id: string
  slug: string
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  minimumNoticeMinutes: number
  bookingWindowDays: number
  slotIntervalMinutes: number
  maxPerDay: number | null
  locationKind: LocationKind
  locationValue: string | null
  priceCents: number
  currency: string
  isActive: boolean
  sortOrder: number
  translations: Record<BookingLanguage, AdminBookingTypeTranslation>
  /** Confirmed bookings still ahead, so a type is never deleted blindly. */
  upcomingCount: number
  createdAt: string
  updatedAt: string
}

export type AdminAvailabilityRule = {
  id: string
  weekday: number
  startsAtMinute: number
  endsAtMinute: number
}

export type AdminAvailabilityException = {
  id: string
  bookingTypeId: string | null
  onDate: string
  kind: ExceptionKind
  startsAtMinute: number | null
  endsAtMinute: number | null
  reason: string
}

export type AdminAvailability = {
  timezone: string
  rules: AdminAvailabilityRule[]
  exceptions: AdminAvailabilityException[]
}

export type AdminBookingListItem = {
  id: string
  reference: string
  startsAt: string
  endsAt: string
  status: BookingStatus
  visitorName: string
  visitorEmail: string
  visitorTimezone: string
  bookingTypeName: string
  leadId: string | null
}

export type AdminBookingList = {
  items: AdminBookingListItem[]
  total: number
  page: number
  pageCount: number
}

export type AdminBookingDetail = AdminBookingListItem & {
  visitorPhone: string | null
  visitorNote: string
  language: BookingLanguage
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  blockedStartsAt: string
  blockedEndsAt: string
  locationKind: LocationKind
  locationValue: string | null
  priceCents: number
  currency: string
  cancelledAt: string | null
  cancelledBy: 'VISITOR' | 'ADMIN' | null
  cancellationReason: string
  rescheduledFromReference: string | null
  createdAt: string
}
