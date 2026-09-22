import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '#/frontend/pages/dashboard/NotBuiltYet'

/** In the navigation, and honest about having no behaviour yet. */
export const Route = createFileRoute('/dashboard/content')({
  head: () => ({ meta: [{ title: 'Content · Dashboard' }] }),
  component: () => <NotBuiltYet module="content" />,
})
