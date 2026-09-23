/**
 * Calendar dates for invoices and subscriptions. Pure and shared.
 *
 * An invoice date, a due date and a billing date are *calendar days in
 * Germany*, not instants: `2026-03-29` is the same day however many hours the
 * clocks jumped that night. So they travel as `YYYY-MM-DD` strings and are
 * computed on the UTC calendar, where no day is ever 23 or 25 hours long.
 * The only place a clock is read is `berlinToday`, which asks what day it is
 * in Europe/Berlin right now.
 */

export const OWNER_TIME_ZONE = 'Europe/Berlin'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u

/** A real calendar date in `YYYY-MM-DD` form — not `2026-02-30`. */
export const isCalendarDate = (value: string): boolean => {
  const match = DATE_PATTERN.exec(value)

  if (!match) return false

  const [, y, m, d] = match
  const year = Number(y)
  const month = Number(m)
  const day = Number(d)

  return year >= 2000 && year <= 2999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month)
}

/** The day it is in Berlin at `now`. */
export const berlinToday = (now: Date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OWNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')}`
}

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate()

const toUtc = (date: string): Date => {
  const [y, m, d] = date.split('-').map(Number)

  return new Date(Date.UTC(y!, m! - 1, d!))
}

const fromUtc = (date: Date): string => date.toISOString().slice(0, 10)

export const addDays = (date: string, days: number): string => {
  const value = toUtc(date)

  value.setUTCDate(value.getUTCDate() + days)

  return fromUtc(value)
}

export const daysBetween = (from: string, to: string): number =>
  Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000)

export const yearOf = (date: string): number => Number(date.slice(0, 4))

/**
 * `months` after `date`, on `anchorDay` where the month has it and on the
 * month's last day where it does not.
 *
 * Always measured from the anchor, never from the previous result: a
 * subscription that started on 31 January bills 28/29 February and then
 * 31 March again, rather than drifting to the 28th for ever.
 */
export const addMonthsOnDay = (date: string, months: number, anchorDay: number): string => {
  const [y, m] = date.split('-').map(Number)
  const index = y! * 12 + (m! - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  const day = Math.min(anchorDay, daysInMonth(year, month))

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const BILLING_INTERVALS = ['monthly', 'yearly'] as const
export type BillingInterval = (typeof BILLING_INTERVALS)[number]

const monthsPer = (interval: BillingInterval): number => (interval === 'monthly' ? 1 : 12)

/** The first day of period `index` (0 = the first collection date). */
export const periodStart = (startDate: string, interval: BillingInterval, index: number): string =>
  addMonthsOnDay(startDate, index * monthsPer(interval), Number(startDate.slice(8, 10)))

/** The last day of period `index`: the day before the next one starts. */
export const periodEnd = (startDate: string, interval: BillingInterval, index: number): string =>
  addDays(periodStart(startDate, interval, index + 1), -1)

/** The index of the first period starting on or after `date`. */
export const firstPeriodOnOrAfter = (
  startDate: string,
  interval: BillingInterval,
  date: string,
): number => {
  if (date <= startDate) return 0

  // A cheap estimate, then walked into place: periods are never shorter than
  // 28 days, so this starts at or before the answer.
  let index = Math.max(0, Math.floor(daysBetween(startDate, date) / (interval === 'monthly' ? 31 : 366)))

  while (periodStart(startDate, interval, index) < date) index += 1

  return index
}
