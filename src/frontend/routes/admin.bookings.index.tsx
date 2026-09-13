import { createFileRoute } from '@tanstack/react-router'
import { validateBookingSearch } from '#/frontend/features/booking/booking-filters'
import { BookingsPage } from '#/frontend/pages/admin/booking/BookingsPage'

export const Route = createFileRoute('/admin/bookings/')({
  validateSearch: validateBookingSearch,
  component: BookingsRoute,
})

function BookingsRoute() {
  return <BookingsPage search={Route.useSearch()} />
}
