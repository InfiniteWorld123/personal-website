import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import type { AnalyticsBucket, SeriesPoint } from '#/backend2/contracts/analytics.contract'
import { cn } from '#/frontend/lib/utils'
import { axisDate, bucketLabel, formatCount } from './format'

/**
 * The Analytics charts, hand-built in SVG and HTML as approved in the Design
 * Lab (24 Sep 2026) — no chart library, so nothing extra reaches any bundle.
 *
 * Colours are the dashboard chart tokens (`--dash-series-1`, `--dash-series-2`,
 * `--dash-compare`, `--dash-grid` in `dashboard.css`), validated for both
 * themes. Text never wears a series colour. Every chart has a text
 * alternative, and the card around it offers the same numbers as a table.
 */

/* --------------------------------------------------------------- line chart */

/** Round steps (1, 2, 5 × 10ⁿ) so the axis reads 0, 5, 10, 15 — never 0, 3.7, 7.4. */
export const niceScale = (max: number, ticks = 4): { top: number; step: number } => {
  if (!(max > 0)) return { top: ticks, step: 1 }

  const raw = max / ticks
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const normal = raw / magnitude
  const step = Math.max(1, (normal <= 1 ? 1 : normal <= 2 ? 2 : normal <= 5 ? 5 : 10) * magnitude)

  return { top: Math.ceil(max / step) * step, step }
}

/** Which points get an axis label: evenly spaced, always the last, never two crowding at the end. */
export const labelIndexes = (count: number, wanted: number): number[] => {
  if (count <= 0) return []

  const every = Math.max(1, Math.ceil(count / wanted))
  const picked = Array.from({ length: count }, (_, index) => index).filter(
    (index) => index % every === 0 || index === count - 1,
  )

  // Drop the label just before the last one when they would collide.
  if (picked.length > 2 && count - 1 - picked[picked.length - 2]! < every * 0.6) picked.splice(picked.length - 2, 1)

  return picked
}

export const useWidth = (fallback: number) => {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)

  useEffect(() => {
    const element = ref.current

    if (!element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry?.contentRect.width ?? 0)

      if (next > 0) setWidth(next)
    })

    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return [ref, width] as const
}

export function LineChart({
  points,
  bucket,
  name,
}: {
  points: SeriesPoint[]
  bucket: AnalyticsBucket
  /** What a point counts, lower case, singular and plural: ['new lead', 'new leads']. */
  name: readonly [string, string]
}) {
  const [wrapRef, width] = useWidth(640)
  const noun = (count: number) => (count === 1 ? name[0] : name[1])
  const [active, setActive] = useState<number | null>(null)
  const [announce, setAnnounce] = useState('')
  const labelId = useId()

  const narrow = width < 460
  const W = width
  const H = narrow ? 170 : 210
  const L = 34
  const R = 10
  const T = 10
  const B = 24

  const values = points.map((point) => point.value)
  const max = Math.max(0, ...values)
  const { top, step } = niceScale(max)
  const last = points.length - 1
  const x = (index: number) => L + (last <= 0 ? (W - L - R) / 2 : (index * (W - L - R)) / last)
  const y = (value: number) => T + (H - T - B) * (1 - value / top)
  const line = points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point.value).toFixed(1)}`).join('')
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
  const labels = labelIndexes(points.length, narrow ? 3 : 6)

  const total = values.reduce((sum, value) => sum + value, 0)
  const peak = values.indexOf(max)
  const summary =
    points.length === 0
      ? `No ${name[1]} to chart.`
      : `${formatCount(total)} ${noun(total)} from ${bucketLabel(points[0]!.date, bucket)} to ${bucketLabel(points[last]!.date, bucket)}` +
        (max > 0 ? `; the highest was ${formatCount(max)} (${bucketLabel(points[peak]!.date, bucket)}).` : '; none in any of them.') +
        ' Use the left and right arrow keys to read each point, or open the table.'

  if (points.length === 0) return null

  const show = (index: number, speak: boolean) => {
    setActive(index)

    if (speak) setAnnounce(`${bucketLabel(points[index]!.date, bucket)}: ${formatCount(points[index]!.value)} ${noun(points[index]!.value)}`)
  }

  const onPointer = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect()

    if (!box || box.width === 0) return

    const at = ((event.clientX - box.left) / box.width) * W
    let best = 0

    for (let index = 1; index < points.length; index += 1) {
      if (Math.abs(x(index) - at) < Math.abs(x(best) - at)) best = index
    }

    show(best, false)
  }

  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    const current = active ?? last
    const next =
      event.key === 'ArrowLeft'
        ? Math.max(0, current - 1)
        : event.key === 'ArrowRight'
          ? Math.min(last, current + 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null

    if (next === null) return

    event.preventDefault()
    show(next, true)
  }

  const point = active === null ? null : points[active]!
  const tipLeft = active === null ? 0 : Math.min(Math.max(x(active), 70), W - 70)

  return (
    <div ref={wrapRef} className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="block h-auto w-full overflow-visible rounded-md"
        role="img"
        aria-labelledby={labelId}
        tabIndex={0}
        onKeyDown={onKey}
        onFocus={() => show(active ?? last, true)}
        onBlur={() => setActive(null)}
      >
        <title id={labelId}>{summary}</title>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke="var(--dash-grid)" strokeWidth={1} />
            <text
              x={L - 8}
              y={y(tick) + 3.5}
              textAnchor="end"
              className="fill-[var(--dash-quiet)] text-[11px] tabular-nums"
            >
              {formatCount(tick)}
            </text>
          </g>
        ))}
        {labels.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={H - 6}
            textAnchor={index === 0 && last > 0 ? 'start' : index === last && last > 0 ? 'end' : 'middle'}
            className="fill-[var(--dash-quiet)] text-[11px] tabular-nums"
          >
            {axisDate(points[index]!.date, bucket)}
          </text>
        ))}
        <path d={`${line}L${x(last)},${y(0)}L${x(0)},${y(0)}Z`} fill="var(--dash-series-1)" opacity={0.09} />
        <path
          d={line}
          fill="none"
          stroke="var(--dash-series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={x(last)}
          cy={y(points[last]!.value)}
          r={4}
          fill="var(--dash-series-1)"
          stroke="var(--dash-surface)"
          strokeWidth={2}
        />
        {point && active !== null ? (
          <>
            <line
              x1={x(active)}
              x2={x(active)}
              y1={T}
              y2={H - B}
              stroke="var(--dash-quiet)"
              strokeWidth={1}
              strokeDasharray="2 3"
            />
            <circle
              cx={x(active)}
              cy={y(point.value)}
              r={4}
              fill="var(--dash-series-1)"
              stroke="var(--dash-surface)"
              strokeWidth={2}
            />
          </>
        ) : null}
        <rect
          x={L}
          y={T}
          width={Math.max(0, W - L - R)}
          height={H - T - B}
          fill="transparent"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setActive(null)}
        />
      </svg>

      {point && active !== null ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[115%] rounded-lg bg-[var(--dash-slab)] px-2.5 py-1.5 text-[12px] leading-snug whitespace-nowrap text-[var(--dash-slab-ink)] shadow-[var(--dash-shadow)]"
          style={{ left: `${(tipLeft / W) * 100}%`, top: `${(y(point.value) / H) * 100}%` }}
        >
          <span className="block text-[var(--dash-slab-quiet)]">{bucketLabel(point.date, bucket)}</span>
          <b className="tabular-nums">{formatCount(point.value)}</b> {noun(point.value)}
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">
        {announce}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------- bars */

export type BarItem = { key: string; label: string; value: number; valueText?: string; note?: string }

/** Horizontal bars with their values beside them — the value is always text, never only a length. */
export function HBars({ items, label }: { items: BarItem[]; label: string }) {
  const max = Math.max(0, ...items.map((item) => item.value)) || 1

  return (
    <ul className="m-0 flex list-none flex-col gap-[9px] p-0" aria-label={label}>
      {items.map((item) => (
        <li
          key={item.key}
          className="group grid grid-cols-[minmax(80px,150px)_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px]"
        >
          <span className="truncate" title={item.label}>
            {item.label}
          </span>
          <span className="relative h-3.5" aria-hidden="true">
            <span
              className="absolute inset-y-0 start-0 rounded-e-[4px] bg-[var(--dash-series-1)] transition-[filter] group-hover:brightness-110"
              style={{ width: `${(item.value / max) * 100}%`, minWidth: item.value > 0 ? 2 : 0 }}
            />
          </span>
          <span className="min-w-12 text-end font-semibold tabular-nums">
            {item.valueText ?? formatCount(item.value)}
            {item.note ? <small className="ms-1 font-normal text-[var(--dash-quiet)]">{item.note}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

const SPLIT_FILLS = ['var(--dash-series-1)', 'var(--dash-series-2)', 'var(--dash-compare)'] as const

/**
 * A whole split into two or three parts — Won against Lost, clients from
 * leads against added directly. The legend carries the words and numbers.
 */
export function SplitBar({ items, label }: { items: BarItem[]; label: string }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  const description = items.map((item) => `${item.label} ${formatCount(item.value)}`).join(', ')

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3.5 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`${label}: ${description}`}>
        {total > 0
          ? items.map((item, index) =>
              item.value > 0 ? (
                <span
                  key={item.key}
                  style={{ flexGrow: item.value, background: SPLIT_FILLS[index % SPLIT_FILLS.length] }}
                />
              ) : null,
            )
          : <span className="flex-1 bg-[var(--dash-chip)]" />}
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[12px] text-[var(--dash-quiet)]" aria-hidden="true">
        {items.map((item, index) => (
          <span key={item.key} className="inline-flex items-center">
            <i
              className="me-1.5 inline-block size-2 rounded-[2px]"
              style={{ background: SPLIT_FILLS[index % SPLIT_FILLS.length] }}
            />
            {item.label} <b className="ms-1 text-[var(--dash-ink)] tabular-nums">{item.valueText ?? formatCount(item.value)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- table */

export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string
  columns: string[]
  rows: ReactNode[][]
}) {
  return (
    <div className="max-h-[320px] overflow-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={cn(
                  'sticky top-0 border-b border-[var(--dash-line)] bg-[var(--dash-surface)] px-2 py-1.5 text-[10.5px] font-bold tracking-[0.12em] text-[var(--dash-quiet)] uppercase',
                  index === 0 ? 'text-start' : 'text-end',
                )}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="border-t border-[var(--dash-soft)] px-2 py-2 text-start font-normal">
                    {cell}
                  </th>
                ) : (
                  <td key={index} className="border-t border-[var(--dash-soft)] px-2 py-2 text-end tabular-nums">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
