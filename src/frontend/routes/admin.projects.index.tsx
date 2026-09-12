import { createFileRoute } from '@tanstack/react-router'
import { validateProjectSearch } from '#/frontend/features/projects/project-filters'
import { ProjectsPage } from '#/frontend/pages/admin/projects/ProjectsPage'

export const Route = createFileRoute('/admin/projects/')({
  validateSearch: validateProjectSearch,
  component: ProjectsRoute,
})

function ProjectsRoute() {
  return <ProjectsPage search={Route.useSearch()} />
}
