import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, CalendarClock, Mail } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelBody, PanelHeader, PanelNote, PanelTitle } from '#/frontend/components/admin/Panel'
import { StatCard, StatCardSkeleton } from '#/frontend/components/admin/StatCard'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { adminBookingsQuery } from '#/frontend/features/booking/booking-queries'
import { toBookingFilterInput } from '#/frontend/features/booking/booking-filters'
import { formatDateTime } from '#/frontend/features/booking/booking-time'
import { inboxQuery, personQuery } from '#/frontend/features/inbox/inbox-queries'
import { invoicesQuery, summaryQuery } from '#/frontend/features/invoices/invoice-queries'
import { money, monthName } from '#/frontend/features/invoices/invoice-format'
import { adminBookingQuery } from '#/frontend/features/booking/booking-queries'
import { leadsQuery, overdueQuery } from '#/frontend/features/leads/lead-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'

/**
 * The desk he opens in the morning.
 *
 * Every figure on this page is read from a row. Nothing is estimated, nothing
 * is a placeholder, and nothing is summed across the two kinds of money — so
 * there is no card here that could quietly become the lie that got the last
 * dashboard deleted.
 *
 * One card carries the brand fill, and it is the one that answers the only
 * question worth asking every morning: **did money arrive this month.** The
 * rest are quiet until they have something to say — the overdue card turns red
 * only when something actually is, because a red badge that is always there is
 * a badge he stops seeing.
 */

const BERLIN = 'Europe/Berlin'

export function OverviewPage() {
  const prefetch = usePrefetch()

  const summary = useQuery(summaryQuery())
  const overdueFollowUps = useQuery(overdueQuery())
  const inbox = useQuery(inboxQuery('inbox', ''))
  const calls = useQuery(adminBookingsQuery(toBookingFilterInput({})))

  const figures = summary.data
  const unread = (inbox.data ?? []).filter((row) => row.unreadCount > 0).length
  const upcoming = (calls.data?.items ?? []).filter((item) => item.status !== 'CANCELLED')

  return (
    <AdminPage>
      <PageHeader
        title="Today"
        description="What is owed, what is waiting, and what is booked. Every figure here is counted from a record — nothing on this page is an estimate unless its own card says so."
      />

      {/* ── The figures ───────────────────────────────────────────────
          A bento rather than a row of equal tiles: the tile that carries
          the answer is twice the size of the ones that qualify it, so the
          order of importance is legible before a single number is read. */}
      <section aria-label="Figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.isPending ? (
          <SkeletonScreen label="Loading this month's figures" className="contents">
            <StatCardSkeleton className="sm:col-span-2 xl:row-span-2" />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
            <StatCardSkeleton />
          </SkeletonScreen>
        ) : summary.isError ? (
          <Panel className="sm:col-span-2 xl:col-span-4">
            <PanelNote tone="error">
              <p>The money figures could not be read. {(summary.error as Error).message}</p>
              <Button onClick={() => void summary.refetch()} type="button" variant="outline">
                Try again
              </Button>
            </PanelNote>
          </Panel>
        ) : figures ? (
          <>
            <StatCard
              className="sm:col-span-2 xl:row-span-2 xl:justify-center"
              foot={`Paid in ${monthName(figures.month)}, counted by the day it landed in the account`}
              label="Arrived this month"
              to="/admin/invoices"
              prefetch={prefetch(invoicesQuery('ALL', ''), summaryQuery())}
              tone="brand"
              value={money(figures.thisMonthCents)}
            />

            <StatCard
              foot={
                figures.overdueCount === 0
                  ? 'Nothing is past its date'
                  : `${figures.overdueCount} ${figures.overdueCount === 1 ? 'invoice is' : 'invoices are'} past the day it was due`
              }
              label="Overdue"
              to="/admin/invoices"
              prefetch={prefetch(invoicesQuery('ALL', ''), summaryQuery())}
              tone={figures.overdueCents > 0 ? 'alert' : 'plain'}
              value={money(figures.overdueCents)}
            />

            <StatCard
              foot={`${figures.openCount} ${figures.openCount === 1 ? 'invoice' : 'invoices'} still out with a client`}
              label="Still owed"
              to="/admin/invoices"
              prefetch={prefetch(invoicesQuery('ALL', ''), summaryQuery())}
              value={money(figures.openCents)}
            />

            <StatCard
              foot="Subscriptions billed in the last forty days. Build money cannot reach this figure."
              label="Recurring, per month"
              to="/admin/invoices"
              prefetch={prefetch(invoicesQuery('ALL', ''), summaryQuery())}
              value={money(figures.recurringCents)}
            />

            <StatCard
              foot="Thirty per cent of what arrived. An estimate to put aside, not tax advice."
              label="Set aside for tax"
              value={money(figures.taxPotCents)}
            />
          </>
        ) : null}
      </section>

      {/* ── What is waiting for him ───────────────────────────────── */}
      <section aria-label="Waiting" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {inbox.isPending ? (
          <SkeletonScreen label="Loading the inbox count" className="contents">
            <StatCardSkeleton />
          </SkeletonScreen>
        ) : inbox.isError ? (
          <Panel>
            <PanelNote tone="error">
              <p>The inbox could not be read.</p>
              <Button onClick={() => void inbox.refetch()} size="sm" type="button" variant="outline">
                Try again
              </Button>
            </PanelNote>
          </Panel>
        ) : (
          <StatCard
            foot={unread === 0 ? 'Everyone has been answered' : 'Nobody has had a reply yet'}
            label="Unanswered"
            to="/admin/inbox"
            prefetch={prefetch(inboxQuery('inbox', ''))}
            tone={unread > 0 ? 'alert' : 'plain'}
            value={unread}
          />
        )}

        {overdueFollowUps.isPending ? (
          <SkeletonScreen label="Loading follow-ups" className="contents">
            <StatCardSkeleton />
          </SkeletonScreen>
        ) : overdueFollowUps.isError ? (
          <Panel>
            <PanelNote tone="error">
              <p>The follow-ups could not be read.</p>
              <Button
                onClick={() => void overdueFollowUps.refetch()}
                size="sm"
                type="button"
                variant="outline"
              >
                Try again
              </Button>
            </PanelNote>
          </Panel>
        ) : (
          <StatCard
            foot={
              (overdueFollowUps.data ?? 0) === 0
                ? 'Nobody is waiting on a promise'
                : 'You said you would write, and the day has passed'
            }
            label="Follow-ups due"
            to="/admin/leads"
            prefetch={prefetch(leadsQuery('ALL', ''))}
            tone={(overdueFollowUps.data ?? 0) > 0 ? 'alert' : 'plain'}
            value={overdueFollowUps.data ?? 0}
          />
        )}

        {calls.isPending ? (
          <SkeletonScreen label="Loading upcoming calls" className="contents">
            <StatCardSkeleton className="sm:col-span-2" />
          </SkeletonScreen>
        ) : calls.isError ? (
          <Panel className="sm:col-span-2">
            <PanelNote tone="error">
              <p>The calendar could not be read.</p>
              <Button onClick={() => void calls.refetch()} size="sm" type="button" variant="outline">
                Try again
              </Button>
            </PanelNote>
          </Panel>
        ) : (
          <StatCard
            className="sm:col-span-2"
            foot={
              upcoming[0]
                ? `${upcoming[0].visitorName} · ${formatDateTime(upcoming[0].startsAt, BERLIN, 'en')}`
                : 'Nothing is booked. Your hours are still open.'
            }
            label="Calls ahead"
            to="/admin/bookings"
            prefetch={prefetch(adminBookingsQuery(toBookingFilterInput({})))}
            value={upcoming.length}
          />
        )}
      </section>

      {/* ── The two lists ─────────────────────────────────────────── */}
      <section aria-label="Lists" className="grid gap-4 lg:grid-cols-2">
        <NextCalls />
        <LatestConversations />
      </section>
    </AdminPage>
  )
}

/* -------------------------------------------------------------------------- */

function ListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <SkeletonScreen label={label}>
      <ul className="flex flex-col gap-3">
        {Array.from({ length: rows }, (_, index) => (
          <li className="flex items-center gap-3" key={index}>
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="mt-2 h-3 w-56" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonScreen>
  )
}

function NextCalls() {
  const prefetch = usePrefetch()
  const calls = useQuery(adminBookingsQuery(toBookingFilterInput({})))
  const upcoming = (calls.data?.items ?? []).filter((item) => item.status !== 'CANCELLED').slice(0, 4)

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Next calls</PanelTitle>
        <Button asChild className="rounded-full" size="sm" variant="ghost">
          <Link
            to="/admin/bookings"
            {...prefetch(adminBookingsQuery(toBookingFilterInput({})))}
          >
            Calendar
            <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </PanelHeader>

      <PanelBody>
        {calls.isPending ? (
          <ListSkeleton label="Loading the next calls" />
        ) : calls.isError ? (
          <PanelNote tone="error" className="py-8">
            <p>The calendar could not be read. {(calls.error as Error).message}</p>
            <Button onClick={() => void calls.refetch()} size="sm" type="button" variant="outline">
              Try again
            </Button>
          </PanelNote>
        ) : upcoming.length === 0 ? (
          <PanelNote className="py-8">
            <p>Nothing is booked yet.</p>
            <p className="text-muted-foreground/80 max-w-xs text-xs">
              Your hours are open. The booking page shows them to anyone with the link.
            </p>
          </PanelNote>
        ) : (
          <ul className="flex flex-col gap-1">
            {upcoming.map((call) => (
              <li key={call.id}>
                <Link
                  to="/admin/bookings/$id"
                  params={{ id: call.id }}
                  {...prefetch(adminBookingQuery(call.id))}
                  className="hover:bg-accent/60 focus-visible:ring-ring -mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 motion-safe:transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className="bg-primary/10 text-primary grid size-9 shrink-0 place-items-center rounded-full"
                  >
                    <CalendarClock className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{call.visitorName}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {call.bookingTypeName} · {formatDateTime(call.startsAt, BERLIN, 'en')}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  )
}

function LatestConversations() {
  const prefetch = usePrefetch()
  const inbox = useQuery(inboxQuery('inbox', ''))
  const rows = (inbox.data ?? []).slice(0, 4)

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Latest letters</PanelTitle>
        <Button asChild className="rounded-full" size="sm" variant="ghost">
          <Link to="/admin/inbox" {...prefetch(inboxQuery('inbox', ''))}>
            Inbox
            <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </PanelHeader>

      <PanelBody>
        {inbox.isPending ? (
          <ListSkeleton label="Loading the latest letters" />
        ) : inbox.isError ? (
          <PanelNote tone="error" className="py-8">
            <p>The inbox could not be read. {(inbox.error as Error).message}</p>
            <Button onClick={() => void inbox.refetch()} size="sm" type="button" variant="outline">
              Try again
            </Button>
          </PanelNote>
        ) : rows.length === 0 ? (
          <PanelNote className="py-8">
            <p>No letters yet.</p>
            <p className="text-muted-foreground/80 max-w-xs text-xs">
              Anything written through the contact form, or sent to your address, lands here.
            </p>
          </PanelNote>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((row) => (
              <li key={row.id}>
                <Link
                  to="/admin/inbox/$personId"
                  params={{ personId: row.id }}
                  {...prefetch(personQuery(row.id))}
                  className="hover:bg-accent/60 focus-visible:ring-ring -mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 motion-safe:transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  <span
                    aria-hidden="true"
                    className={
                      row.unreadCount > 0
                        ? 'bg-destructive/10 text-destructive grid size-9 shrink-0 place-items-center rounded-full'
                        : 'bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-full'
                    }
                  >
                    <Mail className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.name}</span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {row.subject}
                    </span>
                  </span>
                  {row.unreadCount > 0 ? (
                    <span className="bg-destructive grid min-w-4.5 shrink-0 place-items-center rounded-full px-1 text-[10px] font-semibold text-white tabular-nums">
                      {row.unreadCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  )
}
