import { createFileRoute } from '@tanstack/react-router'
import { PersonFile } from '#/frontend/pages/admin/leads/PersonFile'

/** One person's whole file — the screen he asked for first. */
export const Route = createFileRoute('/admin/leads/$personId')({
  component: PersonFileRoute,
})

function PersonFileRoute() {
  return <PersonFile personId={Route.useParams().personId} />
}
