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
