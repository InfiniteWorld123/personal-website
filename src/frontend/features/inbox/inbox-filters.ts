import { LEAD_TABS, type LeadFilterInput, type LeadTab } from '#/shared/validation/lead.validation'

/**
 * The inbox's state lives in the URL: which tab, what was searched, and which
 * message is open. A message can therefore be linked to — which is exactly what
 * the notification mail does — and the back button walks the list.
 */
export type InboxSearch = {
  tab?: LeadTab
  search?: string
  page?: number
  lead?: string
}

const readString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined

  const trimmed = value.trim()

  return trimmed === '' ? undefined : trimmed
}

/**
 * A hand-edited or stale URL narrows the list or does nothing; it never
 * produces an error page, so every unreadable value falls back to the default.
 */
export const validateInboxSearch = (input: Record<string, unknown>): InboxSearch => {
  const tab = readString(input.tab)
  const page = Number(input.page)

  return {
    tab: LEAD_TABS.includes(tab as LeadTab) ? (tab as LeadTab) : undefined,
    search: readString(input.search),
    page: Number.isSafeInteger(page) && page > 1 ? page : undefined,
    lead: readString(input.lead),
  }
}

export const toLeadFilterInput = (
  search: InboxSearch,
  withBookings = true,
): LeadFilterInput => ({
  tab: search.tab ?? 'open',
  search: search.search ?? '',
  page: search.page ?? 1,
  withBookings,
})

export const hasActiveInboxFilters = (search: InboxSearch): boolean =>
  Boolean(search.search) || (search.tab ?? 'open') !== 'open'
