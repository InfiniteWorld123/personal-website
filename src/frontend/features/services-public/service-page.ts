/**
 * The page a `/services?page=` asks for; anything else is the first.
 *
 * On its own, without the page's words: the route's search parser runs in the
 * entry bundle, and it should not carry three languages of copy with it.
 */
export function parseServicePage(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 100) : 1
}

/**
 * The payment model a `/services?plan=` asks for. The words are the same in
 * every language, so a link to the rent tab works in German, English and
 * Arabic alike. Anything else — a typo, a value from a language we do not
 * have — is the first tab ("kaufen", Buy) rather than an error.
 *
 * Duplicated from `PLAN_KEYS` in `service-display.ts` on purpose, for the
 * reason `parseServicePage` stands alone: the route's search parser runs in the
 * entry bundle and should not carry the words with it. A test keeps the two
 * lists equal.
 */
export const PLAN_VALUES = ['kaufen', 'raten', 'mieten'] as const
export type PlanValue = (typeof PLAN_VALUES)[number]

export function parsePlan(value: unknown): PlanValue {
  return typeof value === 'string' && (PLAN_VALUES as readonly string[]).includes(value) ? (value as PlanValue) : 'kaufen'
}
