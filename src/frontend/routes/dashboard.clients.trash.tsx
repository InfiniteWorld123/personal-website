import { createFileRoute } from '@tanstack/react-router'
import { ClientTrashPage } from '#/frontend/pages/dashboard/clients/ClientTrashPage'

/** Clients moved to Trash, to restore or delete permanently. */
export const Route = createFileRoute('/dashboard/clients/trash')({
  head: () => ({
    meta: [{ title: 'Clients Trash · Dashboard' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: ClientTrashPage,
})
