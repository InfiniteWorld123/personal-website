/**
 * The `/dashboard/assistant` address: the filter, the search, the page and
 * the open conversation.
 *
 * Kept apart from the page on purpose. A route's `validateSearch` stays in the
 * route tree every page loads, so it must not pull the conversation screens
 * (or the contract's Valibot schemas) into the public bundle. The allowed
 * values are spelled out here; `assistant-ui.test.tsx` checks they still
 * match the contract.
 */

/** "Not on the website" is the `fallback` outcome; the rest are languages. */
export const ASSISTANT_FILTERS = ['fallback', 'de', 'en', 'ar'] as const
export type AssistantFilter = (typeof ASSISTANT_FILTERS)[number]

/** Copied from `ASSISTANT_LIMITS.search`. */
export const ASSISTANT_SEARCH_MAX = 120

export type AssistantSearch = {
  /** Absent is "All". */
  show?: AssistantFilter
  q?: string
  page?: number
  /** The open conversation. */
  c?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

export const parseAssistantSearch = (raw: Record<string, unknown>): AssistantSearch => {
  const out: AssistantSearch = {}
  const page = Number(raw.page)

  if (typeof raw.show === 'string' && (ASSISTANT_FILTERS as readonly string[]).includes(raw.show)) {
    out.show = raw.show as AssistantFilter
  }
  if (typeof raw.q === 'string' && raw.q.trim() !== '') out.q = raw.q.trim().slice(0, ASSISTANT_SEARCH_MAX)
  if (Number.isInteger(page) && page > 1 && page < 100_000) out.page = page
  if (typeof raw.c === 'string' && UUID.test(raw.c)) out.c = raw.c

  return out
}
