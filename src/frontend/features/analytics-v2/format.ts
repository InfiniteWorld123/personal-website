import type {
  AnalyticsBucket,
  AnalyticsMetric,
  CurrencyAmount,
  MetricScope,
  MetricState,
  MetricUnit,
} from '#/backend2/contracts/analytics.contract'
import type { AnalyticsPeriodPreset } from './analytics-search'

/**
 * How Analytics figures read on screen. English only, Berlin dates.
 *
 * Pure functions, so the rules are tested without rendering: a `null` value
 * never becomes a zero, money is never added across currencies, and a date
 * from the API (a Berlin calendar date) is never shifted by the browser's own
 * time zone.
 */

const TIME_ZONE = 'Europe/Berlin'

const integer = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 })

export const formatCount = (value: number): string => integer.format(value)

/** A 0–1 ratio as a whole percentage, or one decimal under 10 %. */
export const formatRatio = (value: number): string => {
  const percent = value * 100

  return `${percent > 0 && percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

export const formatBytes = (bytes: number): string => {
  let value = bytes
  let unit = 0

  while (value >= 1000 && unit < BYTE_UNITS.length - 1) {
    value /= 1000
    unit += 1
  }

  return `${unit === 0 || value >= 100 ? Math.round(value) : value.toFixed(1)} ${BYTE_UNITS[unit]}`
}

/** One currency, from minor units. Never combined with another currency. */
export const formatMoney = (amount: CurrencyAmount, options: { cents?: boolean } = {}): string => {
  const cents = options.cents ?? true

  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: amount.currency,
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    }).format(amount.minor / 100)
  } catch {
    // An unexpected currency code still reads honestly.
    return `${(amount.minor / 100).toFixed(cents ? 2 : 0)} ${amount.currency}`
  }
}

/** A figure's value as text, by its unit. `null` is never shown as a number. */
export const formatValue = (unit: MetricUnit, value: number | null): string | null => {
  if (value === null) return null
  if (unit === 'ratio') return formatRatio(value)
  if (unit === 'bytes') return formatBytes(value)

  return formatCount(value)
}

/**
 * The change against the previous period, as a neutral sentence part.
 * Colour never says whether it is good: more no-shows is "up", not green.
 */
export const formatDelta = (current: number, previous: number | null | undefined): string | null => {
  if (previous === null || previous === undefined) return null
  if (previous === 0 && current === 0) return 'No change'
  if (previous === 0) return `Up from 0`

  const change = Math.round(((current - previous) / previous) * 100)

  if (change === 0) return 'No change'

  return `${change > 0 ? '+' : '−'}${Math.abs(change)}%`
}

/** The money delta for one currency, matched by currency and never across. */
export const moneyDelta = (metric: AnalyticsMetric, currency: string): string | null => {
  const current = metric.amounts?.find((amount) => amount.currency === currency)?.minor ?? 0
  const previous = metric.previous?.amounts?.find((amount) => amount.currency === currency)?.minor

  if (!metric.previous?.amounts) return null

  return formatDelta(current, previous ?? 0)
}

/* -------------------------------------------------------------------- dates */

/** A Berlin calendar date from the API, as a UTC midnight so no browser zone moves it. */
const calendar = (isoDate: string): Date => {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number]

  return new Date(Date.UTC(year, month - 1, day))
}

const dateFormat = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' })

const DAY_MONTH = dateFormat({ day: 'numeric', month: 'short' })
const DAY_MONTH_YEAR = dateFormat({ day: 'numeric', month: 'short', year: 'numeric' })
const WEEKDAY = dateFormat({ weekday: 'short', day: 'numeric', month: 'short' })
const MONTH = dateFormat({ month: 'short' })
const MONTH_YEAR = dateFormat({ month: 'long', year: 'numeric' })
const MONTH_SHORT_YEAR = dateFormat({ month: 'short', year: 'numeric' })

/** An axis label: short, by bucket. */
export const axisDate = (isoDate: string, bucket: AnalyticsBucket): string =>
  bucket === 'month' ? MONTH.format(calendar(isoDate)) : DAY_MONTH.format(calendar(isoDate))

/** A tooltip or table label: the whole bucket, said plainly. */
export const bucketLabel = (isoDate: string, bucket: AnalyticsBucket): string => {
  if (bucket === 'month') return MONTH_YEAR.format(calendar(isoDate))
  if (bucket === 'week') return `Week of ${DAY_MONTH.format(calendar(isoDate))}`

  return WEEKDAY.format(calendar(isoDate))
}

export const tableDate = (isoDate: string, bucket: AnalyticsBucket): string =>
  bucket === 'month'
    ? MONTH_SHORT_YEAR.format(calendar(isoDate))
    : bucket === 'week'
      ? `Week of ${DAY_MONTH.format(calendar(isoDate))}`
      : WEEKDAY.format(calendar(isoDate))

/** "26 Aug – 24 Sept 2026". */
export const dateRange = (from: string, to: string): string => {
  const sameYear = from.slice(0, 4) === to.slice(0, 4)

  return `${(sameYear ? DAY_MONTH : DAY_MONTH_YEAR).format(calendar(from))} – ${DAY_MONTH_YEAR.format(calendar(to))}`
}

export const PERIOD_LABEL: Record<AnalyticsPeriodPreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '365d': 'Last 12 months',
}

export const PERIOD_SHORT: Record<AnalyticsPeriodPreset, string> = {
  '7d': '7 d',
  '30d': '30 d',
  '90d': '90 d',
  '365d': 'Year',
}

/** "vs the 30 days before". */
export const PERIOD_BEFORE: Record<AnalyticsPeriodPreset, string> = {
  '7d': 'the 7 days before',
  '30d': 'the 30 days before',
  '90d': 'the 90 days before',
  '365d': 'the year before',
}

/** A clock time in Berlin, e.g. "14:05". */
export const berlinTime = (instant: string): string =>
  new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE }).format(
    new Date(instant),
  )

/** "Thursday, 24 September", in Berlin. */
export const berlinLongDate = (now: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: TIME_ZONE,
  }).format(now)

export const greeting = (now: Date): string => {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TIME_ZONE }).format(now),
  )

  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'

  return 'Good evening'
}

/* ------------------------------------------------------------------- labels */

/** The chip a figure wears when it is not a number. `ready` wears none. */
export const STATE_CHIP: Record<Exclude<MetricState, 'ready'>, string> = {
  empty: 'NOTHING YET',
  'not-connected': 'NOT CONNECTED',
  'not-built': 'NOT AVAILABLE YET',
  error: 'COULD NOT LOAD',
}

/** What stands in the number's place. Never "0". */
export const STATE_VALUE: Record<Exclude<MetricState, 'ready'>, string> = {
  empty: 'Nothing to measure',
  'not-connected': 'Not connected',
  'not-built': 'Not available yet',
  error: 'Could not load',
}

export const SCOPE_LABEL: Record<MetricScope, string> = {
  period: 'the selected period',
  current: 'right now',
  'next-7-days': 'the next 7 days',
  'last-90-days': 'the last 90 days',
  'all-time': 'all time (a running total without dates)',
}

const SOURCE_NAMES: Record<string, string> = {
  cloudflare: 'Cloudflare Web Analytics (website statistics, cookieless)',
  posthog: 'PostHog (website statistics)',
  backend2: 'your Dashboard modules',
  'backend2.leads': 'Leads',
  'backend2.clients': 'Clients',
  'backend2.booking': 'Calendar',
  'backend2.inbox': 'Inbox',
  'backend2.media': 'Media',
  'backend2.blog': 'Blog',
  'backend2.projects': 'Projects',
  'backend2.services': 'Services',
  'backend2.contact': 'the contact form',
  'backend2.invoices': 'Invoices',
  'backend2.assistant': 'the public AI assistant',
}

export const sourceName = (source: string): string => SOURCE_NAMES[source] ?? source
