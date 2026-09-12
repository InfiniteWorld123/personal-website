import { createFileRoute } from '@tanstack/react-router'
import { ProjectEditPage } from '#/frontend/pages/admin/projects/ProjectEditPage'

export const Route = createFileRoute('/admin/projects/new')({
  component: () => <ProjectEditPage id={null} />,
})
