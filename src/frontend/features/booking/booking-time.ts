import { LOCALES } from './booking-copy'
import type { Language } from '#/frontend/i18n/language'

/**
 * Formatting and plain-date helpers shared by the public flow and the admin.
 *
 * Every time on screen is produced by `Intl` from a UTC instant. Nothing here
 * ever builds a wall-clock string by hand, and nothing adds or subtracts an
 * offset: that is the mistake this whole feature is arranged to avoid.
 */

/** The visitor's own zone, as their browser reports it. */
export const detectTimezone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin'
  } catch {
    return 'Europe/Berlin'
  }
}

export const formatTime = (instant: string, timeZone: string, language: Language): string =>
  new Intl.DateTimeFormat(LOCALES[language], {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))

export const formatDateTime = (instant: string, timeZone: string, language: Language): string =>
  new Intl.DateTimeFormat(LOCALES[language], {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(instant))

export const formatDay = (day: string, language: Language): string =>
  new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${day}T00:00:00.000Z`))

export const formatMonth = (day: string, language: Language): string =>
  new Intl.DateTimeFormat(LOCALES[language], {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${day}T00:00:00.000Z`))

/** `YYYY-MM-DD` for an instant, in the given zone. */
export const dayIn = (instant: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)

  // en-CA already formats as YYYY-MM-DD, which is why it is used here.
  return parts
}

export const startOfMonth = (day: string): string => `${day.slice(0, 7)}-01`

export const addMonths = (day: string, amount: number): string => {
  const [year, month] = day.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1))

  return shifted.toISOString().slice(0, 10)
}

export const endOfMonth = (day: string): string =>
  new Date(Date.parse(`${addMonths(startOfMonth(day), 1)}T00:00:00.000Z`) - 86_400_000)
    .toISOString()
    .slice(0, 10)

/**
 * The calendar grid for a month: whole weeks starting on Monday, with the
 * leading and trailing days of the neighbouring months as `null`.
 */
export const monthGrid = (month: string): Array<string | null> => {
  const first = new Date(`${startOfMonth(month)}T00:00:00.000Z`)
  const daysInMonth = Number(endOfMonth(month).slice(8, 10))

  // getUTCDay is 0 for Sunday; the grid starts on Monday.
  const leading = (first.getUTCDay() + 6) % 7

  const cells: Array<string | null> = Array.from({ length: leading }, () => null)

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(`${month.slice(0, 7)}-${String(day).padStart(2, '0')}`)
  }

  while (cells.length % 7 !== 0) cells.push(null)

  return cells
}

/** `YYYY-MM-DD`, `amount` days later. Plain-date arithmetic, never an offset. */
export const addDays = (day: string, amount: number): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + amount * 86_400_000).toISOString().slice(0, 10)

/**
 * "Do. 14:00" — the shortest form that still says which day. Used where a
 * single free time is quoted outside the calendar, so the visitor can judge
 * it at a glance before deciding to open the booking page at all.
 */
export const formatShortSlot = (instant: string, timeZone: string, language: Language): string =>
  new Intl.DateTimeFormat(LOCALES[language], {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))

/** "Do. 17. Sep · 14:00" — a slot offered as its own button. */
export const formatSlotLabel = (instant: string, timeZone: string, language: Language): string => {
  const date = new Intl.DateTimeFormat(LOCALES[language], {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(instant))

  return `${date} · ${formatTime(instant, timeZone, language)}`
}

/**
 * How far the given zone is from UTC at that instant, in milliseconds.
 * Formatting the instant *in* the zone and reading the result back as if it
 * were UTC is the only way to ask this without a timezone library.
 */
const zoneOffsetMs = (instant: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  const asIfUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour') % 24,
    read('minute'),
    read('second'),
  )

  return asIfUtc - instant.getTime()
}

/**
 * `2026-09-17` + `18:00` as read on a clock in `timeZone`, as a UTC instant.
 *
 * Two passes: the first offset is taken at the naive instant, which lands
 * within an hour of the real one, and the second at that corrected instant —
 * which is what makes the hour after a daylight-saving change come out right.
 */
export const instantFromZoned = (day: string, time: string, timeZone: string): string => {
  const naive = Date.parse(`${day}T${time.length === 5 ? time : `${time}:00`}Z`)

  if (Number.isNaN(naive)) return ''

  const first = naive - zoneOffsetMs(new Date(naive), timeZone)
  const exact = naive - zoneOffsetMs(new Date(first), timeZone)

  return new Date(exact).toISOString()
}
