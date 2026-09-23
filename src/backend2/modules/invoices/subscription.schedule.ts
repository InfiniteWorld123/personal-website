/**
 * How a subscription period is decided. Pure, so every rule is provable
 * without a database or a clock.
 *
 * A period is billed **in advance**, on its first day. It is decided exactly
 * once, by the first billing run on or after that day, in this order:
 *
 *   1. after the end date      → never billed (and nothing after it)
 *   2. inside a pause          → skipped, not billed later
 *   3. inside a free range     → recorded as free; no zero-value invoice
 *   4. otherwise               → one invoice, at the price in effect that day,
 *                                with the discount that applies to it
 *
 * Pausing, resuming, ending, price changes, discounts and free ranges can
 * only be dated on or after the next undecided period — so they change the
 * future and never an invoice already made.
 */

export type Range = { starts_on: string; ends_on: string | null }

const covers = (range: Range, day: string, endExclusive: boolean): boolean =>
  range.starts_on <= day &&
  (range.ends_on === null || (endExclusive ? day < range.ends_on : day <= range.ends_on))

export type PeriodDecision = 'after_end' | 'paused' | 'free' | 'invoiced'

export const decidePeriod = (input: {
  start: string
  endsOn: string | null
  /** A pause's `ends_on` is the resume day, which is billed again. */
  pauses: Range[]
  /** A free range's `ends_on` is its last free day. */
  freePeriods: Range[]
}): PeriodDecision => {
  if (input.endsOn !== null && input.start > input.endsOn) return 'after_end'
  if (input.pauses.some((pause) => covers(pause, input.start, true))) return 'paused'
  if (input.freePeriods.some((range) => covers(range, input.start, false))) return 'free'

  return 'invoiced'
}

/** The agreed price for a period: the latest terms already in effect that day. */
export const priceFor = (
  terms: Array<{ effective_from: string; amount_minor: number | string }>,
  start: string,
): number => {
  const sorted = [...terms].sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))
  let price = sorted[0] ? Number(sorted[0].amount_minor) : 0

  for (const row of sorted) if (row.effective_from <= start) price = Number(row.amount_minor)

  return price
}

export type DiscountCandidate = {
  id: string
  discount_type: 'percent' | 'fixed'
  value: number | string
  starts_on: string
  periods: number | null
  applied_count: number
  ended_at: Date | string | null
}

/**
 * The discount a period gets: the earliest-starting one that has begun, has
 * not been ended, and has invoiced periods left. It counts **invoiced**
 * periods — a free or paused period does not use up "3 months at 20 % off".
 */
export const discountFor = <T extends DiscountCandidate>(discounts: T[], start: string): T | null =>
  discounts.find(
    (discount) =>
      discount.ended_at === null &&
      discount.starts_on <= start &&
      (discount.periods === null || discount.applied_count < discount.periods),
  ) ?? null

/**
 * When an automatic card charge that failed is tried again, and when the
 * customer is reminded. Within the owner's limits: at most two retries, three
 * reminders over 14 days, and never a cancellation.
 */
export const RETRY_POLICY = {
  /** Days after the first failure: attempt 2, then attempt 3. */
  retryAfterDays: [3, 7] as const,
  /** Days after the first failure a customer reminder is prepared. */
  reminderDays: [0, 7, 14] as const,
  /** Before the first card charge after a free start. */
  firstChargeNoticeDays: 7,
}
