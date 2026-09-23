import * as v from 'valibot'

/**
 * Global search in the Dashboard (`docs/v2/search.md`): one question, the
 * owner's own records, grouped by the section they belong to. Read-only.
 */

export const SEARCH_SECTIONS = [
  'clients',
  'leads',
  'invoices',
  'subscriptions',
  'inbox',
  'calendar',
  'blog',
  'projects',
  'services',
  'media',
] as const

export type SearchSection = (typeof SEARCH_SECTIONS)[number]

export const SEARCH_LIMITS = { minQuery: 2, maxQuery: 100, perSection: 5, maxPerSection: 10 } as const

export const SearchQuerySchema = v.object({
  q: v.pipe(
    v.string('Type something to search for'),
    v.trim(),
    v.minLength(SEARCH_LIMITS.minQuery, `Type at least ${SEARCH_LIMITS.minQuery} characters`),
    v.maxLength(SEARCH_LIMITS.maxQuery, `A search can be at most ${SEARCH_LIMITS.maxQuery} characters`),
  ),
  limit: v.optional(
    v.pipe(
      v.unknown(),
      v.transform(Number),
      v.integer('The limit must be a whole number'),
      v.minValue(1),
      v.maxValue(SEARCH_LIMITS.maxPerSection),
    ),
    SEARCH_LIMITS.perSection,
  ),
})

export type SearchQuery = v.InferOutput<typeof SearchQuerySchema>

export type SearchHit = {
  id: string
  title: string
  /** A short line under the title: who, when, or which state. Never a whole private text. */
  subtitle: string
  /** A small label beside the title, such as `TEST`, `Draft` or `Trash`. */
  badge: string | null
  /** Where the record opens in its own module. */
  href: string
}

export type SearchSectionResult = {
  key: SearchSection
  label: string
  /** `error` only for this section; the others still answer. */
  state: 'ready' | 'error'
  items: SearchHit[]
  /** True when there were more matches than `limit`. */
  hasMore: boolean
  /** The module's own list, filtered where it supports it. */
  moreHref: string
}

export type SearchResult = {
  q: string
  sections: SearchSectionResult[]
}
