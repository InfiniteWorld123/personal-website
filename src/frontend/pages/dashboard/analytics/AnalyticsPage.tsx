import { type KeyboardEvent, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Bot, CalendarDays, Euro, Globe, Handshake, RefreshCw } from 'lucide-react'
import { LEAD_ORIGIN_NOTE, type LeadOrigin } from '#/backend2/contracts/analytics.contract'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import {
  ANALYTICS_PERIODS,
  ANALYTICS_TABS,
  type AnalyticsPeriodPreset,
  type AnalyticsSearch,
  type AnalyticsTab,
  DEFAULT_PERIOD,
  DEFAULT_TAB,
} from '#/frontend/features/analytics-v2/analytics-search'
import { PERIOD_LABEL, PERIOD_SHORT, berlinTime, dateRange } from '#/frontend/features/analytics-v2/format'
import { useSection } from '#/frontend/features/analytics-v2/queries'
import { ApiRequestError } from '#/frontend/api/response'
import { cn } from '#/frontend/lib/utils'
import { SectionProvider } from './analytics-cards'
import { SectionBody, sectionNotes } from './sections'

/**
 * `/dashboard/analytics` — the owner's figures from every module, as approved
 * in the Design Lab (24 Sep 2026): one page, five tabs, one period for all of
 * them (30 days by default), and every card honest about what it can show.
 *
 * The tab, the period and the Sales origin filter live in the address, so a
 * link opens exactly this view. Only the open tab is read from the server;
 * a failing tab never takes another down, and inside a tab a failing source
 * marks only its own cards.
 */

const TABS: Array<{ value: AnalyticsTab; label: string; icon: typeof Globe }> = [
  { value: 'website', label: 'Website & content', icon: Globe },
  { value: 'sales', label: 'Sales & relationships', icon: Handshake },
  { value: 'operations', label: 'Operations', icon: CalendarDays },
  { value: 'money', label: 'Money', icon: Euro },
  { value: 'assistant', label: 'AI assistant', icon: Bot },
]

const ORIGINS: Array<{ value: LeadOrigin; label: string }> = [
  { value: 'all', label: 'All leads' },
  { value: 'manual', label: 'Entered by hand' },
  { value: 'imported', label: 'Imported' },
]

export function AnalyticsPage({ search }: { search: AnalyticsSearch }) {
  const navigate = useNavigate()
  const tab = search.tab ?? DEFAULT_TAB
  const period = search.period ?? DEFAULT_PERIOD
  const origin: LeadOrigin = search.origin ?? 'all'
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const section = useSection(tab, { period, origin: tab === 'sales' ? origin : undefined })
  const data = section.data

  const go = (next: Partial<{ tab: AnalyticsTab; period: AnalyticsPeriodPreset; origin: LeadOrigin }>) => {
    const nextTab = next.tab ?? tab
    const nextPeriod = next.period ?? period
    const nextOrigin = next.origin ?? origin

    void navigate({
      to: '/dashboard/analytics',
      search: {
        tab: nextTab === DEFAULT_TAB ? undefined : nextTab,
        period: nextPeriod === DEFAULT_PERIOD ? undefined : nextPeriod,
        origin: nextOrigin === 'all' ? undefined : nextOrigin,
      },
      replace: true,
      resetScroll: false,
    })
  }

  /* Tabs follow the WAI-ARIA pattern: arrows move between them, the panel follows. */
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = ANALYTICS_TABS.length - 1
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % (last + 1)
        : event.key === 'ArrowLeft'
          ? (index - 1 + last + 1) % (last + 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null

    if (next === null) return

    event.preventDefault()
    tabRefs.current[next]?.focus()
    go({ tab: TABS[next]!.value })
  }

  const periodControl = (
    <div role="group" aria-label="Period" className="inline-flex rounded-[10px] bg-[var(--dash-chip)] p-[3px]">
      {ANALYTICS_PERIODS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={period === value}
          aria-label={PERIOD_LABEL[value]}
          data-on={period === value}
          className={cn(
            'dash-seg h-[30px] min-w-11 rounded-lg px-2.5 text-[12.5px] font-medium tabular-nums data-[on=true]:font-semibold data-[on=true]:text-[var(--dash-ink)]',
            period === value && 'shadow-[0_1px_2px_rgba(16,23,47,.08)]',
          )}
          onClick={() => go({ period: value })}
        >
          {PERIOD_SHORT[value]}
        </button>
      ))}
    </div>
  )

  /* A provider answer can be cached (PostHog, ten minutes); say when it is older than the page. */
  const oldest = data
    ? data.groups
        .flatMap((group) => [...group.metrics, ...group.breakdowns])
        .filter((figure) => figure.state === 'ready')
        .reduce<string | null>((min, figure) => (min === null || figure.asOf < min ? figure.asOf : min), null)
    : null
  const cachedAt = data && oldest && Date.parse(data.asOf) - Date.parse(oldest) > 60_000 ? oldest : null

  const panelId = 'analytics-panel'
  const signedOut = section.error instanceof ApiRequestError && section.error.status === 401
  const unavailable = section.error instanceof ApiRequestError && (section.error.status === 404 || section.error.status === 403)

  return (
    <DashboardPage className="@container gap-4">
      <PageHead
        eyebrow="INSIGHT"
        title="Analytics"
        description="Real figures from your modules. A source that is not connected says so instead of showing zero."
        actions={periodControl}
        className="dash-rise dash-rise-1"
      />

      <div
        role="tablist"
        aria-label="Analytics sections"
        className="dash-rise dash-rise-2 flex flex-wrap gap-1"
      >
        {TABS.map((item, index) => {
          const selected = item.value === tab
          const Icon = item.icon

          return (
            <button
              key={item.value}
              ref={(element) => {
                tabRefs.current[index] = element
              }}
              type="button"
              role="tab"
              id={`analytics-tab-${item.value}`}
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className={cn(
                'inline-flex h-[34px] shrink-0 items-center gap-[7px] rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap',
                selected
                  ? 'bg-[var(--dash-slab)] font-semibold text-[var(--dash-slab-ink)]'
                  : 'text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]',
              )}
              onClick={() => go({ tab: item.value })}
              onKeyDown={(event) => onTabKey(event, index)}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-[var(--dash-quiet)]">
        <span>
          {PERIOD_LABEL[period]}
          {data ? <> · {dateRange(data.period.from, data.period.to)}</> : null} · days end at midnight in Berlin
        </span>
        {data ? (
          <span className="inline-flex items-center gap-1.5">
            Updated {berlinTime(data.asOf)} (Berlin)
            {cachedAt ? <> · website statistics as of {berlinTime(cachedAt)}</> : null}
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-[var(--dash-blue-ink)] hover:bg-[var(--dash-hover)] disabled:opacity-60"
              disabled={section.isFetching}
              onClick={() => void section.refetch()}
            >
              <RefreshCw className={cn('size-3', section.isFetching && 'animate-spin')} aria-hidden="true" />
              {section.isFetching ? 'Updating' : 'Refresh'}
            </button>
          </span>
        ) : null}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`analytics-tab-${tab}`}
        aria-busy={section.isFetching}
        className="flex flex-col gap-3"
      >
        {tab === 'sales' ? (
          <div className="flex flex-col gap-1.5">
            <div role="group" aria-label="Which leads to count" className="inline-flex self-start rounded-[10px] bg-[var(--dash-chip)] p-[3px]">
              {ORIGINS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={origin === item.value}
                  data-on={origin === item.value}
                  className="dash-seg h-[28px] rounded-lg px-2.5 text-[12px] font-medium data-[on=true]:font-semibold data-[on=true]:text-[var(--dash-ink)]"
                  onClick={() => go({ origin: item.value })}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {origin !== 'all' ? <p className="max-w-[80ch] text-[12px] text-[var(--dash-quiet)]">{LEAD_ORIGIN_NOTE}</p> : null}
          </div>
        ) : null}

        {section.isError && !data ? (
          <div role="alert" className="dash-panel flex flex-col items-start gap-3 p-8">
            <h2 className="text-sm font-semibold">
              {signedOut ? 'Your session has ended' : unavailable ? 'Analytics is not available here' : 'These figures could not be loaded'}
            </h2>
            <p className="max-w-[56ch] text-[13px] text-[var(--dash-quiet)]">
              {signedOut
                ? 'Sign in again to see your figures.'
                : unavailable
                  ? 'The owner figures only answer on this computer or after signing in. Nothing is shown in their place.'
                  : 'The server did not answer. No figure is shown in place of one that did not arrive. Try again in a moment.'}
            </p>
            {signedOut ? (
              <Link to="/dashboard/login" search={{ redirect: '/dashboard/analytics' }} className="dash-btn dash-btn-quiet">
                Sign in
              </Link>
            ) : (
              <button type="button" className="dash-btn dash-btn-quiet" onClick={() => void section.refetch()}>
                Try again
              </button>
            )}
          </div>
        ) : !data ? (
          <SectionSkeleton />
        ) : (
          <SectionProvider value={{ period, retry: () => void section.refetch() }}>
            <div className={cn('transition-opacity', section.isPlaceholderData && 'opacity-60')}>
              <SectionBody section={data} origin={origin} />
            </div>
            <SectionNotes notes={sectionNotes(data)} />
          </SectionProvider>
        )}
      </div>
    </DashboardPage>
  )
}

function SectionSkeleton() {
  return (
    <div aria-label="Loading figures" className="grid grid-cols-12 gap-3">
      {['col-span-12 @5xl:col-span-8', 'col-span-12 @5xl:col-span-4', 'col-span-12 @3xl:col-span-6', 'col-span-12 @3xl:col-span-6'].map(
        (span, index) => (
          <div key={index} className={cn('dash-panel flex flex-col gap-3 px-4 py-4', span)}>
            <span className="dash-skeleton h-3.5 w-32" />
            <span className="dash-skeleton h-8 w-24" />
            <span className="dash-skeleton h-[120px] w-full rounded-lg" />
          </div>
        ),
      )}
    </div>
  )
}

function SectionNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null

  return (
    <details className="text-[12px] text-[var(--dash-quiet)]">
      <summary className="cursor-pointer font-semibold text-[var(--dash-ink)]">About these figures</summary>
      <ul className="mt-2 flex list-disc flex-col gap-1 ps-5">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
    </details>
  )
}
