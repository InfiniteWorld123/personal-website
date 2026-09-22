import { createFileRoute } from '@tanstack/react-router'
import { SecurityPage } from '#/frontend/pages/dashboard/settings/SecurityPage'

export const Route = createFileRoute('/dashboard/settings/security')({
  head: () => ({
    meta: [
      { title: 'Security · Settings' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: SecurityPage,
})
