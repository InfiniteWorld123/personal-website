import { createFileRoute } from '@tanstack/react-router'
import { CallsPage } from '#/frontend/pages/admin/pipeline/CallsPage'

export const Route = createFileRoute('/admin/leads/calls')({
  validateSearch: (search: Record<string, unknown>) => ({
    lead: typeof search.lead === 'string' ? search.lead : undefined,
  }),
  component: CallsRoute,
})

function CallsRoute() {
  return <CallsPage search={Route.useSearch()} />
}
