import { createFileRoute } from '@tanstack/react-router'
import { LeadListsPage, type ListsTab } from '#/frontend/pages/dashboard/leads/LeadListsPage'

const TABS: ListsTab[] = ['stages', 'sources', 'reasons', 'niches']

/** Stages, sources, lost reasons and niches — the owner's own lists. */
export const Route = createFileRoute('/dashboard/leads/lists')({
  validateSearch: (search: Record<string, unknown>): { tab?: ListsTab } => ({
    tab: TABS.includes(search.tab as ListsTab) && search.tab !== 'stages' ? (search.tab as ListsTab) : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Stages & lists · Leads · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function ListsRoute() {
    return <LeadListsPage tab={Route.useSearch().tab ?? 'stages'} />
  },
})
