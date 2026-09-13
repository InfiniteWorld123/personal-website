import { createFileRoute } from '@tanstack/react-router'
import { BookingTypeEditPage } from '#/frontend/pages/admin/booking/BookingTypeEditPage'

export const Route = createFileRoute('/admin/bookings/types/new')({
  component: BookingTypeEditPage,
})
