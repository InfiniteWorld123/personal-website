import { type ReactNode, createContext, useContext, useId, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Info, Plug } from 'lucide-react'
import type {
  AnalyticsBreakdown,
  AnalyticsMetric,
  AnalyticsRankingResponse,
  MetricState,
} from '#/backend2/contracts/analytics.contract'
import type { AnalyticsPeriodPreset } from '#/frontend/features/analytics-v2/analytics-search'
import {
  PERIOD_BEFORE,
  SCOPE_LABEL,
  STATE_CHIP,
  STATE_VALUE,
  formatDelta,
  formatMoney,
  formatValue,
  moneyDelta,
  sourceName,
} from '#/frontend/features/analytics-v2/format'
import { cn } from '#/frontend/lib/utils'

/**
 * The pieces every Analytics card is built from, as approved in the Design
 * Lab (24 Sep 2026): a title, a state chip when the figure is not a number,
 * a Table toggle, and an ⓘ that says exactly what is counted and where it
 * comes from — taken from the API, never written twice.
 *
 * A figure that is not `ready` never shows a number: "Not connected", "Not
 * available yet", "Could not load" and "Nothing to measure" each say so in
 * words, with the API's own reason underneath.
 */

/* ------------------------------------------------------------------ context */

export type SectionContext = {
  period: AnalyticsPeriodPreset
  /** Re-reads the section this card belongs to. */
  retry: () => void
}

const SectionCtx = createContext<SectionContext>({ period: '30d', retry: () => {} })

export const SectionProvider = SectionCtx.Provider
export const useSectionContext = () => useContext(SectionCtx)

/* -------------------------------------------------------------------- links */

/**
 * A Dashboard link from the API (`/dashboard/leads?view=won`). The router's
 * `to` is typed to known routes; these come from the server, so the path and
 * its query are split and handed over as they are.
 */
export function ModuleLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  if (!href.startsWith('/dashboard')) return null

  const [path, queryText] = href.split('?')
  const search = Object.fromEntries(new URLSearchParams(queryText ?? ''))

  return (
    <Link
      to={path as never}
      search={search as never}
      className={cn('text-[12px] font-semibold text-[var(--dash-blue-ink)] hover:underline', className)}
    >
      {children}
    </Link>
  )
}

/* -------------------------------------------------------------------- state */

type Unready = Exclude<MetricState, 'ready'>

const CHIP_CLASS: Record<Unready, string> = {
  empty: 'bg-[var(--dash-chip)] text-[var(--dash-quiet)]',
  'not-connected': 'bg-[var(--dash-chip)] text-[var(--dash-quiet)]',
  'not-built': 'border border-dashed border-[var(--dash-line)] text-[var(--dash-quiet)]',
  error: 'dash-tone-red',
}

export function StateChip({ state }: { state: MetricState }) {
  if (state === 'ready') return null

  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center rounded-[5px] px-[7px] text-[10.5px] font-bold tracking-[0.06em] whitespace-nowrap',
        CHIP_CLASS[state],
      )}
    >
      {STATE_CHIP[state]}
    </span>
  )
}

/** What stands where a chart or number would be, when there is none. */
export function StateBody({ state, message }: { state: Unready; message?: string }) {
  const { retry } = useSectionContext()

  return (
    <div className="flex flex-col items-start gap-1.5 py-2" role={state === 'error' ? 'alert' : undefined}>
      <p
        className={cn(
          'text-[15px] font-semibold',
          state === 'error' ? 'text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]',
        )}
      >
        {STATE_VALUE[state]}
      </p>
      {message ? <p className="max-w-[60ch] text-[12.5px] text-[var(--dash-quiet)]">{message}</p> : null}
      {state === 'error' ? (
        <button type="button" className="dash-btn dash-btn-quiet mt-1 h-8 text-[12px]" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- definition */

type Definable = Pick<AnalyticsMetric, 'key' | 'label' | 'description' | 'scope' | 'source' | 'notes' | 'message'> & {
  rate?: AnalyticsMetric['rate']
}

function Definition({ id, figures }: { id: string; figures: Definable[] }) {
  return (
    <div
      id={id}
      className="flex flex-col gap-2 rounded-lg bg-[var(--dash-furniture)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--dash-quiet)]"
    >
      {figures.map((figure) => (
        <div key={figure.key}>
          <p>
            <b className="text-[var(--dash-ink)]">{figure.label}.</b> {figure.description}
          </p>
          {figure.rate ? (
            <p>
              <b className="text-[var(--dash-ink)]">Worked out as</b> {figure.rate.numeratorLabel} ÷{' '}
              {figure.rate.denominatorLabel}.
            </p>
          ) : null}
          <p>
            <b className="text-[var(--dash-ink)]">Covers</b> {SCOPE_LABEL[figure.scope]} ·{' '}
            <b className="text-[var(--dash-ink)]">Source</b> {sourceName(figure.source)}
          </p>
          {figure.notes?.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      ))}
    </div>
  )
}

/* --------------------------------------------------------------------- card */

export const SPAN = {
  full: 'col-span-12',
  wide: 'col-span-12 @5xl:col-span-8',
  narrow: 'col-span-12 @5xl:col-span-4',
  half: 'col-span-12 @3xl:col-span-6',
} as const

export function AnalyticsCard({
  title,
  sub,
  figures,
  state = 'ready',
  message,
  table,
  span = 'half',
  children,
}: {
  title: string
  sub?: ReactNode
  /** Every figure the card shows; their definitions fill the ⓘ. */
  figures: Definable[]
  /** Set when the card as a whole has no number to show. */
  state?: MetricState
  message?: string
  /** The same numbers as a table. Offered only while there is something to tabulate. */
  table?: ReactNode
  span?: keyof typeof SPAN
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [asTable, setAsTable] = useState(false)
  const headingId = useId()
  const definitionId = useId()
  const canTable = state === 'ready' && table !== undefined

  return (
    <section
      aria-labelledby={headingId}
      className={cn('dash-panel @container flex min-w-0 flex-col gap-2.5 px-4 py-3.5', SPAN[span])}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-[13px] font-bold">
          {title}
        </h2>
        <span className="flex items-center gap-1">
          <StateChip state={state} />
          {canTable ? (
            <button
              type="button"
              aria-pressed={asTable}
              aria-label={`${asTable ? 'Chart' : 'Table'} view of ${title}`}
              className={cn(
                'h-[26px] rounded-[7px] px-2 text-[11.5px] font-semibold text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]',
                asTable && 'bg-[var(--dash-chip)] text-[var(--dash-ink)]',
              )}
              onClick={() => setAsTable((value) => !value)}
            >
              {asTable ? 'Chart' : 'Table'}
            </button>
          ) : null}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={open ? definitionId : undefined}
            aria-label={`What ${title} counts`}
            className="grid size-6 place-items-center rounded-md text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]"
            onClick={() => setOpen((value) => !value)}
          >
            <Info className="size-3.5" aria-hidden="true" />
          </button>
        </span>
      </div>
      {sub ? <p className="-mt-1.5 text-[12px] text-[var(--dash-quiet)]">{sub}</p> : null}
      {open ? <Definition id={definitionId} figures={figures} /> : null}
      {state !== 'ready' ? <StateBody state={state} message={message} /> : canTable && asTable ? table : children}
    </section>
  )
}

/* ------------------------------------------------------------------ figures */

/** "+18% vs the 30 days before" — a neutral chip; colour never judges the change. */
export function Delta({ text, period }: { text: string | null; period: AnalyticsPeriodPreset }) {
  if (!text) return null

  return (
    <span className="inline-flex rounded-[5px] bg-[var(--dash-chip)] px-1.5 py-px text-[11.5px] font-semibold text-[var(--dash-quiet)] tabular-nums">
      {text} vs {PERIOD_BEFORE[period]}
    </span>
  )
}

export const metricDelta = (metric: AnalyticsMetric): string | null =>
  metric.state === 'ready' && metric.value !== null && metric.previous
    ? formatDelta(metric.value, metric.previous.value)
    : null

/** The value of one figure as text, or `null` when it has none (see `StateBody`). */
export const metricText = (metric: AnalyticsMetric): string | null => {
  if (metric.state !== 'ready') return null

  if (metric.unit === 'money') {
    const amounts = metric.amounts ?? []

    // No currency had any: a checked zero, not a guess at which currency it would have been.
    return amounts.length === 0 ? '0' : amounts.map((amount) => formatMoney(amount)).join(' · ')
  }

  return formatValue(metric.unit, metric.value)
}

/**
 * One figure inside a card: a big value and its label, or its state in
 * words. Used where a card holds several small figures side by side.
 */
export function Figure({
  metric,
  label,
  tone,
  detail,
}: {
  metric: AnalyticsMetric
  label?: string
  tone?: 'late'
  /** A secondary line under the value, above the comparison and link. */
  detail?: ReactNode
}) {
  const { period } = useSectionContext()

  if (metric.state !== 'ready') {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[12px] text-[var(--dash-quiet)]">{label ?? metric.label}</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={cn('text-[15px] font-semibold', metric.state === 'error' ? 'text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]')}>
            {STATE_VALUE[metric.state]}
          </span>
        </span>
        {metric.message ? <span className="text-[11.5px] leading-snug text-[var(--dash-quiet)]">{metric.message}</span> : null}
      </div>
    )
  }

  const money = metric.unit === 'money'
  const amounts = metric.amounts ?? []

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] text-[var(--dash-quiet)]">{label ?? metric.label}</span>
      {money ? (
        <span className="flex flex-col">
          {amounts.length === 0 ? (
            <b className="dash-figure text-[26px]">{metricText(metric)}</b>
          ) : (
            amounts.map((amount) => (
              <b key={amount.currency} className="dash-figure text-[26px]">
                {formatMoney(amount)}
              </b>
            ))
          )}
        </span>
      ) : (
        <b className={cn('dash-figure text-[26px]', tone === 'late' && (metric.value ?? 0) > 0 && 'text-[var(--dash-red-ink)]')}>
          {metricText(metric)}
        </b>
      )}
      {detail ? <span className="text-[12px] text-[var(--dash-quiet)] tabular-nums">{detail}</span> : null}
      <span className="flex flex-wrap items-center gap-1.5">
        {money
          ? amounts.map((amount) => (
              <Delta key={amount.currency} text={withCurrency(moneyDelta(metric, amount.currency), amount.currency, amounts.length)} period={period} />
            ))
          : <Delta text={metricDelta(metric)} period={period} />}
        {metric.link ? <ModuleLink href={metric.link}>Open</ModuleLink> : null}
      </span>
    </div>
  )
}

const withCurrency = (text: string | null, currency: string, count: number) =>
  text === null ? null : count > 1 ? `${currency} ${text}` : text

/** Several figures in a row, two per line on a phone. */
export function FigureGrid({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-4 gap-y-4',
        columns === 3 && '@2xl:grid-cols-3',
        columns === 4 && '@2xl:grid-cols-4',
      )}
    >
      {children}
    </div>
  )
}

/** The combined state of several figures: shared only when every one agrees. */
export const sharedState = (figures: Array<AnalyticsMetric | AnalyticsBreakdown | undefined>): MetricState => {
  const present = figures.filter((figure): figure is AnalyticsMetric | AnalyticsBreakdown => figure !== undefined)

  if (present.length === 0) return 'ready'

  const first = present[0]!.state

  return first !== 'ready' && present.every((figure) => figure.state === first) ? first : 'ready'
}

/* ----------------------------------------------------------- not connected */

export function NotConnectedBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="col-span-12 flex items-start gap-3.5 rounded-xl border border-dashed border-[var(--dash-line)] p-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-[var(--dash-chip)] text-[var(--dash-quiet)]">
        <Plug className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="mb-1 text-sm font-semibold">{title}</h2>
        <div className="flex max-w-[64ch] flex-col gap-1.5 text-[12.5px] leading-relaxed text-[var(--dash-quiet)]">
          {children}
        </div>
      </div>
    </div>
  )
}

/** A ranking answer as the ⓘ reads it. */
export const rankingDefinable = (ranking: AnalyticsRankingResponse): Definable => ({
  key: ranking.key,
  label: ranking.label,
  description: ranking.description,
  scope: ranking.scope,
  source: ranking.source,
  notes: ranking.notes,
})
