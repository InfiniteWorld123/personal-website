import { type PointerEvent, type ReactNode, useId, useState } from 'react'
import { niceScale, useWidth } from '#/frontend/features/analytics-v2/charts'
import { formatCount } from '#/frontend/features/analytics-v2/format'
import { cn } from '#/frontend/lib/utils'

/**
 * The Overview's charts, as approved in the Design Lab (Direction A "Hatch",
 * 24 Sep 2026): a hatched money curve with the current month raised as a
 * pill, a visits sparkline, a half-ring gauge and a weekday × time grid.
 *
 * Hand-drawn SVG on the dashboard's own tokens, so light and dark follow the
 * shell. Every chart carries `role="img"` with a sentence saying what it
 * shows, a hover label on each mark, and its numbers as a hidden table, so
 * nothing is only a picture.
 */

/* ------------------------------------------------------------------ tooltip */

export type Tip = { x: number; y: number; title: string; body: string }

/** The hover label: positioned in percent of the chart it belongs to. */
export function ChartTip({ tip }: { tip: Tip | null }) {
  if (!tip) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-lg bg-[var(--dash-slab)] px-2.5 py-1.5 text-[12px] leading-snug whitespace-nowrap text-[var(--dash-slab-ink)] shadow-[var(--dash-shadow)]"
      style={{ left: `${Math.min(88, Math.max(12, tip.x))}%`, top: `${tip.y}%` }}
    >
      <b className="block text-[12.5px] font-semibold">{tip.title}</b>
      <span className="text-[var(--dash-slab-quiet)]">{tip.body}</span>
    </div>
  )
}

/** An SVG-safe id: React's ids carry characters `url(#…)` cannot hold. */
const useSvgId = () => `ov${useId().replace(/[^a-zA-Z0-9_-]/gu, '')}`

/** A smooth path through the points, as in the lab. */
const smooth = (points: Array<[number, number]>): string =>
  points
    .map(([x, y], index) => {
      if (index === 0) return `M${x.toFixed(1)},${y.toFixed(1)}`

      const [px, py] = points[index - 1]!
      const cx = ((px + x) / 2).toFixed(1)

      return `C${cx},${py.toFixed(1)} ${cx},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join('')

/** A visually hidden table of the same numbers, for screen readers. */
export function HiddenTable({ caption, head, rows }: { caption: string; head: [string, string]; rows: Array<[string, string]> }) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{head[0]}</th>
          <th scope="col">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row">{label}</th>
            <td>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/* -------------------------------------------------------------- money curve */

export function MoneyCurve({
  labels,
  longLabels,
  values,
  format,
  axisFormat,
  summary,
  emptyText,
}: {
  /** Short axis labels, one per value. */
  labels: string[]
  /** Tooltip titles, one per value. */
  longLabels: string[]
  values: number[]
  format: (value: number) => string
  axisFormat: (value: number) => string
  summary: string
  emptyText: string
}) {
  const [ref, width] = useWidth(640)
  const [tip, setTip] = useState<Tip | null>(null)
  const id = useSvgId()
  const narrow = width < 460
  const W = width
  const H = narrow ? 190 : 220
  const L = narrow ? 44 : 52
  const R = 14
  const T = 34
  const B = 26
  const iw = W - L - R
  const ih = H - T - B
  const empty = values.every((value) => value === 0)
  const low = Math.min(0, ...values)
  const { top, step } = niceScale(Math.max(...values, 0) * 1.08)
  const span = top - low || 1
  const last = values.length - 1
  const x = (index: number) => L + (last <= 0 ? iw / 2 : (index * iw) / last)
  const y = (value: number) => T + ih - ((value - low) / span) * ih
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
  const points = values.map((value, index) => [x(index), y(value)] as [number, number])
  const line = smooth(points)
  const current = values[last] ?? 0
  const before = last > 0 ? values[last - 1]! : null
  const change = before !== null && before > 0 ? Math.round(((current - before) / before) * 100) : null
  const pillWidth = Math.min(34, (iw / Math.max(values.length, 1)) * 0.55)
  const column = iw / Math.max(1, last)
  // The change label sits right of the pill, or left of it when the pill is at the edge.
  const labelX = x(last) + 10 + 48 > W - R ? x(last) - pillWidth / 2 - 8 - 48 : x(last) + 10

  const hover = (index: number) => (event: PointerEvent<SVGRectElement>) => {
    event.stopPropagation()
    setTip({
      x: (x(index) / W) * 100,
      y: (y(values[index]!) / H) * 100,
      title: longLabels[index]!,
      body: `${format(values[index]!)} received`,
    })
  }

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="block h-auto w-full overflow-visible" role="img" aria-label={summary}>
        <defs>
          <pattern id={`${id}h`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="var(--dash-series-1)" fillOpacity="0.07" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--dash-series-1)" strokeOpacity="0.45" strokeWidth="2" />
          </pattern>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={L} x2={W - R} y1={y(tick)} y2={y(tick)} stroke="var(--dash-grid)" />
            <text x={L - 8} y={y(tick) + 3.5} textAnchor="end" className="fill-[var(--dash-quiet)] text-[10.5px] tabular-nums">
              {axisFormat(tick)}
            </text>
          </g>
        ))}
        {labels.map((label, index) => (
          <text
            key={`${label}-${index}`}
            x={x(index)}
            y={H - 7}
            textAnchor="middle"
            className={cn('fill-[var(--dash-quiet)] text-[10.5px]', index === last && !empty && 'fill-[var(--dash-ink)] font-semibold')}
          >
            {label}
          </text>
        ))}
        {empty ? (
          <>
            <line
              x1={L}
              x2={W - R}
              y1={y(0)}
              y2={y(0)}
              stroke="var(--dash-series-1)"
              strokeWidth={2}
              strokeDasharray="4 5"
              strokeOpacity={0.5}
            />
            <text x={L + iw / 2} y={T + ih / 2} textAnchor="middle" className="fill-[var(--dash-quiet)] text-[12px]">
              {emptyText}
            </text>
          </>
        ) : (
          <>
            <path d={`${line}L${x(last)},${y(0)}L${x(0)},${y(0)}Z`} fill={`url(#${id}h)`} />
            {current > 0 ? (
              <rect
                x={x(last) - pillWidth / 2}
                y={y(current) - 8}
                width={pillWidth}
                height={Math.max(0, y(0) - y(current) + 8)}
                rx={pillWidth / 2}
                fill="var(--dash-series-1)"
                fillOpacity={0.9}
              />
            ) : null}
            <path d={line} fill="none" stroke="var(--dash-series-1)" strokeWidth={2} strokeLinecap="round" />
            {change !== null ? (
              <g aria-hidden="true">
                <rect
                  x={labelX}
                  y={y(current) - 34}
                  width={48}
                  height={20}
                  rx={10}
                  fill="var(--dash-ink)"
                />
                <text
                  x={labelX + 24}
                  y={y(current) - 20}
                  textAnchor="middle"
                  className="fill-[var(--dash-surface)] text-[11px] font-semibold tabular-nums"
                >
                  {`${change >= 0 ? '+' : '−'}${Math.abs(change)}%`}
                </text>
              </g>
            ) : null}
            <circle cx={x(last)} cy={y(current)} r={4.5} fill="var(--dash-series-1)" stroke="var(--dash-surface)" strokeWidth={2} />
          </>
        )}
        {values.map((value, index) => (
          <g key={index} className="group">
            <line
              x1={x(index)}
              x2={x(index)}
              y1={T}
              y2={y(0)}
              stroke="var(--dash-quiet)"
              strokeDasharray="3 3"
              className="opacity-0 transition-opacity group-hover:opacity-100"
            />
            <circle
              cx={x(index)}
              cy={y(value)}
              r={5}
              fill="var(--dash-series-1)"
              stroke="var(--dash-surface)"
              strokeWidth={2}
              className="opacity-0 transition-opacity group-hover:opacity-100"
            />
            <rect
              x={x(index) - column / 2}
              y={T}
              width={column}
              height={ih}
              fill="transparent"
              onPointerEnter={hover(index)}
              onPointerDown={hover(index)}
            />
          </g>
        ))}
      </svg>
      <ChartTip tip={tip} />
    </div>
  )
}

/* ----------------------------------------------------------------- sparkline */

export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null

  const W = 116
  const H = 40
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  const x = (index: number) => 2 + (index * (W - 6)) / (values.length - 1)
  const y = (value: number) => H - 4 - ((value - min) / (max - min || 1)) * (H - 10)
  const points = values.map((value, index) => [x(index), y(value)] as [number, number])
  const end = points.at(-1)!

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={cn('shrink-0', className)} aria-hidden="true">
      <path d={smooth(points)} fill="none" stroke="var(--dash-series-1)" strokeWidth={2} strokeLinecap="round" />
      <circle cx={end[0]} cy={end[1]} r={3} fill="var(--dash-series-1)" />
    </svg>
  )
}

/* --------------------------------------------------------------------- gauge */

/** A half ring. `share` is 0–1, or `null` for "no rate yet". */
export function Gauge({ share, caption, label }: { share: number | null; caption: string; label: string }) {
  const W = 220
  const H = 118
  const r = 84
  const cx = W / 2
  const cy = 100
  const angle = Math.PI * (1 - (share ?? 0))
  const end: [number, number] = [cx + r * Math.cos(angle), cy - r * Math.sin(angle)]
  const percent = share === null ? '—' : `${Math.round(share * 100)}%`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full max-w-[220px]" role="img" aria-label={label}>
      <path d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${cx + r},${cy}`} fill="none" stroke="var(--dash-chip)" strokeWidth={14} strokeLinecap="round" />
      {share !== null && share > 0 ? (
        <path
          d={`M${cx - r},${cy} A${r},${r} 0 0 1 ${end[0].toFixed(2)},${end[1].toFixed(2)}`}
          fill="none"
          stroke="var(--dash-series-1)"
          strokeWidth={14}
          strokeLinecap="round"
        />
      ) : null}
      <text x={cx} y={cy - 16} textAnchor="middle" className="fill-[var(--dash-ink)] text-[28px] font-semibold tabular-nums">
        {percent}
      </text>
      <text x={cx} y={cy + 4} textAnchor="middle" className="fill-[var(--dash-quiet)] text-[10.5px]">
        {caption}
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------- heatmap */

export function Heatmap({
  weekdays,
  slots,
  cells,
  muted,
  summary,
  unit,
}: {
  weekdays: string[]
  slots: string[]
  /** `cells[weekday][slot]`; empty draws the grid in grey. */
  cells: number[][]
  /** Drawn faded, behind a state message. */
  muted?: boolean
  summary: string
  unit: readonly [string, string]
}) {
  const [tip, setTip] = useState<Tip | null>(null)
  const W = 360
  const L = 34
  const T = 4
  const cellW = (W - L) / slots.length
  const cellH = 22
  const H = T + weekdays.length * cellH + 20
  const max = Math.max(0, ...cells.flat())

  return (
    <div className={cn('relative', muted && 'opacity-45')} onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={summary}>
        {weekdays.map((day, row) => (
          <g key={day}>
            <text x={0} y={T + row * cellH + 15} className="fill-[var(--dash-quiet)] text-[10px]">
              {day}
            </text>
            {slots.map((slot, column) => {
              const value = cells[row]?.[column] ?? 0
              const on = max > 0 && value > 0
              const cx = L + column * cellW + 1
              const cy = T + row * cellH + 1

              return (
                <rect
                  key={slot}
                  x={cx}
                  y={cy}
                  width={cellW - 2}
                  height={cellH - 2}
                  rx={5}
                  fill={on ? 'var(--dash-series-1)' : 'var(--dash-chip)'}
                  fillOpacity={on ? (0.1 + 0.9 * (value / max)).toFixed(2) : 1}
                  className="hover:stroke-[var(--dash-ink)] hover:stroke-[1.5]"
                  onPointerEnter={() =>
                    setTip({
                      x: ((cx + cellW / 2) / W) * 100,
                      y: (cy / H) * 100,
                      title: `${day} ${slot}`,
                      body: muted ? 'Not counted' : `${formatCount(value)} ${value === 1 ? unit[0] : unit[1]}`,
                    })
                  }
                />
              )
            })}
          </g>
        ))}
        {slots.map((slot, column) =>
          column % 2 === 0 ? (
            <text key={slot} x={L + column * cellW + cellW / 2} y={H - 4} textAnchor="middle" className="fill-[var(--dash-quiet)] text-[10px]">
              {slot}
            </text>
          ) : null,
        )}
      </svg>
      <ChartTip tip={tip} />
    </div>
  )
}

/* --------------------------------------------------------------- funnel bar */

export function FunnelBar({ share, step, title, body }: { share: number; step: number; title: string; body: string }) {
  const [hover, setHover] = useState(false)

  return (
    <span
      className="relative block h-[22px] overflow-visible rounded-[7px] bg-[var(--dash-chip)]"
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
    >
      <span
        className="block h-full rounded-[7px] bg-[var(--dash-series-1)]"
        style={{ width: `${share === 0 ? 0 : Math.max(4, share * 100)}%`, opacity: 1 - step * 0.17 }}
      />
      <ChartTip tip={hover ? { x: 50, y: 0, title, body } : null} />
    </span>
  )
}

/** The lab's dashed "nothing yet" box. */
export function EmptyNote({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-dashed border-[var(--dash-line)] p-3.5 text-[12.5px] text-[var(--dash-quiet)]">
      <span aria-hidden="true" className="mt-0.5 shrink-0">
        {icon}
      </span>
      <div>{children}</div>
    </div>
  )
}
