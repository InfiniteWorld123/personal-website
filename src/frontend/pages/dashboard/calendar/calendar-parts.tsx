import type { AppointmentStatus, BookingMethod } from '#/backend2/contracts/booking.contract'
import { StatusChip, type Tone } from '#/frontend/dashboard/primitives'

/** The small words the Calendar screens share. */

export const METHOD_WORDS: Record<BookingMethod, string> = { video: 'Video', in_person: 'In person', phone: 'Phone' }

const STATUS: Record<AppointmentStatus, { label: string; tone: Tone }> = {
  confirmed: { label: 'Confirmed', tone: 'blue' },
  completed: { label: 'Completed', tone: 'grey' },
  cancelled: { label: 'Cancelled', tone: 'red' },
  no_show: { label: 'No show', tone: 'outline' },
}

export function AppointmentStatusChip({ status, className }: { status: AppointmentStatus; className?: string }) {
  return <StatusChip tone={STATUS[status].tone} className={className}>{STATUS[status].label}</StatusChip>
}

export const LANGUAGE_NAMES = { de: 'German', en: 'English', ar: 'Arabic' } as const

export function FieldError({ id, error }: { id: string; error?: unknown }) {
  if (!error) return null

  return <span id={id} className="text-[12px] text-[var(--dash-red-ink)]">{String(error)}</span>
}
