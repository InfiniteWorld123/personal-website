import { createFileRoute } from '@tanstack/react-router'
import { AvailabilityPage } from '#/frontend/pages/admin/booking/AvailabilityPage'

export const Route = createFileRoute('/admin/bookings/availability')({
  component: AvailabilityPage,
})
