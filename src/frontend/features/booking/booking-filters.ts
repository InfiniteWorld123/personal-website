import {
  BOOKING_RANGE_FILTERS,
  BOOKING_STATUS_FILTERS,
  type BookingFilterInput,
  type BookingRangeFilter,
} from '#/shared/validation/booking.validation'

type StatusFilter = (typeof BOOKING_STATUS_FILTERS)[number]

/**
 * The list's filters live in the URL, so a filtered view can be bookmarked and
 * reached again with the back button. Defaults are left out of the URL rather
 * than written as `?range=upcoming`.
 */
export type BookingSearch = {
  search?: string
  status?: StatusFilter
  range?: BookingRangeFilter
  page?: number
}

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()

  return trimmed === '' ? undefined : trimmed
}

/**
 * A hand-edited or stale URL narrows the list or does nothing; it never
 * produces an error page, so every unreadable value falls back to the default.
 */
export const validateBookingSearch = (input: Record<string, unknown>): BookingSearch => {
  const status = readString(input.status)
  const range = readString(input.range)
  const page = Number(input.page)

  return {
    search: readString(input.search),
    status: BOOKING_STATUS_FILTERS.includes(status as StatusFilter)
      ? (status as StatusFilter)
      : undefined,
    range: BOOKING_RANGE_FILTERS.includes(range as BookingRangeFilter)
      ? (range as BookingRangeFilter)
      : undefined,
    page: Number.isSafeInteger(page) && page > 1 ? page : undefined,
  }
}

export const toBookingFilterInput = (search: BookingSearch): BookingFilterInput => ({
  search: search.search ?? '',
  status: search.status ?? 'all',
  range: search.range ?? 'upcoming',
  page: search.page ?? 1,
})

export const hasActiveBookingFilters = (search: BookingSearch): boolean =>
  Boolean(search.search) ||
  (search.status ?? 'all') !== 'all' ||
  (search.range ?? 'upcoming') !== 'upcoming'

/** Minutes from midnight as `09:00`, and back. The admin edits wall clock. */
export const minuteToTime = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

export const timeToMinute = (value: string): number => {
  const [hours, minutes] = value.split(':').map(Number)

  return (hours || 0) * 60 + (minutes || 0)
}

/** Monday first, matching the calendar and the weekly editor. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  0: 'Sunday',
}
