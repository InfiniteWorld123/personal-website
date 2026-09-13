import { createFileRoute } from '@tanstack/react-router'
import { validateInboxSearch } from '#/frontend/features/inbox/inbox-filters'
import { InboxPage } from '#/frontend/pages/admin/inbox/InboxPage'

export const Route = createFileRoute('/admin/inbox/')({
  validateSearch: validateInboxSearch,
  component: InboxRoute,
})

function InboxRoute() {
  return <InboxPage search={Route.useSearch()} />
}
