import { createFileRoute } from '@tanstack/react-router'
import { NotBuiltYet } from '#/frontend/pages/dashboard/NotBuiltYet'

/** In the navigation, and honest about having no behaviour yet. */
export const Route = createFileRoute('/dashboard/inbox')({
  head: () => ({ meta: [{ title: 'Inbox · Dashboard' }] }),
  component: () => <NotBuiltYet module="inbox" />,
})
