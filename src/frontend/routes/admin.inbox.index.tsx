import { createFileRoute } from '@tanstack/react-router'
import { InboxPage } from '#/frontend/pages/admin/inbox/InboxPage'

export const Route = createFileRoute('/admin/inbox/')({
  component: () => <InboxPage personId={null} />,
})
