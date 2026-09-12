import { createFileRoute } from '@tanstack/react-router'
import { ProjectEditPage } from '#/frontend/pages/admin/projects/ProjectEditPage'

export const Route = createFileRoute('/admin/projects/$id')({
  component: ProjectEditRoute,
})

function ProjectEditRoute() {
  return <ProjectEditPage id={Route.useParams().id} />
}
