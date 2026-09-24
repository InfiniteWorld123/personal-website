import type { Language } from '#/frontend/i18n/language'
import { formatDateTime } from '../booking-time'

/** A zone as people read it: `America/New_York` → `America/New York`. */
export const zoneLabel = (timeZone: string): string => timeZone.replaceAll('_', ' ')

/**
 * "Tuesday, 6 October 2026 at 10:00 (Europe/Berlin)" — every time a visitor
 * reads is in their own zone, and the zone is named (`docs/v2/booking.md`).
 */
export const formatWhen = (instant: string, timeZone: string, language: Language): string =>
  `${formatDateTime(instant, timeZone, language)} (${zoneLabel(timeZone)})`

/** The same-site path of an emailed link, so the button stays on this site. */
export const sitePath = (absolute: string): { path: string; hash: string } => {
  try {
    const url = new URL(absolute)

    return { path: url.pathname, hash: url.hash.replace(/^#/u, '') }
  } catch {
    return { path: absolute, hash: '' }
  }
}

/** A fresh idempotency key for one form fill. */
export const newSubmissionId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/gu, (c) =>
        (Number(c) ^ (Math.floor(Math.random() * 16) >> (Number(c) / 4))).toString(16),
      )
