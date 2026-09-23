import type { PostFilterInput, PostPublishedFilter } from '#/shared/validation/post.validation'

/*
 * Spelled out rather than imported: this runs in a route's `validateSearch`,
 * which every page of the site loads, and importing the validation module
 * brought its schemas and the validation library into the public bundle.
 * `route-search-constants.test.ts` keeps the two lists equal.
 */
export const POST_PUBLISHED_FILTERS = ['all', 'published', 'draft'] as const satisfies readonly PostPublishedFilter[]

/**
 * The list's filters live in the URL, so a filtered view can be bookmarked,
 * shared, and reached again with the back button. Defaults are left out of
 * the URL entirely rather than written as `?published=all`.
 */
export type PostSearch = {
  search?: string
  published?: PostPublishedFilter
  tag?: string
  page?: number
}

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()

  return trimmed === '' ? undefined : trimmed
}

/**
 * A hand-edited or stale URL narrows the list or it does nothing; it never
 * produces an error page, so every unreadable value falls back to the default.
 */
export const validatePostSearch = (input: Record<string, unknown>): PostSearch => {
  const published = readString(input.published)
  const page = Number(input.page)

  return {
    search: readString(input.search),
    published: POST_PUBLISHED_FILTERS.includes(published as PostPublishedFilter)
      ? (published as PostPublishedFilter)
      : undefined,
    tag: readString(input.tag),
    page: Number.isSafeInteger(page) && page > 1 ? page : undefined,
  }
}

/** The URL's view of the filters, filled out into what the API expects. */
export const toFilterInput = (search: PostSearch): PostFilterInput => ({
  search: search.search ?? '',
  published: search.published ?? 'all',
  tag: search.tag ?? '',
  page: search.page ?? 1,
})

export const hasActiveFilters = (search: PostSearch): boolean =>
  Boolean(search.search || search.tag) || (search.published ?? 'all') !== 'all'
