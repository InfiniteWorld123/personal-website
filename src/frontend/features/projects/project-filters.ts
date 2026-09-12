import {
  PROJECT_PUBLISHED_FILTERS,
  PROJECT_STATUSES,
  type ProjectFilterInput,
  type ProjectPublishedFilter,
  type ProjectStatus,
} from '#/shared/validation/project.validation'

/**
 * The list's filters live in the URL, so a filtered view can be bookmarked,
 * shared, and reached again with the back button. Defaults are left out of
 * the URL entirely rather than written as `?status=all`.
 */
export type ProjectSearch = {
  search?: string
  status?: ProjectStatus | 'all'
  published?: ProjectPublishedFilter
  tech?: string
  page?: number
}

const STATUS_VALUES: ReadonlyArray<ProjectStatus | 'all'> = [...PROJECT_STATUSES, 'all']

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()

  return trimmed === '' ? undefined : trimmed
}

/**
 * A hand-edited or stale URL narrows the list or it does nothing; it never
 * produces an error page, so every unreadable value falls back to the default.
 */
export const validateProjectSearch = (input: Record<string, unknown>): ProjectSearch => {
  const status = readString(input.status)
  const published = readString(input.published)
  const page = Number(input.page)

  return {
    search: readString(input.search),
    status: STATUS_VALUES.includes(status as ProjectStatus) ? (status as ProjectStatus) : undefined,
    published: PROJECT_PUBLISHED_FILTERS.includes(published as ProjectPublishedFilter)
      ? (published as ProjectPublishedFilter)
      : undefined,
    tech: readString(input.tech),
    page: Number.isSafeInteger(page) && page > 1 ? page : undefined,
  }
}

/** The URL's view of the filters, filled out into what the API expects. */
export const toFilterInput = (search: ProjectSearch): ProjectFilterInput => ({
  search: search.search ?? '',
  status: search.status ?? 'all',
  published: search.published ?? 'all',
  tech: search.tech ?? '',
  page: search.page ?? 1,
})

export const hasActiveFilters = (search: ProjectSearch): boolean =>
  Boolean(search.search || search.tech) ||
  (search.status ?? 'all') !== 'all' ||
  (search.published ?? 'all') !== 'all'
