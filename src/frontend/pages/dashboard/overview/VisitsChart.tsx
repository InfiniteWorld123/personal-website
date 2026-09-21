import { useState } from 'react'
import { count } from '#/frontend/dashboard/format'
import { Panel, PanelHead } from '#/frontend/dashboard/primitives'
import { sampleWeek } from '#/frontend/dashboard/sample-data'

/**
 * A week of visits, as bars you can actually ask a question of.
 *
 * The brief asked for a useful trend rather than decoration disguised as a
 * chart, so every bar is a real button: clicking one names its day and its
 * number above the chart, and the tooltip rides the selected bar. The busiest
 * day starts selected, because that is the one worth seeing first.
 *
 * Keyboard reaches every bar in order, and the day and figure are also written
 * out in the heading — so the chart is readable without ever hovering, and a
 * screen reader gets the numbers from the table below rather than from shapes.
 */
export function VisitsChart({ className }: { className?: string }) {
  const busiest = sampleWeek.reduce(
    (best, day, index) => (day.visits > sampleWeek[best].visits ? index : best),
    0,
  )
  const [selected, setSelected] = useState(busiest)
  const peak = sampleWeek[busiest].visits
  const current = sampleWeek[selected]

  return (
    <Panel className={className}>
      <PanelHead
        title="Visits this week"
        note="Click a bar"
        action={
          <span className="dash-num text-xs font-semibold text-[var(--dash-quiet)]">
            {current.day} · {count(current.visits)} visits
          </span>
        }
      />

      <div className="flex min-h-[150px] flex-1 items-end gap-3 px-5 sm:gap-3.5">
        {sampleWeek.map((day, index) => (
          <button
            key={day.day}
            type="button"
            data-on={index === selected}
            onClick={() => setSelected(index)}
            aria-label={`${day.day}, ${count(day.visits)} visits`}
            aria-pressed={index === selected}
            className="dash-bar relative flex h-full flex-1 items-end rounded-full"
          >
            <span className="dash-bar-tip dash-num absolute bottom-full left-1/2 -translate-x-1/2 -translate-y-2 rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
              style={{ background: 'var(--dash-slab)', color: 'var(--dash-slab-ink)' }}
            >
              {count(day.visits)}
            </span>
            <span
              className="dash-bar-fill w-full rounded-full"
              style={{ height: `${Math.round((day.visits / peak) * 100)}%` }}
            />
          </button>
        ))}
      </div>

      <div className="flex gap-3 px-5 pt-2.5 pb-4 text-center text-[11px] font-medium text-[var(--dash-quiet)] sm:gap-3.5">
        {sampleWeek.map((day) => (
          <span key={day.day} className="flex-1">
            {day.short}
          </span>
        ))}
      </div>

      {/* The same numbers, in the order the bars are drawn, for anyone who
          cannot see the shapes. */}
      <table className="sr-only">
        <caption>Website visits per day this week</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Visits</th>
          </tr>
        </thead>
        <tbody>
          {sampleWeek.map((day) => (
            <tr key={day.day}>
              <th scope="row">{day.day}</th>
              <td>{count(day.visits)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
