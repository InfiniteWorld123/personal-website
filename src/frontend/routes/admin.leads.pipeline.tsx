import { createFileRoute } from '@tanstack/react-router'
import { PipelinePage, type PipelineSearch } from '#/frontend/pages/admin/pipeline/PipelinePage'

export const Route = createFileRoute('/admin/leads/pipeline')({
  validateSearch: (search: Record<string, unknown>): PipelineSearch => ({
    service: typeof search.service === 'string' ? search.service : undefined,
    search: typeof search.search === 'string' ? search.search : undefined,
    lead: typeof search.lead === 'string' ? search.lead : undefined,
  }),
  component: PipelineRoute,
})

function PipelineRoute() {
  return <PipelinePage search={Route.useSearch()} />
}
