import { createFileRoute } from '@tanstack/react-router'
import { APPOINTMENT_STATUSES, BOOKING_METHODS } from '#/backend2/contracts/booking.contract'
import { CalendarPage } from '#/frontend/pages/dashboard/calendar/CalendarPage'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/u

export type CalendarSearch = {
  tab?: 'types' | 'hours'
  /** The Monday of the week shown, Berlin date. Absent is this week. */
  week?: string
  /** The open appointment. */
  id?: string
  /** The New appointment panel is open. */
  new?: boolean
  q?: string
  status?: (typeof APPOINTMENT_STATUSES)[number]
  type?: string
  method?: (typeof BOOKING_METHODS)[number]
  past?: boolean
  page?: number
}

/** The owner's calendar. Everything on screen is in the address. */
export const Route = createFileRoute('/dashboard/calendar')({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => {
    const page = Number(search.page)

    return {
      tab: search.tab === 'types' || search.tab === 'hours' ? search.tab : undefined,
      week: typeof search.week === 'string' && DATE.test(search.week) ? search.week : undefined,
      id: typeof search.id === 'string' && UUID.test(search.id) ? search.id : undefined,
      new: search.new === true || search.new === 'true' ? true : undefined,
      q: typeof search.q === 'string' && search.q.trim() ? search.q.trim().slice(0, 120) : undefined,
      status: APPOINTMENT_STATUSES.includes(search.status as never) ? (search.status as CalendarSearch['status']) : undefined,
      type: typeof search.type === 'string' && UUID.test(search.type) ? search.type : undefined,
      method: BOOKING_METHODS.includes(search.method as never) ? (search.method as CalendarSearch['method']) : undefined,
      past: search.past === true || search.past === 'true' ? true : undefined,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
    }
  },
  head: () => ({
    meta: [
      { title: 'Calendar · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: CalendarPage,
})
