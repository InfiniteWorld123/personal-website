import { createFileRoute } from '@tanstack/react-router'
import { ModuleScreen } from '#/frontend/pages/dashboard/ModuleScreen'

/** Shape only. The module's behaviour is not specified yet. */
export const Route = createFileRoute('/dashboard/projects')({
  head: () => ({ meta: [{ title: 'Projects · Dashboard' }] }),
  component: () => <ModuleScreen module="projects" />,
})
