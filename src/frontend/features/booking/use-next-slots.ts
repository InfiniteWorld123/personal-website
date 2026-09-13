import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useLanguage } from '#/frontend/i18n/language-provider'
import type { PublicBookingType } from '#/shared/types/booking.types'
import { bookingTypesQuery, slotsQuery } from './booking-queries'
import { addDays, dayIn, detectTimezone } from './booking-time'

/** How far ahead a teaser looks. Beyond this a "next free time" is not news. */
const HORIZON_DAYS = 21

export type NextSlots = {
  type: PublicBookingType | null
  timezone: string
  /** Soonest first, already limited to what the caller asked for. */
  slots: string[]
}

/**
 * The soonest free times for the first bookable call, for the parts of the
 * site that invite rather than book: the line under the hero, the band on the
 * home page, the card on the contact page.
 *
 * Everything here degrades to nothing. If the types call fails, the slots call
 * never runs; if either comes back empty, the caller renders no line at all —
 * a landing page must not show an error because a teaser could not load, and
 * must never promise a time that is not actually free.
 */
export function useNextSlots(count: number): NextSlots {
  const { language } = useLanguage()

  // Read once. Re-detecting on every render would fight nothing here, but it
  // would change the query key mid-flight on a browser that reports lazily.
  const [timezone] = useState(detectTimezone)

  const types = useQuery(bookingTypesQuery(language))
  const type = types.data?.[0] ?? null

  const today = dayIn(new Date(), timezone)
  const slots = useQuery({
    ...slotsQuery(type?.slug ?? '', language, {
      from: today,
      to: addDays(today, HORIZON_DAYS),
      timezone,
    }),
    enabled: Boolean(type),
  })

  const next = useMemo(
    () =>
      (slots.data?.days ?? [])
        .flatMap((day) => day.slots)
        .slice(0, count)
        .map((slot) => slot.startsAt),
    [slots.data, count],
  )

  return { type, timezone, slots: next }
}
