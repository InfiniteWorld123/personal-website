type Env = Record<string, string | undefined>

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * The owner's fixed Google Meet room (`BOOKING_MEET_LINK`), chosen on
 * 30 Sep 2026. Video appointments meet there: the emails, the visitor's call
 * page and the Dashboard all point to it, and the owner admits the visitor.
 * Only a real Meet address counts. The in-site video call was removed
 * on 1 Oct 2026 and stays a documented future plan (`docs/v2/booking.md`).
 */
export const fixedMeetingLink = (environment: Env = process.env): string | null => {
  const link = text(environment.BOOKING_MEET_LINK)

  return /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/u.test(link) ? link : null
}
