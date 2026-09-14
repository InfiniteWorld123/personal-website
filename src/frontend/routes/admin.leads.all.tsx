import { createFileRoute } from '@tanstack/react-router'
import { AllLeadsPage } from '#/frontend/pages/admin/pipeline/AllLeadsPage'

export const Route = createFileRoute('/admin/leads/all')({
  validateSearch: (search: Record<string, unknown>) => ({
    lead: typeof search.lead === 'string' ? search.lead : undefined,
    sort: typeof search.sort === 'string' ? search.sort : undefined,
  }),
  component: AllLeadsRoute,
})

function AllLeadsRoute() {
  return <AllLeadsPage search={Route.useSearch()} />
}
