import { createFileRoute } from '@tanstack/react-router'
import { ServiceEditorPage } from '#/frontend/pages/dashboard/services/ServiceEditorPage'

/** One service, and everything about it, on one page. */
export const Route = createFileRoute('/dashboard/services/$serviceId')({
  head: () => ({
    meta: [
      { title: 'Edit service · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ServiceEditorPage,
})
