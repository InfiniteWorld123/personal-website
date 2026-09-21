import { createFileRoute } from '@tanstack/react-router'
import { InboxPage } from '#/frontend/pages/dashboard/inbox/InboxPage'

export const Route = createFileRoute('/dashboard/inbox')({
  head: () => ({ meta: [{ title: 'Inbox · Dashboard' }] }),
  component: InboxPage,
})
