import { createFileRoute } from '@tanstack/react-router'
import { LeadTrashPage } from '#/frontend/pages/dashboard/leads/LeadTrashPage'

/** Leads moved to Trash, to restore or delete permanently. */
export const Route = createFileRoute('/dashboard/leads/trash')({
  head: () => ({
    meta: [
      { title: 'Leads Trash · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: LeadTrashPage,
})
