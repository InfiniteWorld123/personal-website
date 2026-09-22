import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '#/frontend/pages/dashboard/NotBuiltYet'

/** In the navigation, and honest about having no behaviour yet. */
export const Route = createFileRoute('/dashboard/projects')({
  head: () => ({ meta: [{ title: 'Projects · Dashboard' }] }),
  component: () => <NotBuiltYet module="projects" />,
})
