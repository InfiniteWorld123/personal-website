import { Link } from '@tanstack/react-router'
import { ArrowUp, ArrowUpRight, Clock, TriangleAlert, Video } from 'lucide-react'
import type { ReactNode } from 'react'
import { count, money, percentChange } from '#/frontend/dashboard/format'
import {
  DashboardPage,
  Initials,
  PageHead,
  Panel,
  PanelHead,
  SampleBadge,
  StatusChip,
} from '#/frontend/dashboard/primitives'
import {
  sampleCollected,
  sampleFigures,
  sampleLeads,
  sampleNextCall,
  sampleProjects,
  sampleToday,
} from '#/frontend/dashboard/sample-data'
import { cn } from '#/frontend/lib/utils'
import { VisitsChart } from './VisitsChart'

/**
 * The screen he opens in the morning.
 *
 * Four figures across the top, in the order he approved: revenue, overdue
 * money, visits, unread mail. Exactly one of them carries the brand fill —
 * the one that answers the question worth asking every morning — because if
 * every card could be the loud one, none of them says anything.
 *
 * Below them the work comes before the trend. The brief's own sketch gave the
 * chart the big half; the owner chose urgent work as the stronger secondary
 * emphasis, so the queues take the wide column and the chart sits beside them.
 *
 * Every figure here is a fixture. The badge in the header says so, and it
 * stays until these panels read from Backend2.
 */
export function OverviewPage() {
  const collectedPercent = Math.round(
    (sampleCollected.paidCents / sampleCollected.invoicedCents) * 100,
  )

  return (
    <DashboardPage>
      <PageHead
        eyebrow="OVERVIEW"
        title="Overview"
        description="Three invoices are past due and two messages are waiting for a reply."
        aside={<SampleBadge />}
        actions={
          <span className="dash-num text-[13px] font-medium text-[var(--dash-quiet)]">
            20.09.2026
          </span>
        }
        className="dash-rise dash-rise-1"
      />

      {/* ── The four figures ───────────────────────────────── */}
      <div className="dash-rise dash-rise-2 mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          brand
          label="Revenue this month"
          value={money(sampleFigures.revenueCents)}
          to="/dashboard/invoices"
          footNote={
            <>
              <ArrowUp aria-hidden="true" className="size-[11px]" />
              {percentChange(sampleFigures.revenueChangePercent)} from August
            </>
          }
        />

        <MetricCard
          label="Overdue"
          value={money(sampleFigures.overdueCents)}
          valueClassName="text-[var(--dash-red)]"
          to="/dashboard/invoices"
          footTone="red"
          footNote={
            <>
              <TriangleAlert aria-hidden="true" className="size-[11px]" />
              {sampleFigures.overdueCount} invoices late
            </>
          }
        />

        <MetricCard
          label="Website visits"
          value={count(sampleFigures.visits)}
          footNote={
            <>
              <ArrowUp aria-hidden="true" className="size-[11px]" />
              {percentChange(sampleFigures.visitsChangePercent)} from August
            </>
          }
        />

        <MetricCard
          label="Unread messages"
          value={count(sampleFigures.unread)}
          to="/dashboard/inbox"
          footTone="blue"
          footNote={`${sampleFigures.unreadNeedingReplyToday} need a reply today`}
        />
      </div>

      {/* ── The work, then the trend ───────────────────────── */}
      <div className="mt-4 grid gap-4 xl:min-h-[620px] xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <VisitsChart className="dash-rise dash-rise-3 xl:flex-[1.15]" />
          <LeadsPanel className="dash-rise dash-rise-5 xl:flex-1" />
        </div>

        <div className="flex flex-col gap-4">
          <TodayPanel className="dash-rise dash-rise-4 xl:flex-[1.15]" />
          <CollectedPanel percent={collectedPercent} className="dash-rise dash-rise-6 xl:flex-1" />
        </div>

        <div className="flex flex-col gap-4">
          <ProjectsPanel className="dash-rise dash-rise-5 xl:flex-[1.15]" />
          <NextCallPanel className="dash-rise dash-rise-6 xl:flex-1" />
        </div>
      </div>
    </DashboardPage>
  )
}

/* ── One figure ───────────────────────────────────────────── */

function MetricCard({
  label,
  value,
  footNote,
  footTone = 'plain',
  valueClassName,
  brand = false,
  to,
}: {
  label: string
  value: string
  footNote: ReactNode
  footTone?: 'plain' | 'red' | 'blue'
  valueClassName?: string
  /** The single card that answers the morning question. Only ever one. */
  brand?: boolean
  /** Omitted when there is no screen to open — an arrow that leads nowhere is
      worse than no arrow. */
  to?: string
}) {
  const body = (
    <>
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'flex-1 text-xs font-semibold',
            brand ? 'text-[var(--dash-blue-label)]' : 'text-[var(--dash-quiet)]',
          )}
        >
          {label}
        </span>
        {to ? (
          <span
            aria-hidden="true"
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full border',
              brand
                ? 'border-white/40 text-white'
                : 'border-[var(--dash-line)] text-[var(--dash-quiet)]',
            )}
          >
            <ArrowUpRight className="size-3.5" />
          </span>
        ) : null}
      </div>

      <p className={cn('dash-figure mt-auto pt-5 text-[38px]', valueClassName)}>{value}</p>

      <p
        className={cn(
          'mt-2.5 flex h-[22px] w-fit items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold',
          brand && 'bg-white/20 text-white',
          !brand && footTone === 'red' && 'dash-tone-red',
          !brand && footTone === 'blue' && 'dash-tone-blue',
          !brand && footTone === 'plain' && 'dash-tone-grey',
        )}
      >
        {footNote}
      </p>
    </>
  )

  // `dash-card` rather than a radius utility: the corner and the lift are the
  // surface's business, and they change when the owner switches it.
  const surface = cn(
    'flex min-h-[138px] flex-col p-5',
    brand ? 'dash-card text-white' : 'dash-panel',
  )

  if (!to) {
    return (
      <div className={surface} style={brand ? { background: 'var(--dash-brand)' } : undefined}>
        {body}
      </div>
    )
  }

  return (
    <Link
      to={to}
      className={cn(surface, 'hover:brightness-[0.98]')}
      style={brand ? { background: 'var(--dash-brand)' } : undefined}
    >
      {body}
    </Link>
  )
}

/* ── Leads ────────────────────────────────────────────────── */

function LeadsPanel({ className }: { className?: string }) {
  return (
    <Panel className={className}>
      <PanelHead
        title="Leads"
        action={
          <Link to="/dashboard/leads" className="dash-btn dash-btn-quiet h-7 px-2.5 text-xs">
            Open
          </Link>
        }
      />
      <ul className="flex flex-1 flex-col px-5 pb-4">
        {sampleLeads.map((lead, index) => (
          <li
            key={lead.id}
            className={cn(
              'dash-row -mx-2 flex flex-1 items-center gap-3 rounded-lg px-2 py-2.5',
              index > 0 && 'border-t border-[var(--dash-soft)]',
            )}
          >
            <Initials tone={index === 0 ? 'blue' : 'grey'}>{lead.initials}</Initials>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{lead.name}</span>
              <span className="block truncate text-[11px] text-[var(--dash-quiet)]">
                {lead.about}
              </span>
            </span>
            <StatusChip tone={lead.tone}>{lead.status}</StatusChip>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/* ── Today ────────────────────────────────────────────────── */

function TodayPanel({ className }: { className?: string }) {
  return (
    <Panel className={className}>
      <PanelHead title="Today" />
      <ul className="flex flex-1 flex-col gap-3.5 px-5">
        {sampleToday.map((item, index) => (
          <li
            key={item.id}
            className={cn('flex gap-3', index > 0 && 'border-t border-[var(--dash-soft)] pt-3.5')}
          >
            <span
              aria-hidden="true"
              className="w-[3px] shrink-0 rounded-sm"
              style={{ background: item.urgent ? 'var(--dash-red)' : 'var(--dash-brand)' }}
            />
            <span className="min-w-0">
              <span className="dash-num block text-[11px] font-semibold text-[var(--dash-quiet)]">
                {item.when}
              </span>
              <span className="mt-0.5 block text-sm leading-snug font-semibold">{item.what}</span>
              <span className="mt-0.5 block text-[11px] text-[var(--dash-quiet)]">
                {item.detail}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <div className="p-5 pt-4">
        <Link to="/dashboard/calendar" className="dash-btn dash-btn-quiet h-9 w-full text-xs">
          Open calendar
        </Link>
      </div>
    </Panel>
  )
}

/* ── How much of it actually landed ───────────────────────── */

function CollectedPanel({ percent, className }: { percent: number; className?: string }) {
  // A half circle of radius 74: the arc is π × 74 ≈ 232px long, and the filled
  // part is that length times the share already paid.
  const arc = Math.PI * 74
  const filled = (arc * percent) / 100

  return (
    <Panel className={className}>
      <PanelHead title="Billed and collected" />

      <div className="relative flex flex-1 items-center justify-center px-5">
        <svg viewBox="0 0 188 104" className="w-full max-w-[188px]" aria-hidden="true">
          <path
            d="M20 94 A 74 74 0 0 1 168 94"
            fill="none"
            stroke="var(--dash-chip)"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            d="M20 94 A 74 74 0 0 1 168 94"
            fill="none"
            stroke="var(--dash-brand)"
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={`${filled} ${arc}`}
          />
        </svg>
        <span className="absolute inset-x-0 bottom-1 text-center">
          <span className="dash-figure block text-[30px]">{percent}&#8239;%</span>
          <span className="mt-1 block text-[11px] text-[var(--dash-quiet)]">
            of everything billed
          </span>
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3.5 border-t border-[var(--dash-soft)] px-5 py-3 text-[11px] text-[var(--dash-quiet)]">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-sm"
            style={{ background: 'var(--dash-brand)' }}
          />
          Paid
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-sm"
            style={{ background: 'var(--dash-chip)' }}
          />
          Open
        </span>
        <span className="dash-num ms-auto font-semibold text-[var(--dash-ink)]">
          {money(sampleCollected.invoicedCents)}
        </span>
      </div>
    </Panel>
  )
}

/* ── Projects ─────────────────────────────────────────────── */

function ProjectsPanel({ className }: { className?: string }) {
  return (
    <Panel className={className}>
      <PanelHead
        title="Projects"
        action={
          <Link to="/dashboard/projects" className="dash-btn dash-btn-quiet h-7 px-2.5 text-xs">
            Open
          </Link>
        }
      />
      <ul className="flex flex-1 flex-col px-5 pb-4">
        {sampleProjects.map((project, index) => (
          <li
            key={project.id}
            className={cn(
              'dash-row -mx-2 flex flex-1 items-center gap-3 rounded-lg px-2 py-2.5',
              index > 0 && 'border-t border-[var(--dash-soft)]',
            )}
          >
            <Initials tone={index === 0 ? 'blue' : 'grey'} className="size-7 rounded-lg">
              {project.initials}
            </Initials>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{project.name}</span>
              <span className="block truncate text-[11px] text-[var(--dash-quiet)]">
                {project.note}
              </span>
            </span>
            <span className="sr-only">{project.live ? 'Visible on the site' : 'Hidden'}</span>
            <span
              aria-hidden="true"
              className={cn('size-[7px] shrink-0 rounded-full')}
              style={
                project.live
                  ? { background: 'var(--dash-live)' }
                  : { border: '1px solid var(--dash-quiet)' }
              }
            />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/* ── The one that is about to happen ──────────────────────── */

function NextCallPanel({ className }: { className?: string }) {
  return (
    <div className={cn('dash-slab flex flex-col p-5', className)}>
      <p className="text-[10px] font-bold tracking-[0.16em] text-[var(--dash-slab-quiet)]">
        NEXT CALL IN
      </p>
      <p className="dash-figure mt-auto pt-4 text-[40px]">{sampleNextCall.countdown}</p>
      <p className="mt-1.5 text-[11px] text-[var(--dash-slab-quiet)]">
        {sampleNextCall.who} · {sampleNextCall.at}
      </p>

      <div className="mt-auto flex gap-2.5 pt-4">
        <Link to="/dashboard/calendar" className="dash-btn dash-btn-primary h-9 flex-1 text-xs">
          <Video aria-hidden="true" className="size-4" />
          Join room
        </Link>
        <Link
          to="/dashboard/calendar"
          aria-label="Reschedule this call"
          className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-white/20 text-[var(--dash-slab-ink)] hover:bg-white/10"
        >
          <Clock aria-hidden="true" className="size-4" />
        </Link>
      </div>
    </div>
  )
}
