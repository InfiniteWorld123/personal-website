import { queryOptions } from '@tanstack/react-query'
import type { BookingLanguage, BookingMethod, SlotDay } from '#/backend2/contracts/booking.contract'
import { addDays } from '../booking-time'
import { fetchAppointment, fetchSlots, fetchTypes } from './api'

/** The most days one slots request may cover (`BOOKING_LIMITS.maxSlotDays`). */
export const MAX_SLOT_DAYS = 14

export const v2TypesQuery = (language: BookingLanguage) =>
  queryOptions({
    queryKey: ['booking-v2', 'types', language],
    queryFn: () => fetchTypes(language),
  })

export type SlotRange = {
  days: SlotDay[]
  /** Whether anything may be free after `to` — decides the "next month" arrow. */
  moreAfter: boolean
}

/** Days from `from` to `to` inclusive, asked in pieces the server accepts. */
export const slotChunks = (from: string, to: string): Array<{ from: string; days: number }> => {
  const chunks: Array<{ from: string; days: number }> = []
  let start = from

  while (start <= to) {
    const remaining = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
    const days = Math.min(MAX_SLOT_DAYS, remaining)

    chunks.push({ from: start, days })
    start = addDays(start, days)
  }

  return chunks
}

/**
 * The free times for a stretch of the calendar in the visitor's own zone.
 * A month is at most three requests; every one is a fresh answer, because
 * the booking itself re-checks the time and a stale list costs only a message.
 */
export const v2SlotsQuery = (input: {
  slug: string
  method: BookingMethod
  from: string
  to: string
  timeZone: string
  language: BookingLanguage
}) =>
  queryOptions({
    queryKey: ['booking-v2', 'slots', input.slug, input.method, input.from, input.to, input.timeZone],
    queryFn: async (): Promise<SlotRange> => {
      const results = await Promise.all(
        slotChunks(input.from, input.to).map((chunk) =>
          fetchSlots({ ...chunk, slug: input.slug, method: input.method, timeZone: input.timeZone, language: input.language }),
        ),
      )
      const days = results.flatMap((result) => result.days)
      const last = results.at(-1)
      const lastHasSlots = (last?.days ?? []).some((day) => day.slots.length > 0)

      return { days, moreAfter: lastHasSlots || Boolean(last?.nextAvailableDate) }
    },
    staleTime: 30_000,
  })

export const v2AppointmentQuery = (reference: string, token: string) =>
  queryOptions({
    queryKey: ['booking-v2', 'appointment', reference],
    queryFn: () => fetchAppointment(reference, token),
    enabled: token.length > 0,
    retry: false,
  })
