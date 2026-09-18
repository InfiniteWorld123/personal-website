import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CalendarClock, CalendarPlus, Clock3, Settings2, Video } from 'lucide-react'
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/frontend/components/ui/table'
import { adminBookingsQuery } from '#/frontend/features/booking/booking-queries'
import {
  hasActiveBookingFilters,
  toBookingFilterInput,
  type BookingSearch,
} from '#/frontend/features/booking/booking-filters'
import {
  BOOKING_RANGE_FILTERS,
  BOOKING_STATUS_FILTERS,
} from '#/shared/validation/booking.validation'
import { cn } from '#/frontend/lib/utils'
import { isCallOpen } from '#/shared/types/call.types'

/** Every time in the admin is read on the owner's own clock. */
const BERLIN = 'Europe/Berlin'

const formatBerlin = (instant: string) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: BERLIN,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'border-primary/40 text-primary',
  CANCELLED: 'text-muted-foreground',
  COMPLETED: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  NO_SHOW: 'border-destructive/40 text-destructive',
}

export function BookingsPage({ search }: { search: BookingSearch }) {
  const navigate = useNavigate({ from: '/admin/bookings/' })
  const filter = toBookingFilterInput(search)
  const bookings = useQuery(adminBookingsQuery(filter))

  const items = bookings.data?.items ?? []

  const setSearch = (next: Partial<BookingSearch>) =>
    void navigate({ search: (previous) => ({ ...previous, ...next, page: undefined }) })

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bookings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Every call booked through the site. Times are shown in{' '}
            <span className="font-medium">Europe/Berlin</span>.
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild>
            <Link to="/admin/bookings/new">
              <CalendarPlus aria-hidden="true" />
              New booking
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bookings/availability">
              <Clock3 aria-hidden="true" />
              Availability
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bookings/types">
              <Settings2 aria-hidden="true" />
              Call types
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Name, email, or reference"
          className="max-w-xs"
          defaultValue={search.search ?? ''}
          onChange={(event) => setSearch({ search: event.currentTarget.value || undefined })}
        />

        <div className="flex gap-1">
          {BOOKING_RANGE_FILTERS.map((range) => (
            <Button
              key={range}
              type="button"
              size="sm"
              variant={(search.range ?? 'upcoming') === range ? 'default' : 'outline'}
              onClick={() => setSearch({ range: range === 'upcoming' ? undefined : range })}
            >
              {range}
            </Button>
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
          className="border-border bg-background h-8 rounded-md border px-2 text-sm"
        >
          {BOOKING_STATUS_FILTERS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {bookings.isPending ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Loading bookings…</p>
      ) : bookings.isError ? (
        <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-lg border p-6">
          <p className="text-destructive text-sm">
            The booking list could not be loaded. {(bookings.error as Error).message}
          </p>
          <Button type="button" variant="outline" onClick={() => void bookings.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-3 rounded-lg border border-dashed p-12 text-center">
          <CalendarClock aria-hidden="true" className="text-muted-foreground/60 size-6" />
          <p className="text-sm font-medium">
            {hasActiveBookingFilters(search) ? 'No booking matches these filters.' : 'Nothing booked yet.'}
          </p>
          <p className="text-muted-foreground max-w-sm text-sm">
            {hasActiveBookingFilters(search)
              ? 'Clear the filters to see everything again.'
              : 'Calls booked on the public site land here. Check that a call type is active and that the week has hours in it.'}
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Call</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-end">Reference</TableHead>
              {/* No heading: the column is empty on every row but the one or
                  two whose call is happening right now. */}
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((booking) => (
              <TableRow key={booking.id}>
                <TableCell className="tabular whitespace-nowrap">
                  <Link
                    to="/admin/bookings/$id"
                    params={{ id: booking.id }}
                    className="hover:text-primary font-medium"
                  >
                    {formatBerlin(booking.startsAt)}
                  </Link>
                </TableCell>
                <TableCell>
                  <span className="flex flex-col">
                    <span className="font-medium">{booking.visitorName}</span>
                    <span className="text-muted-foreground text-xs" dir="ltr">
                      {booking.visitorEmail}
                    </span>
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {booking.bookingTypeName}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn('rounded-full', STATUS_TONE[booking.status])}>
                    {booking.status}
                  </Badge>
                </TableCell>
                <TableCell className="tabular text-muted-foreground text-end text-xs">
                  {booking.reference}
                </TableCell>
                <TableCell className="text-end">
                  {/* Only while the room exists — which for any given call is
                      about an hour and a half of the week. The rest of the
                      time this cell is deliberately empty. */}
                  {isCallOpen(booking) ? (
                    <Button asChild size="sm" className="whitespace-nowrap">
                      <Link to="/admin/bookings/$id/room" params={{ id: booking.id }}>
                        <Video aria-hidden="true" />
                        Join
                      </Link>
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

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
    </div>
  )
}
