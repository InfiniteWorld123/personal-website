import { createFileRoute } from '@tanstack/react-router'
import { TodayPage } from '#/frontend/pages/admin/pipeline/TodayPage'

export const Route = createFileRoute('/admin/leads/today')({
  validateSearch: (search: Record<string, unknown>) => ({
    lead: typeof search.lead === 'string' ? search.lead : undefined,
  }),
  component: TodayRoute,
})

function TodayRoute() {
  return <TodayPage search={Route.useSearch()} />
}
