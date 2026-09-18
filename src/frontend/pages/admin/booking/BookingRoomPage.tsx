import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { ApiRequestError } from '#/frontend/api/response'
import { AdminPage } from '#/frontend/components/admin/PageHeader'
import { Button } from '#/frontend/components/ui/button'
import { CallRoom } from '#/frontend/features/call/CallRoom'
import { callCopy } from '#/frontend/features/call/call-copy'
import { useJoinCallAsHost } from '#/frontend/features/call/call-queries'
import { adminBookingsQuery } from '#/frontend/features/booking/booking-queries'
import { toBookingFilterInput } from '#/frontend/features/booking/booking-filters'
import { usePrefetch } from '#/frontend/lib/prefetch'

/**
 * The owner's way into the same room, opened by his admin session rather than
 * by a token. Same room, same window of time, other chair.
 *
 * German, like the rest of the admin: the URL carries no language segment, and
 * this is the one person who never needs it to.
 *
 * No page header: the room writes its own title, and a second heading above a
 * lobby that is about to become a video call is furniture. The way back is
 * kept, because a join that fails should not leave him on a dead page.
 */
export function AdminBookingRoomPage({ id }: { id: string }) {
  const copy = callCopy.de
  const join = useJoinCallAsHost(id)
  const prefetch = usePrefetch()

  const error = join.error
    ? join.error instanceof ApiRequestError
      ? join.error.message
      : copy.errors.couldNotOpen
    : null

  return (
    <AdminPage width="full">
      <Button asChild variant="ghost" size="sm" className="-ms-2 w-fit rounded-full">
        <Link to="/admin/bookings" {...prefetch(adminBookingsQuery(toBookingFilterInput({})))}>
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          All bookings
        </Link>
      </Button>

      <CallRoom
        copy={copy}
        access={join.data ?? null}
        joining={join.isPending}
        joinError={error}
        onJoin={() => join.mutate()}
        onClose={() => join.reset()}
      />
    </AdminPage>
  )
}
