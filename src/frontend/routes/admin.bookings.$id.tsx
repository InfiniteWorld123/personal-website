import { createFileRoute } from '@tanstack/react-router'
import { BookingDetailPage } from '#/frontend/pages/admin/booking/BookingDetailPage'

export const Route = createFileRoute('/admin/bookings/$id')({
  component: BookingDetailRoute,
})

function BookingDetailRoute() {
  return <BookingDetailPage id={Route.useParams().id} />
}
