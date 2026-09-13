import { createFileRoute } from '@tanstack/react-router'
import { BookingCreatePage } from '#/frontend/pages/admin/booking/BookingCreatePage'

export const Route = createFileRoute('/admin/bookings/new')({
  component: BookingCreatePage,
})
