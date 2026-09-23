import { createFileRoute } from '@tanstack/react-router'
import { NewClientPage } from '#/frontend/pages/dashboard/clients/ClientFormPage'

/** A Client added directly, with no lead behind it. */
export const Route = createFileRoute('/dashboard/clients/new')({
  head: () => ({
    meta: [{ title: 'New client · Dashboard' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  component: NewClientPage,
})
