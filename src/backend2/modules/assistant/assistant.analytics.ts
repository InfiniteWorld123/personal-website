import * as repo from './assistant.repo'

/**
 * Read-only aggregates for the Analytics module (`docs/v2/analytics.md`).
 *
 * Everything here comes from `v2_assistant_usage_days` — anonymous counters
 * with no text — except `readAssistantStoredCounts`, which counts rows. So the
 * activity numbers survive the owner deleting a transcript, and nothing here
 * can surface what a visitor wrote.
 *
 * Days are UTC calendar days (`YYYY-MM-DD`), inclusive. The range is capped
 * at 366 days so one call cannot scan without bound.
 */

export type AssistantActivityDay = {
  day: string
  /** Conversations started. */
  conversations: number
  /** Visitor questions accepted (after rate limits and the daily ceiling). */
  questions: number
  answered: number
  /** Unanswered: nothing on the website answered, the honest fallback was sent. */
  fallbacks: number
  /** The visitor asked to reach the owner and got Contact / Booking. */
  handoffs: number
  /** Replies that offered the Contact / Booking links (fallbacks, handoffs, price questions). */
  contactOffers: number
  providerCalls: number
  /** Provider answers thrown away (failure, "unknown", invented price). */
  providerFallbacks: number
  rateLimited: number
  capped: number
  /** Always 0: the application never makes a paid call. */
  costCents: number
}

export type AssistantActivityTotals = Omit<AssistantActivityDay, 'day'> & {
  from: string
  to: string
  /** answered / questions, 0 when there were no questions. */
  answerRate: number
}

const MAX_RANGE_DAYS = 366
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u

const checkRange = (from: string, to: string): void => {
  if (!DAY_PATTERN.test(from) || !DAY_PATTERN.test(to)) throw new Error('Use YYYY-MM-DD dates')

  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000

  if (!Number.isFinite(span) || span < 0) throw new Error('The range is empty or reversed')
  if (span >= MAX_RANGE_DAYS) throw new Error(`At most ${MAX_RANGE_DAYS} days at once`)
}

/** One entry per UTC day in `[from, to]`, zeros included, oldest first. */
export const readAssistantActivity = async (range: { from: string; to: string }): Promise<AssistantActivityDay[]> => {
  checkRange(range.from, range.to)

  return (await repo.readUsageRange(range.from, range.to)).map((row) => ({
    day: row.day,
    conversations: row.conversations,
    questions: row.questions,
    answered: row.answered,
    fallbacks: row.fallbacks,
    handoffs: row.handoffs,
    contactOffers: row.contact_offers,
    providerCalls: row.provider_calls,
    providerFallbacks: row.provider_fallbacks,
    rateLimited: row.rate_limited,
    capped: row.capped,
    costCents: 0,
  }))
}

/** The same range, summed. */
export const readAssistantTotals = async (range: { from: string; to: string }): Promise<AssistantActivityTotals> => {
  const days = await readAssistantActivity(range)
  const sum = (pick: (day: AssistantActivityDay) => number): number => days.reduce((total, day) => total + pick(day), 0)
  const questions = sum((day) => day.questions)
  const answered = sum((day) => day.answered)

  return {
    from: range.from,
    to: range.to,
    conversations: sum((day) => day.conversations),
    questions,
    answered,
    fallbacks: sum((day) => day.fallbacks),
    handoffs: sum((day) => day.handoffs),
    contactOffers: sum((day) => day.contactOffers),
    providerCalls: sum((day) => day.providerCalls),
    providerFallbacks: sum((day) => day.providerFallbacks),
    rateLimited: sum((day) => day.rateLimited),
    capped: sum((day) => day.capped),
    costCents: 0,
    answerRate: questions === 0 ? 0 : answered / questions,
  }
}

/** How many transcripts are stored right now (after any deletions). */
export const readAssistantStoredCounts = (): Promise<{ conversations: number; messages: number }> =>
  repo.countStored()
