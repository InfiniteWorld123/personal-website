import { createFileRoute } from '@tanstack/react-router'
import { InboxPage } from '#/frontend/pages/admin/inbox/InboxPage'

/**
 * One conversation open. The same screen as the list, not a second one — on a
 * wide display the list stays beside it, and on a phone it replaces it.
 */
export const Route = createFileRoute('/admin/inbox/$personId')({
  component: PersonRoute,
})

function PersonRoute() {
  return <InboxPage personId={Route.useParams().personId} />
}
