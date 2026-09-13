import { createFileRoute } from '@tanstack/react-router'
import { BookingTypesPage } from '#/frontend/pages/admin/booking/BookingTypesPage'

export const Route = createFileRoute('/admin/bookings/types/')({
  component: BookingTypesPage,
})
