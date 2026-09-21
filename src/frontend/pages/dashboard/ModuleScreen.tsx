import { ChevronRight, Plus, Search, SlidersHorizontal } from 'lucide-react'
import {
  DashboardPage,
  Initials,
  NotSpecifiedBadge,
  PageHead,
  Panel,
  SampleBadge,
  StatusChip,
} from '#/frontend/dashboard/primitives'
import { modulePreviews, type ModuleKey } from '#/frontend/dashboard/sample-modules'

/**
 * One screen for every section that has a place in the navigation but no
 * agreed behaviour yet.
 *
 * It shows the shape — a header, a toolbar, a list — and refuses to show more
 * than that. The rows are fixtures, the search does not search, the filter
 * does not filter, and the badge in the header says which of the two it is.
 *
 * When a module gets its specification, this screen is replaced, not extended.
 */
export function ModuleScreen({ module }: { module: ModuleKey }) {
  const preview = modulePreviews[module]

  return (
    <DashboardPage>
      <PageHead
        eyebrow={preview.eyebrow}
        title={preview.title}
        description={preview.description}
        aside={<SampleBadge />}
        actions={<NotSpecifiedBadge />}
        className="dash-rise dash-rise-1"
      />

      <p className="dash-rise dash-rise-1 mt-3 max-w-[68ch] text-[13px] text-[var(--dash-quiet)]">
        {preview.open}
      </p>

      <div className="dash-rise dash-rise-2 mt-5 flex flex-wrap items-center gap-2.5">
        <span className="flex h-9 w-full max-w-[300px] items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] bg-[var(--dash-input)] px-3 text-[13px] text-[var(--dash-quiet)]">
          <Search aria-hidden="true" className="size-4 shrink-0" />
          {preview.searchPlaceholder}
        </span>

        <button type="button" disabled className="dash-btn dash-btn-quiet h-9">
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Filter
        </button>

        <div className="flex-1" />

        <button type="button" disabled className="dash-btn dash-btn-primary h-9">
          <Plus aria-hidden="true" className="size-4" />
          {preview.action}
        </button>
      </div>

      <Panel className="dash-rise dash-rise-3 mt-4 overflow-hidden">
        <ul>
          {preview.rows.map((row, index) => (
            <li
              key={row.id}
              className={
                index > 0
                  ? 'dash-row flex h-[74px] items-center gap-4 border-t border-[var(--dash-soft)] px-5'
                  : 'dash-row flex h-[74px] items-center gap-4 px-5'
              }
            >
              <Initials className="size-9 rounded-[10px] text-xs">{row.initials}</Initials>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{row.title}</span>
                <span className="mt-0.5 block truncate text-xs text-[var(--dash-quiet)]">
                  {row.detail}
                </span>
              </span>

              <StatusChip tone={row.tone} className="h-6 px-2.5">
                {row.status}
              </StatusChip>

              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-[var(--dash-quiet)]"
              />
            </li>
          ))}
        </ul>
      </Panel>
    </DashboardPage>
  )
}
