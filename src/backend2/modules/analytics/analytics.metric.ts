import {
  ANALYTICS_TIME_ZONE,
  type AnalyticsBreakdown,
  type AnalyticsGroup,
  type AnalyticsMetric,
  type AnalyticsPeriod,
  type AnalyticsRanking,
  type BreakdownItem,
  type MetricScope,
  type MetricState,
  type MetricUnit,
} from '../../contracts/analytics.contract'
import { emptyBuckets } from './analytics.period'

/**
 * How a figure becomes a response, and how a failure stays contained.
 *
 * A figure is declared once (`MetricDef`), then either filled from its
 * source or marked unavailable. The declaration is what lets a failed query
 * still answer with the right key, label and meaning — the Dashboard shows
 * "temporarily unavailable" in the right place instead of a hole.
 */

export type MetricDef = {
  key: string
  label: string
  description: string
  unit: MetricUnit
  scope: MetricScope
  source: string
  link?: string
  notes?: string[]
}

export type BreakdownDef = MetricDef & { ranking?: AnalyticsRanking }

export type BuildContext = { asOf: string; period: AnalyticsPeriod }

export const UNAVAILABLE_MESSAGES = {
  error: 'This figure could not be loaded just now. Try again in a moment.',
  notConnected: 'Website statistics are not connected yet.',
} as const

const base = (def: MetricDef, ctx: BuildContext, asOf = ctx.asOf) => ({
  key: def.key,
  label: def.label,
  description: def.description,
  unit: def.unit,
  scope: def.scope,
  source: def.source,
  timezone: ANALYTICS_TIME_ZONE,
  asOf,
  ...(def.link ? { link: def.link } : {}),
  ...(def.notes && def.notes.length > 0 ? { notes: [...def.notes] } : {}),
})

type MetricExtras = Pick<AnalyticsMetric, 'previous' | 'series' | 'rate' | 'amounts' | 'notes'> & {
  asOf?: string
}

const previousOf = (ctx: BuildContext, value: number | null): AnalyticsMetric['previous'] => ({
  value,
  from: ctx.period.previous.from,
  to: ctx.period.previous.to,
})

/** A figure the source answered. A zero here is a real, checked zero. */
export const readyMetric = (
  def: MetricDef,
  ctx: BuildContext,
  value: number,
  extras: Omit<MetricExtras, 'previous'> & { previous?: number } = {},
): AnalyticsMetric => {
  const { previous, asOf, notes, ...rest } = extras
  const metric: AnalyticsMetric = { ...base(def, ctx, asOf), state: 'ready', value, ...rest }

  if (previous !== undefined) metric.previous = previousOf(ctx, previous)
  if (notes && notes.length > 0) metric.notes = [...(metric.notes ?? []), ...notes]

  return metric
}

/** Not a number: `error`, `not-built`, `not-connected` or `empty`. */
export const unavailableMetric = (
  def: MetricDef,
  ctx: BuildContext,
  state: Exclude<MetricState, 'ready'>,
  message: string,
): AnalyticsMetric => ({ ...base(def, ctx), state, value: null, message })

/**
 * A rate: numerator over denominator, with both exposed. No denominator is
 * `empty` — "0 %" would claim an outcome that never happened.
 */
export const rateMetric = (
  def: MetricDef,
  ctx: BuildContext,
  input: {
    numerator: number
    denominator: number
    numeratorLabel: string
    denominatorLabel: string
    previous?: { numerator: number; denominator: number }
    emptyMessage: string
  },
): AnalyticsMetric => {
  const rate = {
    numerator: input.numerator,
    denominator: input.denominator,
    numeratorLabel: input.numeratorLabel,
    denominatorLabel: input.denominatorLabel,
  }
  const previous = input.previous
    ? previousOf(
        ctx,
        input.previous.denominator > 0 ? input.previous.numerator / input.previous.denominator : null,
      )
    : undefined

  if (input.denominator === 0) {
    return {
      ...base(def, ctx),
      state: 'empty',
      value: null,
      message: input.emptyMessage,
      rate,
      ...(previous ? { previous } : {}),
    }
  }

  return {
    ...base(def, ctx),
    state: 'ready',
    value: input.numerator / input.denominator,
    rate,
    ...(previous ? { previous } : {}),
  }
}

/** A distribution. Nothing to distribute is `empty`, not a pie of zeros. */
export const readyBreakdown = (
  def: BreakdownDef,
  ctx: BuildContext,
  input: { items: BreakdownItem[]; total: number; truncated?: boolean; emptyMessage: string },
): AnalyticsBreakdown => {
  const common = {
    ...base(def, ctx),
    ...(def.ranking ? { ranking: def.ranking } : {}),
  }

  if (input.total === 0) {
    return {
      ...common,
      state: 'empty',
      message: input.emptyMessage,
      total: 0,
      items: input.items,
      truncated: false,
    }
  }

  return {
    ...common,
    state: 'ready',
    total: input.total,
    items: input.items,
    truncated: input.truncated ?? false,
  }
}

export const unavailableBreakdown = (
  def: BreakdownDef,
  ctx: BuildContext,
  state: Exclude<MetricState, 'ready' | 'empty'>,
  message: string,
): AnalyticsBreakdown => ({
  ...base(def, ctx),
  ...(def.ranking ? { ranking: def.ranking } : {}),
  state,
  message,
  total: null,
  items: [],
  truncated: false,
})

/** Rows grouped by bucket in SQL, laid over every bucket of the period. */
export const fillSeries = (
  period: AnalyticsPeriod,
  rows: Array<{ bucket: string; value: number | string }>,
): { bucket: AnalyticsPeriod['bucket']; points: Array<{ date: string; value: number }> } => {
  const found = new Map(rows.map((row) => [row.bucket, Number(row.value)]))

  return {
    bucket: period.bucket,
    points: emptyBuckets(period).map((date) => ({ date, value: found.get(date) ?? 0 })),
  }
}

export const toNumber = (value: unknown): number => {
  const number = Number(value ?? 0)

  return Number.isFinite(number) ? number : 0
}

/* -------------------------------------------------------------- isolation */

/**
 * One independently failing piece of a group: the figures it declares, how
 * it reads its source, and how the answer becomes figures.
 */
export type Part<T = unknown> = {
  metrics: MetricDef[]
  breakdowns?: BreakdownDef[]
  load: () => Promise<T>
  build: (data: T) => { metrics?: AnalyticsMetric[]; breakdowns?: AnalyticsBreakdown[] }
}

export const part = <T>(input: Part<T>): Part => input as unknown as Part

/**
 * The shape of the failure is logged, never its message: a database error
 * can quote a row, and a provider error can quote a URL.
 */
export const logFailure = (source: string, error: unknown): void => {
  const code =
    typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : undefined

  console.error('Backend2 analytics source failed', { source, code })
}

/**
 * Runs each part on its own. A part that throws turns its own figures into
 * `error` and leaves every other part's figures exactly as they were.
 *
 * One at a time, never `Promise.all`: every repository in Backend2 runs one
 * statement at a time on the connection it was given.
 */
export const runParts = async (
  ctx: BuildContext,
  parts: Part[],
): Promise<{ metrics: AnalyticsMetric[]; breakdowns: AnalyticsBreakdown[] }> => {
  const metrics: AnalyticsMetric[] = []
  const breakdowns: AnalyticsBreakdown[] = []

  for (const piece of parts) {
    let built: ReturnType<Part['build']>

    try {
      built = piece.build(await piece.load())
    } catch (error) {
      logFailure(piece.metrics[0]?.source ?? piece.breakdowns?.[0]?.source ?? 'unknown', error)

      built = {
        metrics: piece.metrics.map((def) =>
          unavailableMetric(def, ctx, 'error', UNAVAILABLE_MESSAGES.error),
        ),
        breakdowns: (piece.breakdowns ?? []).map((def) =>
          unavailableBreakdown(def, ctx, 'error', UNAVAILABLE_MESSAGES.error),
        ),
      }
    }

    metrics.push(...(built.metrics ?? []))
    breakdowns.push(...(built.breakdowns ?? []))
  }

  return { metrics, breakdowns }
}

export const group = async (
  ctx: BuildContext,
  input: { key: string; label: string; source: string; notes?: string[]; parts: Part[] },
): Promise<AnalyticsGroup> => {
  const { metrics, breakdowns } = await runParts(ctx, input.parts)

  return {
    key: input.key,
    label: input.label,
    source: input.source,
    metrics,
    breakdowns,
    notes: input.notes ?? [],
  }
}
