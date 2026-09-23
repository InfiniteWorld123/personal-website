import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CalendarDays, ChartLine, Clock, Handshake, Inbox, PenLine, Users } from 'lucide-react'
import type { AnalyticsMetric, AnalyticsSectionResponse } from '#/backend2/contracts/analytics.contract'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import {
  STATE_VALUE,
  berlinLongDate,
  formatCount,
  formatDelta,
  formatMoney,
  greeting,
  moneyDelta,
} from '#/frontend/features/analytics-v2/format'
import { useOverview, useSection } from '#/frontend/features/analytics-v2/queries'
import { cn } from '#/frontend/lib/utils'
import { ModuleLink, StateChip } from './analytics/analytics-cards'

/**
 * What `/dashboard` opens on, as approved in the Design Lab (24 Sep 2026):
 * a greeting, four headline figures, then what needs the owner now and what
 * happened this week — each linking into its module, with the full picture
 * one click away in Analytics.
 *
 * Every number is real and read from Backend2. A figure whose source is not
 * connected, not built or failing says so in words and is never shown as 0;
 * one failing source leaves the others standing.
 */

const OVERVIEW_PERIOD = '30d' as const

const plural = (count: number, one: string, many: string) => `${formatCount(count)} ${count === 1 ? one : many}`

const findMetric = (list: AnalyticsMetric[] | undefined, key: string) => list?.find((metric) => metric.key === key)

const sectionMetric = (section: AnalyticsSectionResponse | undefined, key: string) =>
  section?.groups.flatMap((group) => group.metrics).find((metric) => metric.key === key)

const readyValue = (metric: AnalyticsMetric | undefined): number | null =>
  metric?.state === 'ready' && metric.value !== null ? metric.value : null

/* -------------------------------------------------------------------- tiles */

function Tile({
  label,
  metric,
  loading,
  failed,
  tone,
  value,
  sub,
  foot,
}: {
  label: string
  metric: AnalyticsMetric | undefined
  loading: boolean
  failed: boolean
  tone?: 'late'
  value?: ReactNode
  sub?: ReactNode
  foot?: ReactNode
}) {
  const state = failed ? 'error' : metric?.state
  const ready = state === 'ready'

  return (
    <section
      aria-label={label}
      className="dash-panel relative flex min-h-[132px] min-w-0 flex-col gap-1.5 px-4 py-3.5"
    >
      <h2 className="flex flex-wrap items-center justify-between gap-1.5 text-[11px] font-bold tracking-[0.12em] text-[var(--dash-quiet)] uppercase">
        {label}
        {state ? <StateChip state={state} /> : null}
      </h2>
      {loading ? (
        <>
          <span className="dash-skeleton mt-1 h-7 w-24" />
          <span className="dash-skeleton h-3 w-36" />
        </>
      ) : ready ? (
        <>
          <p
            className={cn(
              'dash-figure text-[26px] sm:text-[28px]',
              tone === 'late' && 'text-[var(--dash-red-ink)]',
            )}
          >
            {value}
          </p>
          {sub ? <p className="text-[12px] leading-snug text-[var(--dash-quiet)]">{sub}</p> : null}
        </>
      ) : (
        <>
          <p
            className={cn(
              'text-[16px] font-semibold',
              state === 'error' ? 'text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]',
            )}
          >
            {state ? STATE_VALUE[state as Exclude<typeof state, 'ready'>] : STATE_VALUE.error}
          </p>
          <p className="text-[12px] leading-snug text-[var(--dash-quiet)]">
            {failed ? 'This figure did not arrive. The others are unaffected.' : metric?.message}
          </p>
        </>
      )}
      {!loading && ready && foot ? (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-[11.5px] text-[var(--dash-quiet)]">{foot}</div>
      ) : null}
    </section>
  )
}

function DeltaChip({ text }: { text: string | null }) {
  if (!text) return null

  return (
    <span className="rounded-[5px] bg-[var(--dash-chip)] px-1.5 py-px text-[11.5px] font-semibold tabular-nums">
      {text} vs the 30 days before
    </span>
  )
}

/* --------------------------------------------------------------------- rows */

function Row({
  icon,
  tone = 'grey',
  title,
  detail,
  link,
  linkLabel,
}: {
  icon: ReactNode
  tone?: 'grey' | 'red' | 'blue'
  title: ReactNode
  detail?: ReactNode
  link?: string
  linkLabel: string
}) {
  return (
    <li className="grid grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-[var(--dash-soft)] py-2.5 text-[13px] first:border-0">
      <span
        aria-hidden="true"
        className={cn(
          'grid size-[34px] place-items-center rounded-[9px]',
          tone === 'red' ? 'dash-tone-red' : tone === 'blue' ? 'dash-tone-blue' : 'dash-tone-grey',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <b className="block font-semibold">{title}</b>
        {detail ? <small className="block text-[12px] text-[var(--dash-quiet)]">{detail}</small> : null}
      </span>
      {link ? (
        <ModuleLink href={link}>
          {linkLabel}
          <span className="sr-only">: {typeof title === 'string' ? title : ''}</span>
        </ModuleLink>
      ) : null}
    </li>
  )
}

/** A row whose figure is not a number: its state in words, never a zero. */
function UnavailableRow({ icon, metric, failed, label }: { icon: ReactNode; metric?: AnalyticsMetric; failed: boolean; label: string }) {
  const state = failed ? 'error' : metric?.state ?? 'error'

  return (
    <Row
      icon={icon}
      title={
        <span className={state === 'error' ? 'text-[var(--dash-red-ink)]' : 'text-[var(--dash-quiet)]'}>
          {label}: {STATE_VALUE[state as Exclude<typeof state, 'ready'>].toLowerCase()}
        </span>
      }
      detail={failed ? 'Did not arrive. Other figures are unaffected.' : metric?.message}
      linkLabel=""
    />
  )
}

function RowSkeleton() {
  return (
    <li className="grid grid-cols-[34px_minmax(0,1fr)] items-center gap-2.5 border-t border-[var(--dash-soft)] py-2.5 first:border-0">
      <span className="dash-skeleton size-[34px] rounded-[9px]" />
      <span className="flex flex-col gap-1.5">
        <span className="dash-skeleton h-3.5 w-40" />
        <span className="dash-skeleton h-2.5 w-28" />
      </span>
    </li>
  )
}

function Panel({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="dash-panel flex min-w-0 flex-col gap-2.5 px-4 py-3.5">
      <h2 className="flex items-center justify-between gap-2 text-[13px] font-bold">
        {title}
        <span className="text-[12px] font-medium text-[var(--dash-quiet)]">{note}</span>
      </h2>
      <ul className="m-0 list-none p-0">{children}</ul>
    </section>
  )
}

/* --------------------------------------------------------------------- page */

export function OverviewPage({ name }: { name?: string }) {
  const overview = useOverview(OVERVIEW_PERIOD)
  const salesWeek = useSection('sales', { period: '7d' })
  const opsWeek = useSection('operations', { period: '7d' })

  const now = new Date()
  const firstName = name?.trim().split(/\s+/u)[0]
  const headline = overview.data?.headline
  const glimpse = overview.data?.glimpse
  const loading = overview.isPending
  const failed = overview.isError && !overview.data

  const received = findMetric(headline, 'money.received')
  const overdue = findMetric(headline, 'invoices.overdue')
  const visitors = findMetric(headline, 'website.visitors')
  const unread = findMetric(headline, 'inbox.unread')
  const followUps = findMetric(glimpse, 'leads.followUpsDue')
  const upcoming = findMetric(glimpse, 'booking.upcoming')

  const receivedAmounts = received?.amounts ?? []
  const overdueCount = readyValue(overdue)

  return (
    <DashboardPage className="@container gap-4">
      <PageHead
        eyebrow="OVERVIEW"
        title={
          <span suppressHydrationWarning>
            {greeting(now)}
            {firstName ? `, ${firstName}` : ''}
          </span>
        }
        actions={
          <Link to="/dashboard/analytics" className="dash-btn dash-btn-quiet">
            <ChartLine className="size-4" aria-hidden="true" />
            Open analytics
          </Link>
        }
        description={<span suppressHydrationWarning>{berlinLongDate(now)} · figures cover the last 30 days</span>}
        className="dash-rise dash-rise-1"
      />

      {failed ? (
        <div role="alert" className="dash-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px]">
          <span>
            <b className="font-semibold">The headline figures could not be loaded.</b>{' '}
            <span className="text-[var(--dash-quiet)]">Nothing is shown in their place.</span>
          </span>
          <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12.5px]" onClick={() => void overview.refetch()}>
            Try again
          </button>
        </div>
      ) : null}

      <div className="dash-rise dash-rise-2 grid grid-cols-2 gap-3 @4xl:grid-cols-4">
        <Tile
          label="Received"
          metric={received}
          loading={loading}
          failed={failed}
          value={
            receivedAmounts.length === 0 ? (
              '0'
            ) : (
              <>
                {formatMoney(receivedAmounts[0]!)}
                {receivedAmounts.slice(1).map((amount) => (
                  <small key={amount.currency} className="mt-1 block text-[14px] font-medium tracking-normal text-[var(--dash-quiet)]">
                    {formatMoney(amount)}
                  </small>
                ))}
              </>
            )
          }
          sub={
            receivedAmounts.length === 0
              ? 'No payments received in the last 30 days.'
              : 'After refunds. Euros and dollars shown apart.'
          }
          foot={
            <>
              {receivedAmounts.map((amount) => (
                <DeltaChip
                  key={amount.currency}
                  text={
                    received
                      ? ((text) => (text && receivedAmounts.length > 1 ? `${amount.currency} ${text}` : text))(
                          moneyDelta(received, amount.currency),
                        )
                      : null
                  }
                />
              ))}
              {received?.link ? <ModuleLink href={received.link}>Invoices</ModuleLink> : null}
            </>
          }
        />
        <Tile
          label="Overdue"
          metric={overdue}
          loading={loading}
          failed={failed}
          tone={overdueCount !== null && overdueCount > 0 ? 'late' : undefined}
          value={overdueCount === null ? null : formatCount(overdueCount)}
          sub={
            overdueCount === 0
              ? 'No issued invoice is past its due date.'
              : (overdue?.amounts ?? []).length > 0
                ? `${(overdue?.amounts ?? []).map((amount) => formatMoney(amount)).join(' · ')} still to pay`
                : undefined
          }
          foot={overdue?.link ? <ModuleLink href={overdue.link}>Invoices</ModuleLink> : null}
        />
        <Tile
          label="Visitors"
          metric={visitors}
          loading={loading}
          failed={failed}
          value={readyValue(visitors) === null ? null : formatCount(readyValue(visitors)!)}
          sub="People on the public site"
          foot={<DeltaChip text={visitors && readyValue(visitors) !== null ? formatDelta(visitors.value!, visitors.previous?.value) : null} />}
        />
        <Tile
          label="Unread inbox"
          metric={unread}
          loading={loading}
          failed={failed}
          value={readyValue(unread) === null ? null : formatCount(readyValue(unread)!)}
          sub={readyValue(unread) === 0 ? 'Every conversation is read.' : 'Conversations waiting for you'}
          foot={unread?.link ? <ModuleLink href={unread.link}>Open Inbox</ModuleLink> : null}
        />
      </div>

      <div className="dash-rise dash-rise-3 grid grid-cols-1 gap-3 @4xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="Needs you" note="live from Leads, Calendar, Inbox">
          {loading ? (
            <>
              <RowSkeleton />
              <RowSkeleton />
              <RowSkeleton />
            </>
          ) : (
            <>
              <NeedsRow
                metric={followUps}
                failed={failed}
                icon={<Clock className="size-3.5" />}
                label="Follow-ups"
                render={(count) => ({
                  tone: count > 0 ? 'red' : 'grey',
                  title: count > 0 ? `${plural(count, 'follow-up is', 'follow-ups are')} due` : 'No follow-ups due',
                  detail: count > 0 ? 'Open the list to call or write back' : 'Nothing has reached its time',
                  link: '/dashboard/leads/follow-ups?when=due',
                  linkLabel: 'Open',
                })}
              />
              <NeedsRow
                metric={upcoming}
                failed={failed}
                icon={<CalendarDays className="size-3.5" />}
                label="Appointments"
                render={(count) => ({
                  tone: count > 0 ? 'blue' : 'grey',
                  title: count > 0 ? `${plural(count, 'appointment', 'appointments')} in the next 7 days` : 'No appointments in the next 7 days',
                  detail: 'Confirmed bookings, by when they take place',
                  link: '/dashboard/calendar',
                  linkLabel: 'Calendar',
                })}
              />
              <NeedsRow
                metric={unread}
                failed={failed}
                icon={<Inbox className="size-3.5" />}
                label="Inbox"
                render={(count) => ({
                  tone: 'grey',
                  title: count > 0 ? `${plural(count, 'unread conversation', 'unread conversations')}` : 'Nothing unread',
                  detail: count > 0 ? 'Waiting in the Inbox' : 'You are up to date',
                  link: '/dashboard/inbox',
                  linkLabel: 'Inbox',
                })}
              />
            </>
          )}
        </Panel>

        <Panel title="This week" note="the last 7 days">
          <WeekRows sales={salesWeek} ops={opsWeek} />
        </Panel>
      </div>
    </DashboardPage>
  )
}

function NeedsRow({
  metric,
  failed,
  icon,
  label,
  render,
}: {
  metric: AnalyticsMetric | undefined
  failed: boolean
  icon: ReactNode
  label: string
  render: (count: number) => { tone: 'grey' | 'red' | 'blue'; title: string; detail: string; link: string; linkLabel: string }
}) {
  const count = readyValue(metric)

  if (failed || count === null) return <UnavailableRow icon={icon} metric={metric} failed={failed} label={label} />

  const row = render(count)

  return <Row icon={icon} {...row} />
}

type SectionQuery = ReturnType<typeof useSection>

function WeekRows({ sales, ops }: { sales: SectionQuery; ops: SectionQuery }) {
  const rows: ReactNode[] = []

  const block = (query: SectionQuery, build: (data: AnalyticsSectionResponse) => ReactNode, label: string, icon: ReactNode) => {
    if (query.isPending) return <RowSkeleton key={label} />
    if (!query.data) return <UnavailableRow key={label} icon={icon} failed label={label} />

    return build(query.data)
  }

  const count = (metric: AnalyticsMetric | undefined) => readyValue(metric)

  rows.push(
    block(
      sales,
      (data) => {
        const created = sectionMetric(data, 'leads.new')
        const won = count(sectionMetric(data, 'leads.won'))
        const lost = count(sectionMetric(data, 'leads.lost'))
        const value = count(created)

        return value === null ? (
          <UnavailableRow key="leads" icon={<Handshake className="size-3.5" />} metric={created} failed={false} label="New leads" />
        ) : (
          <Row
            key="leads"
            icon={<Handshake className="size-3.5" />}
            title={plural(value, 'new lead', 'new leads')}
            detail={won !== null && lost !== null ? `${formatCount(won)} won · ${formatCount(lost)} lost` : undefined}
            link="/dashboard/leads"
            linkLabel="Leads"
          />
        )
      },
      'New leads',
      <Handshake className="size-3.5" />,
    ),
  )

  rows.push(
    block(
      sales,
      (data) => {
        const created = sectionMetric(data, 'clients.new')
        const fromLeads = count(sectionMetric(data, 'clients.fromLeads'))
        const value = count(created)

        return value === null ? (
          <UnavailableRow key="clients" icon={<Users className="size-3.5" />} metric={created} failed={false} label="New clients" />
        ) : (
          <Row
            key="clients"
            icon={<Users className="size-3.5" />}
            title={plural(value, 'new client', 'new clients')}
            detail={fromLeads !== null && value > 0 ? `${formatCount(fromLeads)} from a won lead` : undefined}
            link="/dashboard/clients"
            linkLabel="Clients"
          />
        )
      },
      'New clients',
      <Users className="size-3.5" />,
    ),
  )

  rows.push(
    block(
      ops,
      (data) => {
        const made = sectionMetric(data, 'booking.made')
        const completed = count(sectionMetric(data, 'booking.completed'))
        const cancelled = count(sectionMetric(data, 'booking.cancelled'))
        const value = count(made)

        return value === null ? (
          <UnavailableRow key="bookings" icon={<CalendarDays className="size-3.5" />} metric={made} failed={false} label="Bookings" />
        ) : (
          <Row
            key="bookings"
            icon={<CalendarDays className="size-3.5" />}
            title={plural(value, 'booking made', 'bookings made')}
            detail={
              completed !== null && cancelled !== null
                ? `${formatCount(completed)} completed · ${formatCount(cancelled)} cancelled`
                : undefined
            }
            link="/dashboard/calendar"
            linkLabel="Calendar"
          />
        )
      },
      'Bookings',
      <CalendarDays className="size-3.5" />,
    ),
  )

  rows.push(
    block(
      ops,
      (data) => {
        const published = sectionMetric(data, 'blog.firstPublished')
        const comments = count(sectionMetric(data, 'blog.comments'))
        const value = count(published)

        return value === null ? (
          <UnavailableRow key="blog" icon={<PenLine className="size-3.5" />} metric={published} failed={false} label="Articles" />
        ) : (
          <Row
            key="blog"
            icon={<PenLine className="size-3.5" />}
            title={plural(value, 'article published', 'articles published')}
            detail={comments !== null ? plural(comments, 'visitor comment', 'visitor comments') : undefined}
            link="/dashboard/blog"
            linkLabel="Blog"
          />
        )
      },
      'Articles',
      <PenLine className="size-3.5" />,
    ),
  )

  return <>{rows}</>
}
