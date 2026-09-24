import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { addDays, dayIn, detectTimezone } from './booking-time'
import { v2SlotsQuery, v2TypesQuery } from './v2/queries'

/** How far ahead a teaser looks. Beyond this a "next free time" is not news. */
const HORIZON_DAYS = 21

/** The call a teaser invites to. */
export type TeaserType = {
  slug: string
  name: string
  durationMinutes: number
  free: boolean
}

export type NextSlots = {
  type: TeaserType | null
  timezone: string
  /** Soonest first, already limited to what the caller asked for. */
  slots: string[]
}

/**
 * The soonest free times for the first bookable call, for the parts of the
 * site that invite rather than book: the line under the hero, the band on the
 * home page, the card on the contact page.
 *
 * Read from the same Backend2 endpoints the booking pages use
 * (`docs/v2/public-cutover.md`, step 5), so a teaser never quotes a time the
 * calendar would not offer.
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
  const today = dayIn(new Date(), timezone)
  const to = addDays(today, HORIZON_DAYS)

  const v2Types = useQuery(v2TypesQuery(language))
  const v2Type = v2Types.data?.[0] ?? null
  const v2Slots = useQuery({
    ...v2SlotsQuery({
      slug: v2Type?.slug ?? '',
      method: v2Type?.defaultMethod ?? 'video',
      from: today,
      to,
      timeZone: timezone,
      language,
    }),
    enabled: Boolean(v2Type),
  })

  const type: TeaserType | null = useMemo(
    () => (v2Type ? { slug: v2Type.slug, name: v2Type.name, durationMinutes: v2Type.durationMinutes, free: true } : null),
    [v2Type],
  )

  const days = v2Slots.data?.days

  const next = useMemo(
    () =>
      (days ?? [])
        .flatMap((day) => day.slots)
        .slice(0, count)
        .map((slot) => slot.startsAt),
    [days, count],
  )

  return { type, timezone, slots: next }
}
