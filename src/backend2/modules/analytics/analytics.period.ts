import {
  ANALYTICS_TIME_ZONE,
  type AnalyticsBucket,
  type AnalyticsPeriod,
  DEFAULT_ANALYTICS_PRESET,
  EARLIEST_ANALYTICS_DATE,
  MAX_CUSTOM_DAYS,
  PRESET_DAYS,
  type PeriodQuery,
} from '../../contracts/analytics.contract'
import { validationFailed } from '../../http/error'

/**
 * The period a request selects, as Berlin calendar dates and the instants
 * they mean.
 *
 * Calendar arithmetic is done on plain dates (no time zone can shift a date
 * by a day there); only the step from a date to an instant looks at Berlin,
 * and it checks its answer, so the day of a clock change is 23 or 25 hours
 * long rather than 24.
 */

const DAY_MS = 86_400_000

const berlinParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: ANALYTICS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

const readBerlin = (instant: Date): { date: string; time: string } => {
  const parts = berlinParts.formatToParts(instant)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'

  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  }
}

/** Today's date on a Berlin wall calendar. */
export const berlinToday = (now: Date): string => readBerlin(now).date

const toUtcDay = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]

  return Date.UTC(year, month - 1, day)
}

const fromUtcDay = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export const addDays = (date: string, days: number): string => fromUtcDay(toUtcDay(date) + days * DAY_MS)

/** Both ends included. */
export const daysBetween = (from: string, to: string): number =>
  Math.round((toUtcDay(to) - toUtcDay(from)) / DAY_MS) + 1

/**
 * The instant a Berlin day begins. Midnight always exists in Berlin — the
 * clocks change at 02:00 and 03:00 — so exactly one of the two offsets Berlin
 * uses gives it.
 */
export const berlinMidnight = (date: string): Date => {
  const wall = toUtcDay(date)

  for (const offsetHours of [1, 2]) {
    const candidate = new Date(wall - offsetHours * 3_600_000)
    const seen = readBerlin(candidate)

    if (seen.date === date && seen.time === '00:00') return candidate
  }

  // Unreachable for Europe/Berlin; stated so a future zone change fails loud.
  throw new Error(`Could not place midnight of ${date} in ${ANALYTICS_TIME_ZONE}`)
}

/** Longer periods read better in fewer, larger buckets. */
const autoBucket = (days: number): AnalyticsBucket =>
  days <= 92 ? 'day' : days <= 366 ? 'week' : 'month'

const fieldError = (field: string, message: string) =>
  validationFailed(message, { issues: [{ field, message }], missing: [] })

export const resolvePeriod = (query: PeriodQuery, now: Date): AnalyticsPeriod => {
  const today = berlinToday(now)
  let from: string
  let to: string
  let preset: AnalyticsPeriod['preset']

  if (query.from !== undefined && query.to !== undefined) {
    from = query.from
    to = query.to
    preset = 'custom'

    if (from < EARLIEST_ANALYTICS_DATE) {
      throw fieldError('from', `Choose a date from ${EARLIEST_ANALYTICS_DATE} onwards`)
    }
    if (to > today) throw fieldError('to', 'The period cannot end after today')
    if (from > to) throw fieldError('from', 'The period must start on or before its last day')
    if (daysBetween(from, to) > MAX_CUSTOM_DAYS) {
      throw fieldError('to', 'A custom period can cover at most two years')
    }
  } else {
    preset = query.period === undefined || query.period === 'custom' ? DEFAULT_ANALYTICS_PRESET : query.period
    to = today
    from = addDays(today, -(PRESET_DAYS[preset] - 1))
  }

  const days = daysBetween(from, to)
  const previousTo = addDays(from, -1)
  const previousFrom = addDays(previousTo, -(days - 1))

  return {
    preset,
    from,
    to,
    days,
    start: berlinMidnight(from).toISOString(),
    end: berlinMidnight(addDays(to, 1)).toISOString(),
    bucket: query.bucket ?? autoBucket(days),
    timezone: ANALYTICS_TIME_ZONE,
    previous: {
      from: previousFrom,
      to: previousTo,
      start: berlinMidnight(previousFrom).toISOString(),
      end: berlinMidnight(from).toISOString(),
    },
  }
}

/** The first day of the bucket a date falls in, never before the period. */
export const bucketOf = (date: string, bucket: AnalyticsBucket, floor: string): string => {
  let start = date

  if (bucket === 'week') {
    const weekday = (new Date(toUtcDay(date)).getUTCDay() + 6) % 7 // Monday = 0

    start = addDays(date, -weekday)
  } else if (bucket === 'month') {
    start = `${date.slice(0, 7)}-01`
  }

  return start < floor ? floor : start
}

/** Every bucket in the period, in order, each starting at zero. */
export const emptyBuckets = (period: Pick<AnalyticsPeriod, 'from' | 'to' | 'bucket'>): string[] => {
  const keys: string[] = []

  for (let date = period.from; date <= period.to; date = addDays(date, 1)) {
    const key = bucketOf(date, period.bucket, period.from)

    if (keys[keys.length - 1] !== key) keys.push(key)
  }

  return keys
}
