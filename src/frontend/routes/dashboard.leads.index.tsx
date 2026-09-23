import { createFileRoute } from '@tanstack/react-router'
import { LeadsPage, type LeadsSearch } from '#/frontend/pages/dashboard/leads/LeadsPage'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu

/**
 * The Leads directory, as a List or a Board (`docs/v2/leads.md`). The address
 * keeps the view, the layout and the open lead, so a link can open any of them.
 */
export const Route = createFileRoute('/dashboard/leads/')({
  validateSearch: (search: Record<string, unknown>): LeadsSearch => ({
    view: search.view === 'won' || search.view === 'lost' ? search.view : undefined,
    layout: search.layout === 'board' ? 'board' : undefined,
    lead: typeof search.lead === 'string' && UUID.test(search.lead) ? search.lead : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Leads · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function LeadsRoute() {
    return <LeadsPage search={Route.useSearch()} />
  },
})
