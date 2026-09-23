import { type ReactNode, useState } from 'react'
import type {
  AnalyticsBreakdown,
  AnalyticsMetric,
  AnalyticsRanking,
  BlogRankingMeasure,
  LeadOrigin,
} from '#/backend2/contracts/analytics.contract'
import { DataTable, HBars, LineChart, SplitBar } from '#/frontend/features/analytics-v2/charts'
import { formatCount, formatRatio, formatValue, tableDate } from '#/frontend/features/analytics-v2/format'
import { useRanking } from '#/frontend/features/analytics-v2/queries'
import { cn } from '#/frontend/lib/utils'
import { Pager } from '../clients/client-parts'
import {
  AnalyticsCard,
  Delta,
  type SPAN,
  StateBody,
  metricDelta,
  rankingDefinable,
  useSectionContext,
} from './analytics-cards'

/**
 * The card shapes Analytics uses: a figure over time, a rate with what it is
 * made of, a breakdown as bars (with every item a page at a time when the
 * API cut it short), and a ranking with its own pages.
 */

const RANKING_PAGE_SIZE = 10

/* ------------------------------------------------------------------- series */

export function SeriesCard({
  metric,
  title,
  name,
  span = 'wide',
  extra,
}: {
  metric: AnalyticsMetric
  title?: string
  /** What a point counts, lower case, singular and plural. */
  name: readonly [string, string]
  span?: keyof typeof SPAN
  extra?: ReactNode
}) {
  const { period } = useSectionContext()
  const series = metric.series
  const ready = metric.state === 'ready' && metric.value !== null

  return (
    <AnalyticsCard
      title={title ?? metric.label}
      figures={[metric]}
      state={metric.state}
      message={metric.message}
      span={span}
      sub={
        ready ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              <b className="text-[var(--dash-ink)] tabular-nums">{formatCount(metric.value!)}</b> in the period
            </span>
            <Delta text={metricDelta(metric)} period={period} />
            {extra}
          </span>
        ) : undefined
      }
      table={
        series ? (
          <DataTable
            caption={`${metric.label} per ${series.bucket}`}
            columns={[series.bucket === 'day' ? 'Day' : series.bucket === 'week' ? 'Week' : 'Month', metric.label]}
            rows={[...series.points].reverse().map((point) => [tableDate(point.date, series.bucket), formatCount(point.value)])}
          />
        ) : undefined
      }
    >
      {series ? <LineChart points={series.points} bucket={series.bucket} name={name} /> : null}
    </AnalyticsCard>
  )
}

/* --------------------------------------------------------------------- rate */

/**
 * A rate, always with its parts: "60% · 3 won of 5 decided". A rate with no
 * denominator is `empty` and says why, instead of showing 0 %.
 */
export function RateCard({
  metric,
  parts,
  of,
  span = 'narrow',
}: {
  metric: AnalyticsMetric
  /** The two parts the split bar shows, e.g. Won and Lost. */
  parts: Array<{ key: string; label: string; value: number }>
  /** "decided", "marked": the words after "3 won of 5". */
  of: { numerator: string; denominator: string }
  span?: keyof typeof SPAN
}) {
  const rate = metric.rate

  return (
    <AnalyticsCard
      title={metric.label}
      figures={[metric]}
      state={metric.state}
      message={metric.message}
      span={span}
      table={
        rate ? (
          <DataTable
            caption={metric.label}
            columns={['Part', 'Count']}
            rows={[
              [rate.numeratorLabel, formatCount(rate.numerator)],
              [rate.denominatorLabel, formatCount(rate.denominator)],
            ]}
          />
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <b className="dash-figure text-[34px]">{metric.value === null ? '—' : formatRatio(metric.value)}</b>
        {rate ? (
          <span className="text-[12.5px] text-[var(--dash-quiet)]">
            {formatCount(rate.numerator)} {of.numerator} of {formatCount(rate.denominator)} {of.denominator}
          </span>
        ) : null}
      </div>
      <SplitBar items={parts} label={metric.label} />
    </AnalyticsCard>
  )
}

/* ---------------------------------------------------------------- breakdown */

const share = (value: number, total: number | null) =>
  total && total > 0 ? `${Math.round((value / total) * 100)}%` : '—'

export function BreakdownCard({
  breakdown,
  title,
  sub,
  span = 'half',
  split = false,
  origin,
  children,
}: {
  breakdown: AnalyticsBreakdown
  title?: string
  sub?: ReactNode
  span?: keyof typeof SPAN
  /** Two or three parts of one whole: a split bar instead of bars. */
  split?: boolean
  origin?: LeadOrigin
  children?: ReactNode
}) {
  const [all, setAll] = useState(false)
  const items = breakdown.items.map((item) => ({
    ...item,
    valueText: breakdown.unit === 'count' ? undefined : (formatValue(breakdown.unit, item.value) ?? undefined),
  }))
  const label = title ?? breakdown.label

  return (
    <AnalyticsCard
      title={label}
      sub={sub}
      figures={[breakdown]}
      state={breakdown.state}
      message={breakdown.message}
      span={span}
      table={
        all ? undefined : (
          <DataTable
            caption={label}
            columns={['Item', breakdown.unit === 'bytes' ? 'Size' : 'Count', 'Share']}
            rows={items.map((item) => [item.label, item.valueText ?? formatCount(item.value), share(item.value, breakdown.total)])}
          />
        )
      }
    >
      {all && breakdown.ranking ? (
        <RankingList ranking={breakdown.ranking} origin={origin} onClose={() => setAll(false)} />
      ) : (
        <>
          {split ? <SplitBar items={items} label={label} /> : <HBars items={items} label={label} />}
          {breakdown.truncated && breakdown.ranking ? (
            <button
              type="button"
              className="self-start text-[12px] font-semibold text-[var(--dash-blue-ink)] hover:underline"
              onClick={() => setAll(true)}
            >
              See every item
            </button>
          ) : null}
          {children}
        </>
      )}
    </AnalyticsCard>
  )
}

/* ------------------------------------------------------------------ ranking */

function RankingSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Loading" className="m-0 flex list-none flex-col gap-[9px] p-0">
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="grid grid-cols-[minmax(80px,150px)_minmax(0,1fr)_48px] items-center gap-2.5">
          <span className="dash-skeleton h-3 w-24" />
          <span className="dash-skeleton h-3.5" style={{ width: `${90 - index * 15}%` }} />
          <span className="dash-skeleton h-3 w-8 justify-self-end" />
        </li>
      ))}
    </ul>
  )
}

/** Every item of a ranking, a bounded page at a time, in the server's order. */
export function RankingList({
  ranking,
  origin,
  by,
  onClose,
}: {
  ranking: AnalyticsRanking
  origin?: LeadOrigin
  by?: BlogRankingMeasure
  onClose?: () => void
}) {
  const { period } = useSectionContext()
  const [page, setPage] = useState(1)
  const result = useRanking(ranking, { period, page, pageSize: RANKING_PAGE_SIZE, origin, by })
  const data = result.data

  if (result.isError) {
    return (
      <div role="alert" className="flex flex-col items-start gap-1.5 py-2">
        <p className="text-[15px] font-semibold text-[var(--dash-red-ink)]">Could not load</p>
        <p className="text-[12.5px] text-[var(--dash-quiet)]">The list did not arrive. The figures above are unaffected.</p>
        <button type="button" className="dash-btn dash-btn-quiet mt-1 h-8 text-[12px]" onClick={() => void result.refetch()}>
          Try again
        </button>
      </div>
    )
  }

  if (!data) return <RankingSkeleton />

  return (
    <div className={cn('flex flex-col gap-3 transition-opacity', result.isPlaceholderData && 'opacity-60')}>
      {data.state !== 'ready' ? (
        <StateBody state={data.state} message={data.message} />
      ) : (
        <HBars
          label={data.label}
          items={data.items.map((item) => ({
            key: item.key,
            label: `${item.rank}. ${item.label}`,
            value: item.value,
          }))}
        />
      )}
      <Pager
        page={data.page}
        pageCount={data.pageCount}
        total={data.total}
        noun={['item', 'items']}
        onPage={setPage}
      />
      {onClose ? (
        <button
          type="button"
          className="self-start text-[12px] font-semibold text-[var(--dash-blue-ink)] hover:underline"
          onClick={onClose}
        >
          Show the top items only
        </button>
      ) : null}
    </div>
  )
}

const MEASURES: Array<{ value: BlogRankingMeasure; label: string }> = [
  { value: 'reads', label: 'Reads' },
  { value: 'likes', label: 'Likes' },
  { value: 'comments', label: 'Comments' },
]

/**
 * Blog articles ranked by the Blog's own counters. Reads and likes are
 * all-time running totals; comments follow the period. The ⓘ says which.
 */
export function BlogRankingCard({ span = 'half' }: { span?: keyof typeof SPAN }) {
  const { period } = useSectionContext()
  const [by, setBy] = useState<BlogRankingMeasure>('reads')
  const [page, setPage] = useState(1)
  const result = useRanking('blog-posts', { period, page, pageSize: RANKING_PAGE_SIZE, by })
  const data = result.data

  const choose = (value: BlogRankingMeasure) => {
    setBy(value)
    setPage(1)
  }

  const picker = (
    <div role="group" aria-label="Rank articles by" className="inline-flex self-start rounded-[9px] bg-[var(--dash-chip)] p-[3px]">
      {MEASURES.map((measure) => (
        <button
          key={measure.value}
          type="button"
          aria-pressed={by === measure.value}
          data-on={by === measure.value}
          className="dash-seg h-[26px] rounded-[7px] px-2.5 text-[12px] font-medium data-[on=true]:font-semibold data-[on=true]:text-[var(--dash-ink)]"
          onClick={() => choose(measure.value)}
        >
          {measure.label}
        </button>
      ))}
    </div>
  )

  if (result.isError) {
    return (
      <AnalyticsCard title="Blog articles" figures={[]} state="error" span={span} message="The ranking did not arrive. Other figures are unaffected." />
    )
  }

  return (
    <AnalyticsCard
      title="Blog articles"
      sub={data ? data.label : 'Ranked by the Blog’s own counters'}
      figures={data ? [rankingDefinable(data)] : []}
      span={span}
      table={
        data && data.state === 'ready' ? (
          <DataTable
            caption={data.label}
            columns={['Article', MEASURES.find((measure) => measure.value === by)!.label]}
            rows={data.items.map((item) => [`${item.rank}. ${item.label}`, formatCount(item.value)])}
          />
        ) : undefined
      }
    >
      {picker}
      {!data ? (
        <RankingSkeleton />
      ) : (
        <div className={cn('flex flex-col gap-3 transition-opacity', result.isPlaceholderData && 'opacity-60')}>
          {data.state !== 'ready' ? (
            <StateBody state={data.state} message={data.message} />
          ) : (
            <HBars
              label={data.label}
              items={data.items.map((item) => ({ key: item.key, label: item.label, value: item.value }))}
            />
          )}
          <Pager page={data.page} pageCount={data.pageCount} total={data.total} noun={['article', 'articles']} onPage={setPage} />
        </div>
      )}
    </AnalyticsCard>
  )
}
