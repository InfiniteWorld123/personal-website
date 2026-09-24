import * as v from 'valibot'

/**
 * The Analytics & Overview contract, shared by Backend2 and the Dashboard.
 * See `docs/v2/analytics.md`.
 *
 * Pure: valibot and plain TypeScript. Every figure is read-only and
 * owner-only; a response carries aggregates and labels, never a Lead, a
 * Client, an email or an appointment.
 *
 * The vocabulary the Dashboard renders:
 *
 * - **state** says whether a number can be trusted, and why not:
 *   - `ready` — the source was checked. `value: 0` is a real zero.
 *   - `empty` — the source was checked and there is nothing to measure yet:
 *     a rate with no denominator, a breakdown or ranking with no rows. The
 *     value is `null`, never a made-up 0 %.
 *   - `not-connected` — an outside provider (PostHog) is not configured.
 *   - `not-built` — the module that owns this figure does not exist yet.
 *   - `error` — the source failed just now. Only that figure is affected;
 *     its value is `null`, never 0.
 * - **scope** says what the value covers: the selected `period`, the
 *   `current` state right now, the `next-7-days` from now, or `all-time`
 *   running totals the module keeps without dates (Blog reads and likes).
 */

export const ANALYTICS_TIME_ZONE = 'Europe/Berlin' as const

export const ANALYTICS_PRESETS = ['7d', '30d', '90d', '365d'] as const
export type AnalyticsPreset = (typeof ANALYTICS_PRESETS)[number]
export const DEFAULT_ANALYTICS_PRESET: AnalyticsPreset = '30d'

export const PRESET_DAYS: Record<AnalyticsPreset, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '365d': 365,
}

/** A custom period may cover at most two years, both ends included. */
export const MAX_CUSTOM_DAYS = 731
/** Nothing in V2 is older than this; an earlier date is a typo. */
export const EARLIEST_ANALYTICS_DATE = '2020-01-01'

export const ANALYTICS_BUCKETS = ['day', 'week', 'month'] as const
export type AnalyticsBucket = (typeof ANALYTICS_BUCKETS)[number]

export const ANALYTICS_SECTIONS = ['website', 'sales', 'operations', 'money', 'assistant'] as const
export type AnalyticsSection = (typeof ANALYTICS_SECTIONS)[number]

export const ANALYTICS_RANKINGS = [
  'lead-sources',
  'lead-lost-reasons',
  'blog-posts',
  'website-pages',
] as const
export type AnalyticsRanking = (typeof ANALYTICS_RANKINGS)[number]

/** Which Leads a Sales figure counts. See `LEAD_ORIGIN_NOTE`. */
export const LEAD_ORIGINS = ['all', 'manual', 'imported'] as const
export type LeadOrigin = (typeof LEAD_ORIGINS)[number]

export const BLOG_RANKING_MEASURES = ['reads', 'likes', 'comments'] as const
export type BlogRankingMeasure = (typeof BLOG_RANKING_MEASURES)[number]

/* ------------------------------------------------------------------ queries */

const IsoDateSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use a date like 2026-09-23'),
  v.check((value) => {
    const [year, month, day] = value.split('-').map(Number) as [number, number, number]
    const date = new Date(Date.UTC(year, month - 1, day))

    return (
      date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    )
  }, 'That date does not exist'),
)

/**
 * The period every Analytics request selects. A preset, or `from` and `to`
 * together as Berlin calendar dates, both included.
 *
 * Checked here for shape only; `resolvePeriod` checks the span against
 * today's date, which only the server knows.
 */
export const PeriodQuerySchema = v.pipe(
  v.object({
    period: v.optional(v.picklist([...ANALYTICS_PRESETS, 'custom'], 'Choose 7d, 30d, 90d, 365d or custom')),
    from: v.optional(IsoDateSchema),
    to: v.optional(IsoDateSchema),
    bucket: v.optional(v.picklist(ANALYTICS_BUCKETS, 'Choose day, week or month')),
  }),
  v.forward(
    v.check(
      (input) => (input.from === undefined) === (input.to === undefined),
      'Send both from and to, or neither',
    ),
    ['from'],
  ),
  v.forward(
    v.check(
      (input) => input.from === undefined || input.period === undefined || input.period === 'custom',
      'A preset period cannot be combined with from and to',
    ),
    ['period'],
  ),
  v.forward(
    v.check(
      (input) => input.period !== 'custom' || input.from !== undefined,
      'A custom period needs from and to',
    ),
    ['from'],
  ),
)

export type PeriodQuery = v.InferOutput<typeof PeriodQuerySchema>

export const SalesFilterSchema = v.object({
  origin: v.optional(v.picklist(LEAD_ORIGINS, 'Choose all, manual or imported'), 'all'),
})

export const BlogRankingFilterSchema = v.object({
  by: v.optional(v.picklist(BLOG_RANKING_MEASURES, 'Choose reads, likes or comments'), 'reads'),
})

/* ---------------------------------------------------------------- responses */

export type MetricState = 'ready' | 'empty' | 'not-connected' | 'not-built' | 'error'
export type MetricScope = 'period' | 'current' | 'next-7-days' | 'last-90-days' | 'all-time'
/**
 * `ratio` is 0–1, never a pre-multiplied percentage. `money` carries its
 * value in `amounts`, one entry per currency in minor units (cents), because
 * EUR and USD are never added together without a reviewed rule.
 */
export type MetricUnit = 'count' | 'bytes' | 'ratio' | 'money'

export type CurrencyAmount = { currency: string; minor: number }

export type AnalyticsPeriod = {
  preset: AnalyticsPreset | 'custom'
  /** Berlin calendar dates, both included. */
  from: string
  to: string
  days: number
  /** The instants the dates mean in Berlin: `start` included, `end` excluded. */
  start: string
  end: string
  bucket: AnalyticsBucket
  timezone: typeof ANALYTICS_TIME_ZONE
  /** The same number of days immediately before, for comparisons. */
  previous: { from: string; to: string; start: string; end: string }
}

export type SeriesPoint = { date: string; value: number }

export type AnalyticsMetric = {
  key: string
  label: string
  /** What the number means, in plain English, for the Dashboard's help text. */
  description: string
  unit: MetricUnit
  scope: MetricScope
  state: MetricState
  /** `null` whenever state is not `ready`, and for `money` (see `amounts`). */
  value: number | null
  /** Where the number comes from, e.g. `backend2.leads` or `posthog`. */
  source: string
  timezone: typeof ANALYTICS_TIME_ZONE
  /** When the source was read. Older than the request when a provider is cached. */
  asOf: string
  /** Why a figure is unavailable, in plain English. */
  message?: string
  /** Caveats the owner should see beside the figure. */
  notes?: string[]
  /** The Dashboard page that shows the records behind it. */
  link?: string
  rate?: {
    numerator: number
    denominator: number
    numeratorLabel: string
    denominatorLabel: string
  }
  /** The same measure over the previous period of equal length. */
  previous?: { value: number | null; amounts?: CurrencyAmount[]; from: string; to: string }
  series?: { bucket: AnalyticsBucket; points: SeriesPoint[] }
  amounts?: CurrencyAmount[]
}

export type BreakdownItem = { key: string; label: string; value: number }

export type AnalyticsBreakdown = {
  key: string
  label: string
  description: string
  unit: MetricUnit
  scope: MetricScope
  state: MetricState
  source: string
  timezone: typeof ANALYTICS_TIME_ZONE
  asOf: string
  message?: string
  notes?: string[]
  /** The sum of every item, including any not returned. `null` unless ready. */
  total: number | null
  items: BreakdownItem[]
  /** True when more items exist than were returned; see `ranking`. */
  truncated: boolean
  /** The ranking that lists every item, page by page. */
  ranking?: AnalyticsRanking
}

export type AnalyticsGroup = {
  key: string
  label: string
  source: string
  metrics: AnalyticsMetric[]
  breakdowns: AnalyticsBreakdown[]
  notes: string[]
}

export type AnalyticsSectionResponse = {
  section: AnalyticsSection
  label: string
  period: AnalyticsPeriod
  filters: Record<string, string>
  asOf: string
  timezone: typeof ANALYTICS_TIME_ZONE
  groups: AnalyticsGroup[]
}

export type AnalyticsOverviewResponse = {
  period: AnalyticsPeriod
  asOf: string
  timezone: typeof ANALYTICS_TIME_ZONE
  /** The four headline ideas: money received, overdue invoices, visitors, unread Inbox. */
  headline: AnalyticsMetric[]
  /** A compact, actionable glimpse: what needs the owner now. */
  glimpse: AnalyticsMetric[]
  /** The charts of the approved Overview (Design Lab Direction A, 24 Sep 2026). */
  board: OverviewBoard
}

/**
 * What every Overview chart block says about itself — the same identity and
 * state vocabulary a metric carries, for a shape that is not one number.
 */
export type AnalyticsBlockMeta = {
  key: string
  label: string
  description: string
  source: string
  state: MetricState
  timezone: typeof ANALYTICS_TIME_ZONE
  asOf: string
  message?: string
  notes?: string[]
  link?: string
}

/** One currency's money per Berlin calendar month, in minor units, net of refunds. */
export type MonthlyMoneyCurrency = {
  currency: string
  /** Paid invoices that belong to no subscription. */
  oneOff: number[]
  /** Paid invoices a subscription produced. */
  subscription: number[]
  total: number[]
}

/**
 * Money received per Berlin calendar month: the twelve months ending with
 * the current one, oldest first. The current month is the month so far.
 */
export type MonthlyMoneyBlock = AnalyticsBlockMeta & {
  /** First day of each month, `YYYY-MM-01`, oldest first; the last is this month. */
  months: string[]
  /** One entry per currency that has any money in these months. Never added together. */
  currencies: MonthlyMoneyCurrency[]
}

export const HEATMAP_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
/** Berlin time slots, start hour included and end hour excluded. */
export const HEATMAP_SLOTS = [
  { label: '00–06', from: 0, to: 6 },
  { label: '06–09', from: 6, to: 9 },
  { label: '09–12', from: 9, to: 12 },
  { label: '12–15', from: 12, to: 15 },
  { label: '15–18', from: 15, to: 18 },
  { label: '18–21', from: 18, to: 21 },
  { label: '21–24', from: 21, to: 24 },
] as const

/** Visits by Berlin weekday (rows, Monday first) and time slot (columns). */
export type VisitHeatmapBlock = AnalyticsBlockMeta & {
  weekdays: string[]
  slots: string[]
  /** `cells[weekday][slot]`; empty unless ready. */
  cells: number[][]
  /** Every visit counted in the grid. `null` unless ready. */
  total: number | null
}

export type OverviewBoard = {
  receivedByMonth: MonthlyMoneyBlock
  /** `invoices.outstanding` (count, with the open balance per currency). */
  outstanding: AnalyticsMetric
  /** `invoices.paidOnTime`: a rate over the last 90 days. */
  paidOnTime: AnalyticsMetric
  visitsHeatmap: VisitHeatmapBlock
  /**
   * From visitor to paid, in the Overview's period, each step counted on its
   * own: `website.visitors`, `inbox.new`, `booking.made`, `clients.new`,
   * `invoices.paidInFull`. Not a cohort — the same people are not followed.
   */
  funnel: AnalyticsMetric[]
}

export type RankingItem = { rank: number; key: string; label: string; value: number }

export type AnalyticsRankingResponse = {
  key: AnalyticsRanking
  label: string
  description: string
  unit: MetricUnit
  scope: MetricScope
  state: MetricState
  source: string
  timezone: typeof ANALYTICS_TIME_ZONE
  asOf: string
  message?: string
  notes?: string[]
  period: AnalyticsPeriod
  filters: Record<string, string>
  items: RankingItem[]
  page: number
  pageSize: number
  total: number
  pageCount: number
  hasMore: boolean
}

/* ----------------------------------------------------------------- captions */

export const SECTION_LABELS: Record<AnalyticsSection, string> = {
  website: 'Website & content',
  sales: 'Sales & relationships',
  operations: 'Operations',
  money: 'Money',
  assistant: 'Public AI assistant',
}

/**
 * The CSV-import provenance caveat. A Lead remembers its import only while
 * the owner keeps that import's report: deleting the report clears the link
 * (`0011_leads.sql`, ON DELETE SET NULL), and those Leads then count as
 * entered by hand.
 */
export const LEAD_ORIGIN_NOTE =
  'Imported means the Lead came from a CSV import whose report is still kept. ' +
  'Deleting an import report makes its Leads count as entered by hand.'
