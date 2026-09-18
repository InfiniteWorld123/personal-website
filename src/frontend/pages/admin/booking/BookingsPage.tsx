import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CalendarClock, CalendarPlus, Clock3, Settings2, Video } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import {
  adminBookingQuery,
  adminBookingTypesQuery,
  adminBookingsQuery,
  availabilityQuery,
  bookingTypesQuery,
} from '#/frontend/features/booking/booking-queries'
import {
  hasActiveBookingFilters,
  toBookingFilterInput,
  type BookingSearch,
} from '#/frontend/features/booking/booking-filters'
import {
  BOOKING_PAGE_SIZE,
  BOOKING_RANGE_FILTERS,
  BOOKING_STATUS_FILTERS,
} from '#/shared/validation/booking.validation'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import { isCallOpen } from '#/shared/types/call.types'
import type { AdminBookingListItem } from '#/shared/types/booking.types'
import { StatusPill, formatBerlin } from './booking-admin-ui'

/**
 * The calendar as a list.
 *
 * Every row is one call and the whole row opens it — the old table made only
 * the date clickable, which meant pointing at somebody's name did nothing.
 * The one thing on a row that is not the row is the Join button, and it is
 * there for about ninety minutes of any given week.
 */

function Row({ booking }: { booking: AdminBookingListItem }) {
  const prefetch = usePrefetch()

  return (
    <div className="hover:bg-accent/50 has-[a:focus-visible]:bg-accent/50 border-border/60 relative flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0 motion-safe:transition-colors">
      {/*
        The link is stretched over the whole row by its own pseudo element, so
        the Join button beside it keeps its own click without being nested
        inside an anchor.
      */}
      <Link
        to="/admin/bookings/$id"
        params={{ id: booking.id }}
        // The booking this row opens, fetched while the pointer is still on it.
        {...prefetch(adminBookingQuery(booking.id))}
        className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-md after:absolute after:inset-0 after:content-[''] focus-visible:ring-2 focus-visible:outline-none"
      >
        <StatusPill status={booking.status} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{booking.visitorName}</span>
          <span className="text-muted-foreground block truncate text-xs">
            {booking.bookingTypeName} ·{' '}
            <span dir="ltr">{booking.visitorEmail}</span>
          </span>
        </span>

        <span className="text-end">
          <span className="tabular block text-sm font-medium whitespace-nowrap">
            {formatBerlin(booking.startsAt)}
          </span>
          <span className="tabular text-muted-foreground block text-[11px]">
            {booking.reference}
          </span>
        </span>
      </Link>

      {/* Only while the room exists — which for any given call is about an
          hour and a half of the week. The rest of the time this is
          deliberately empty. */}
      {isCallOpen(booking) ? (
        <Button asChild size="sm" className="relative rounded-full whitespace-nowrap">
          <Link to="/admin/bookings/$id/room" params={{ id: booking.id }}>
            <Video aria-hidden="true" />
            Join
          </Link>
        </Button>
      ) : null}
    </div>
  )
}

/**
 * The same rows, not yet arrived.
 *
 * A full page of them rather than a handful: the list holds twenty, and a
 * skeleton that draws six and then grows to twenty has moved the page under
 * the pointer, which is the one thing a skeleton exists to prevent.
 */
function RowsSkeleton() {
  return (
    <SkeletonScreen label="Loading bookings">
      {Array.from({ length: BOOKING_PAGE_SIZE }, (_, index) => (
        <div
          className="border-border/60 flex items-center gap-3 border-b px-5 py-3.5 last:border-b-0"
          key={index}
        >
          <Skeleton className="h-5 w-20 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="mt-2 h-3 w-60" />
          </div>
          <div className="flex flex-col items-end">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="mt-2 h-3 w-16" />
          </div>
        </div>
      ))}
    </SkeletonScreen>
  )
}

export function BookingsPage({ search }: { search: BookingSearch }) {
  const navigate = useNavigate({ from: '/admin/bookings/' })
  const prefetch = usePrefetch()
  const filter = toBookingFilterInput(search)
  const bookings = useQuery(adminBookingsQuery(filter))

  const items = bookings.data?.items ?? []

  const setSearch = (next: Partial<BookingSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next, page: undefined }) })

  return (
    <AdminPage>
      <PageHeader
        title="Bookings"
        description={
          <>
            Every call booked through the site. Times are shown in{' '}
            <span className="font-medium">Europe/Berlin</span>.
          </>
        }
        actions={
          <>
            <Button asChild className="rounded-full" size="sm">
              {/* The form behind it needs the public type list, which is what
                  it renders its choices from. */}
              <Link to="/admin/bookings/new" {...prefetch(bookingTypesQuery('de'))}>
                <CalendarPlus aria-hidden="true" />
                New booking
              </Link>
            </Button>
            <Button asChild className="rounded-full" size="sm" variant="outline">
              <Link to="/admin/bookings/availability" {...prefetch(availabilityQuery())}>
                <Clock3 aria-hidden="true" />
                Availability
              </Link>
            </Button>
            <Button asChild className="rounded-full" size="sm" variant="outline">
              <Link to="/admin/bookings/types" {...prefetch(adminBookingTypesQuery())}>
                <Settings2 aria-hidden="true" />
                Call types
              </Link>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Name, email, or reference"
          className="bg-panel max-w-xs"
          defaultValue={search.search ?? ''}
          onChange={(event) => setSearch({ search: event.currentTarget.value || undefined })}
        />

        <div className="flex flex-wrap gap-1.5">
          {BOOKING_RANGE_FILTERS.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setSearch({ range: range === 'upcoming' ? undefined : range })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs motion-safe:transition-colors',
                (search.range ?? 'upcoming') === range
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-panel text-muted-foreground hover:border-primary/50',
              )}
            >
              {range}
            </button>
          ))}
        </div>

        <select
          value={search.status ?? 'all'}
          onChange={(event) =>
            setSearch({
              status:
                event.currentTarget.value === 'all'
                  ? undefined
                  : (event.currentTarget.value as BookingSearch['status']),
            })
          }
          className="border-border bg-panel h-8 rounded-full border px-3 text-xs"
        >
          {BOOKING_STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <Panel className="overflow-hidden">
        {bookings.isPending ? (
          <RowsSkeleton />
        ) : bookings.isError ? (
          <PanelNote tone="error">
            <p>The booking list could not be loaded. {(bookings.error as Error).message}</p>
            <Button type="button" variant="outline" onClick={() => void bookings.refetch()}>
              Try again
            </Button>
          </PanelNote>
        ) : items.length === 0 ? (
          <PanelNote>
            <CalendarClock aria-hidden="true" className="text-muted-foreground/60 size-6" />
            <div>
              <p className="text-foreground text-sm font-medium">
                {hasActiveBookingFilters(search)
                  ? 'No booking matches these filters.'
                  : 'Nothing booked yet.'}
              </p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
                {hasActiveBookingFilters(search)
                  ? 'Clear the filters to see everything again.'
                  : 'Calls booked on the public site land here. Check that a call type is active and that the week has hours in it.'}
              </p>
            </div>
          </PanelNote>
        ) : (
          items.map((booking) => <Row booking={booking} key={booking.id} />)
        )}
      </Panel>

      {(bookings.data?.pageCount ?? 1) > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-sm">
            Page {bookings.data?.page} of {bookings.data?.pageCount} · {bookings.data?.total} total
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={(bookings.data?.page ?? 1) <= 1}
              onClick={() =>
                void navigate({
                  search: (previous) => ({ ...previous, page: (bookings.data?.page ?? 2) - 1 }),
                })
              }
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={(bookings.data?.page ?? 1) >= (bookings.data?.pageCount ?? 1)}
              onClick={() =>
                void navigate({
                  search: (previous) => ({ ...previous, page: (bookings.data?.page ?? 0) + 1 }),
                })
              }
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </AdminPage>
  )
}
