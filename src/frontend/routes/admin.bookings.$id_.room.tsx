import { createFileRoute } from '@tanstack/react-router'
import { AdminBookingRoomPage } from '#/frontend/pages/admin/booking/BookingRoomPage'

/**
 * The trailing underscore on `$id_` is not a typo.
 *
 * Without it this file becomes a child of `admin.bookings.$id.tsx`, whose
 * component renders the booking's details and no `<Outlet />` — so the URL
 * matched, the route resolved, and the page showed the booking instead of the
 * call, with nothing anywhere reporting a fault. The underscore takes the room
 * out of that component and leaves it inside the admin shell.
 */
export const Route = createFileRoute('/admin/bookings/$id_/room')({
  component: AdminBookingRoomRoute,
})

function AdminBookingRoomRoute() {
  return <AdminBookingRoomPage id={Route.useParams().id} />
}
