import type { ReactNode } from 'react'
import type {
  AnalyticsBreakdown,
  AnalyticsMetric,
  AnalyticsSectionResponse,
  LeadOrigin,
} from '#/backend2/contracts/analytics.contract'
import { formatBytes, formatCount, formatMoney } from '#/frontend/features/analytics-v2/format'
import {
  AnalyticsCard,
  Figure,
  FigureGrid,
  NotConnectedBox,
  StateChip,
  sharedState,
} from './analytics-cards'
import { BlogRankingCard, BreakdownCard, RateCard, SeriesCard } from './figure-cards'

/**
 * Each Analytics tab, laid out as the Design Lab approved (24 Sep 2026).
 *
 * The layout names the figures it places. Anything the API adds later that no
 * layout names yet still appears, in a "More figures" card at the end, so a
 * new figure is never silently dropped.
 */

type Lookup = {
  metric: (key: string) => AnalyticsMetric | undefined
  breakdown: (key: string) => AnalyticsBreakdown | undefined
  /** Every figure no layout placed, in the API's order. */
  rest: () => { metrics: AnalyticsMetric[]; breakdowns: AnalyticsBreakdown[] }
}

export const lookup = (section: AnalyticsSectionResponse): Lookup => {
  const used = new Set<string>()
  const metrics = section.groups.flatMap((group) => group.metrics)
  const breakdowns = section.groups.flatMap((group) => group.breakdowns)

  return {
    metric: (key) => {
      used.add(`m:${key}`)

      return metrics.find((metric) => metric.key === key)
    },
    breakdown: (key) => {
      used.add(`b:${key}`)

      return breakdowns.find((breakdown) => breakdown.key === key)
    },
    rest: () => ({
      metrics: metrics.filter(
        (metric, index) => !used.has(`m:${metric.key}`) && metrics.findIndex((m) => m.key === metric.key) === index,
      ),
      breakdowns: breakdowns.filter((breakdown) => !used.has(`b:${breakdown.key}`)),
    }),
  }
}

const present = <T,>(values: Array<T | undefined>): T[] => values.filter((value): value is T => value !== undefined)

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-12 gap-3">{children}</div>
}

/** A card of small figures, each carrying its own state. */
function FiguresCard({
  title,
  sub,
  metrics,
  columns,
  span = 'half',
  children,
}: {
  title: string
  sub?: ReactNode
  metrics: Array<AnalyticsMetric | undefined>
  columns?: 2 | 3 | 4
  span?: 'full' | 'half' | 'wide' | 'narrow'
  children?: ReactNode
}) {
  const list = present(metrics)

  if (list.length === 0) return null

  const state = sharedState(list)

  return (
    <AnalyticsCard
      title={title}
      sub={sub}
      figures={list}
      state={state}
      message={state === 'ready' ? undefined : list[0]!.message}
      span={span}
    >
      <FigureGrid columns={columns}>
        {list.map((metric) => (
          <Figure key={metric.key} metric={metric} />
        ))}
      </FigureGrid>
      {children}
    </AnalyticsCard>
  )
}

function Leftovers({ find }: { find: Lookup }) {
  const { metrics, breakdowns } = find.rest()

  if (metrics.length === 0 && breakdowns.length === 0) return null

  return (
    <>
      {metrics.length > 0 ? <FiguresCard title="More figures" metrics={metrics} columns={4} span="full" /> : null}
      {breakdowns.map((breakdown) => (
        <BreakdownCard key={breakdown.key} breakdown={breakdown} />
      ))}
    </>
  )
}

/* ------------------------------------------------------------------ website */

function WebsiteTab({ section }: { section: AnalyticsSectionResponse }) {
  const find = lookup(section)
  const visitors = find.metric('website.visitors')
  const pageviews = find.metric('website.pageviews')
  const topPages = find.breakdown('website.topPages')
  const connected = visitors !== undefined && visitors.state !== 'not-connected'

  return (
    <Grid>
      {!connected ? (
        <NotConnectedBox title="Website statistics are not connected">
          <p>
            Visits, pageviews and the most viewed pages come from Cloudflare Web Analytics, which sets no cookies.
            They appear once its beacon is switched on for the public site and the Dashboard is given read access
            (three private settings). Nothing about visitors is collected before that.
          </p>
          <p>Everything below this box comes from your own modules and is real.</p>
        </NotConnectedBox>
      ) : (
        <>
          {visitors ? <SeriesCard metric={visitors} title="Visits" name={['visit', 'visits']} /> : null}
          {pageviews ? <FiguresCard title="Pageviews" metrics={[pageviews]} span="narrow" /> : null}
          {topPages ? <BreakdownCard breakdown={topPages} sub="Pageviews, not people" span="full" /> : null}
        </>
      )}

      <FiguresCard
        title="Contact and bookings"
        sub="Finished actions from your own records, not clicks"
        metrics={[find.metric('website.onlineBookings'), find.metric('website.contactSubmissions')]}
      />
      <BlogRankingCard />
      <FiguresCard
        title="On the website now"
        metrics={[find.metric('website.projectsLive'), find.metric('website.servicesLive'), find.metric('blog.live')]}
        columns={3}
        span="full"
      />
      <Leftovers find={find} />
    </Grid>
  )
}

/* -------------------------------------------------------------------- sales */

function SalesTab({ section, origin }: { section: AnalyticsSectionResponse; origin: LeadOrigin }) {
  const find = lookup(section)
  const newLeads = find.metric('leads.new')
  const active = find.metric('leads.active')
  const won = find.metric('leads.won')
  const lost = find.metric('leads.lost')
  const wonRate = find.metric('leads.wonRate')
  const stages = find.breakdown('leads.stages')
  const sources = find.breakdown('leads.sources')
  const lostReasons = find.breakdown('leads.lostReasons')
  const clientsNew = find.metric('clients.new')
  const fromLeads = find.metric('clients.fromLeads')
  const direct = find.metric('clients.direct')
  const clientsActive = find.metric('clients.active')
  const clientsInactive = find.metric('clients.inactive')
  const clientOrigin = find.breakdown('clients.origin')

  return (
    <Grid>
      {newLeads ? <SeriesCard metric={newLeads} name={['new lead', 'new leads']} /> : null}
      {wonRate ? (
        <RateCard
          metric={wonRate}
          of={{ numerator: 'won', denominator: 'decided' }}
          parts={[
            { key: 'won', label: 'Won', value: won?.value ?? wonRate.rate?.numerator ?? 0 },
            {
              key: 'lost',
              label: 'Lost',
              value: lost?.value ?? (wonRate.rate ? wonRate.rate.denominator - wonRate.rate.numerator : 0),
            },
          ]}
        />
      ) : null}
      {stages ? (
        <BreakdownCard
          breakdown={stages}
          title="Leads by stage"
          sub={
            active?.state === 'ready' && active.value !== null
              ? `Right now — ${formatCount(active.value)} active`
              : 'Right now'
          }
        />
      ) : null}
      {sources ? <BreakdownCard breakdown={sources} sub="The source you chose on each new lead" origin={origin} /> : null}
      {lostReasons ? <BreakdownCard breakdown={lostReasons} origin={origin} /> : null}
      <FiguresCard
        title="Follow-ups"
        metrics={[find.metric('leads.followUpsDue'), find.metric('leads.followUpsNextWeek')]}
      />
      {clientsNew ? (
        <AnalyticsCard
          title="New clients"
          sub={
            clientsNew.state === 'ready' && clientsNew.value !== null
              ? `${formatCount(clientsNew.value)} in the period`
              : undefined
          }
          figures={present([clientsNew, fromLeads, direct, clientOrigin, clientsActive, clientsInactive])}
          state={clientsNew.state}
          message={clientsNew.message}
          span="full"
        >
          {clientOrigin && clientOrigin.state === 'ready' ? (
            <BreakdownSplit breakdown={clientOrigin} />
          ) : clientOrigin ? (
            <p className="text-[12.5px] text-[var(--dash-quiet)]">{clientOrigin.message}</p>
          ) : null}
          <FigureGrid columns={4}>
            {present([clientsActive, clientsInactive]).map((metric) => (
              <Figure key={metric.key} metric={metric} />
            ))}
          </FigureGrid>
        </AnalyticsCard>
      ) : null}
      <Leftovers find={find} />
    </Grid>
  )
}

function BreakdownSplit({ breakdown }: { breakdown: AnalyticsBreakdown }) {
  const total = breakdown.items.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3.5 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={`${breakdown.label}: ${breakdown.items.map((item) => `${item.label} ${formatCount(item.value)}`).join(', ')}`}>
        {breakdown.items.map((item, index) =>
          item.value > 0 && total > 0 ? (
            <span
              key={item.key}
              style={{ flexGrow: item.value, background: index === 0 ? 'var(--dash-series-1)' : 'var(--dash-series-2)' }}
            />
          ) : null,
        )}
      </div>
      <div className="flex flex-wrap justify-between gap-x-4 text-[12px] text-[var(--dash-quiet)]" aria-hidden="true">
        {breakdown.items.map((item, index) => (
          <span key={item.key} className="inline-flex items-center">
            <i
              className="me-1.5 inline-block size-2 rounded-[2px]"
              style={{ background: index === 0 ? 'var(--dash-series-1)' : 'var(--dash-series-2)' }}
            />
            {item.label} <b className="ms-1 text-[var(--dash-ink)] tabular-nums">{formatCount(item.value)}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/* --------------------------------------------------------------- operations */

function OperationsTab({ section }: { section: AnalyticsSectionResponse }) {
  const find = lookup(section)
  const made = find.metric('booking.made')
  const completed = find.metric('booking.completed')
  const noShow = find.metric('booking.noShow')
  // Shown by the status bars; named so they are not repeated under More figures.
  find.metric('booking.cancelled')
  const noShowRate = find.metric('booking.noShowRate')
  const upcoming = find.metric('booking.upcoming')
  const status = find.breakdown('booking.status')
  const methods = find.breakdown('booking.methods')
  const inboxOrigins = find.breakdown('inbox.origins')
  const kinds = find.breakdown('media.kinds')
  const kindBytes = find.breakdown('media.kindBytes')

  return (
    <Grid>
      {made ? (
        <SeriesCard
          metric={made}
          name={['booking made', 'bookings made']}
          extra={
            upcoming?.state === 'ready' && upcoming.value !== null ? (
              <span>· {formatCount(upcoming.value)} coming up in the next 7 days</span>
            ) : null
          }
        />
      ) : null}
      {noShowRate ? (
        <RateCard
          metric={noShowRate}
          of={{ numerator: 'no-show', denominator: 'marked' }}
          parts={[
            { key: 'completed', label: 'Completed', value: completed?.value ?? 0 },
            { key: 'no-show', label: 'No-show', value: noShow?.value ?? 0 },
          ]}
        />
      ) : null}
      {status ? (
        <BreakdownCard
          breakdown={status}
          title="Appointments"
          sub="By when they take place, with their status now"
        />
      ) : null}
      {methods ? <BreakdownCard breakdown={methods} title="How you met" sub="Cancelled appointments left out" /> : null}
      <FiguresCard title="Inbox" metrics={[find.metric('inbox.new'), find.metric('inbox.unread')]}>
        {inboxOrigins && inboxOrigins.state === 'ready' ? (
          <BreakdownInline breakdown={inboxOrigins} />
        ) : null}
      </FiguresCard>
      <FiguresCard
        title="Media library"
        sub="Housekeeping, not marketing"
        metrics={[find.metric('media.files'), find.metric('media.bytes'), find.metric('media.added'), find.metric('media.public')]}
      >
        {kinds && kinds.state === 'ready' ? (
          <BreakdownInline
            breakdown={kinds}
            bytes={kindBytes?.state === 'ready' ? kindBytes : undefined}
          />
        ) : null}
      </FiguresCard>
      <FiguresCard
        title="Blog"
        metrics={[
          find.metric('blog.firstPublished'),
          find.metric('blog.comments'),
          find.metric('blog.unseenComments'),
          find.metric('blog.live'),
          find.metric('blog.reads'),
          find.metric('blog.likes'),
        ]}
        columns={3}
        span="full"
      />
      <Leftovers find={find} />
    </Grid>
  )
}

/** A small breakdown under a card's figures: its bars, labelled, no card of its own. */
function BreakdownInline({ breakdown, bytes }: { breakdown: AnalyticsBreakdown; bytes?: AnalyticsBreakdown }) {
  const max = Math.max(1, ...breakdown.items.map((item) => item.value))

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--dash-soft)] pt-3">
      <p className="text-[12px] text-[var(--dash-quiet)]">{breakdown.label}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={breakdown.label}>
        {breakdown.items.map((item) => {
          const size = bytes?.items.find((entry) => entry.key === item.key)

          return (
            <li key={item.key} className="grid grid-cols-[minmax(80px,120px)_minmax(0,1fr)_auto] items-center gap-2.5 text-[12.5px]">
              <span className="truncate">{item.label}</span>
              <span className="relative h-2.5" aria-hidden="true">
                <span
                  className="absolute inset-y-0 start-0 rounded-e-[4px] bg-[var(--dash-series-1)]"
                  style={{ width: `${(item.value / max) * 100}%`, minWidth: item.value > 0 ? 2 : 0 }}
                />
              </span>
              <span className="text-end font-semibold tabular-nums">
                {formatCount(item.value)}
                {size ? (
                  <small className="ms-1 font-normal text-[var(--dash-quiet)]">
                    · {formatBytes(size.value)}
                  </small>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------------- money */

function MoneyTab({ section }: { section: AnalyticsSectionResponse }) {
  const find = lookup(section)
  const received = find.metric('money.received')
  const refunds = find.metric('money.refunds')
  const overdue = find.metric('invoices.overdue')
  const outstanding = find.metric('invoices.outstanding')
  const status = find.breakdown('invoices.status')
  const all = present([received, refunds, overdue, outstanding, status])

  if (all.length > 0 && all.every((figure) => figure.state === 'not-built')) {
    return (
      <Grid>
        <NotConnectedBox title="No money figures yet">
          <p>{received?.message ?? 'Invoices are not built yet, so there is no money figure. This is not zero.'}</p>
        </NotConnectedBox>
        <Leftovers find={find} />
      </Grid>
    )
  }

  return (
    <Grid>
      {received ? (
        <AnalyticsCard
          title="Received"
          sub="After refunds · euros and dollars kept apart"
          figures={present([received, refunds])}
          state={received.state}
          message={received.message}
        >
          <Figure metric={received} label="Money received" />
          {refunds ? (
            <p className="text-[12px] text-[var(--dash-quiet)]">
              Refunds recorded:{' '}
              {refunds.state !== 'ready' ? (
                <StateChip state={refunds.state} />
              ) : (refunds.amounts ?? []).filter((amount) => amount.minor !== 0).length === 0 ? (
                <b className="text-[var(--dash-ink)]">none</b>
              ) : (
                <b className="text-[var(--dash-ink)] tabular-nums">
                  {(refunds.amounts ?? []).map((amount) => formatMoney(amount)).join(' · ')}
                </b>
              )}
            </p>
          ) : null}
        </AnalyticsCard>
      ) : null}
      <AnalyticsCard
        title="Open invoices"
        sub="Issued invoices only, right now"
        figures={present([overdue, outstanding])}
        state={sharedState([overdue, outstanding])}
        message={overdue?.message}
      >
        <FigureGrid>
          {overdue ? <BalanceFigure metric={overdue} late /> : null}
          {outstanding ? <BalanceFigure metric={outstanding} /> : null}
        </FigureGrid>
      </AnalyticsCard>
      {status ? <BreakdownCard breakdown={status} span="full" /> : null}
      <Leftovers find={find} />
    </Grid>
  )
}

/** A count with its balance per currency underneath — the amount is secondary. */
function BalanceFigure({ metric, late = false }: { metric: AnalyticsMetric; late?: boolean }) {
  const balance = metric.state === 'ready' ? (metric.amounts ?? []) : []

  return (
    <Figure
      metric={{ ...metric, amounts: undefined }}
      tone={late ? 'late' : undefined}
      detail={balance.length > 0 ? `${balance.map((amount) => formatMoney(amount)).join(' · ')} still to pay` : undefined}
    />
  )
}

/* ---------------------------------------------------------------- assistant */

function AssistantTab({ section }: { section: AnalyticsSectionResponse }) {
  const find = lookup(section)

  return (
    <Grid>
      <FiguresCard
        title="Assistant conversations"
        sub="Statistics only — no conversation text is shown or sent anywhere"
        metrics={[
          find.metric('assistant.conversations'),
          find.metric('assistant.unanswered'),
          find.metric('assistant.referrals'),
          find.metric('assistant.cost'),
        ]}
        columns={4}
        span="full"
      />
      <Leftovers find={find} />
    </Grid>
  )
}

/* -------------------------------------------------------------------- entry */

export function SectionBody({ section, origin }: { section: AnalyticsSectionResponse; origin: LeadOrigin }) {
  switch (section.section) {
    case 'website':
      return <WebsiteTab section={section} />
    case 'sales':
      return <SalesTab section={section} origin={origin} />
    case 'operations':
      return <OperationsTab section={section} />
    case 'money':
      return <MoneyTab section={section} />
    case 'assistant':
      return <AssistantTab section={section} />
  }
}

/** Every caveat the section's groups carry, once each. */
export const sectionNotes = (section: AnalyticsSectionResponse): string[] => [
  ...new Set(section.groups.flatMap((group) => group.notes)),
]
