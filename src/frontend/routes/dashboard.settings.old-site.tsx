import { createFileRoute } from '@tanstack/react-router'
import { OldSitePage } from '#/frontend/pages/dashboard/settings/OldSitePage'

export const Route = createFileRoute('/dashboard/settings/old-site')({
  head: () => ({
    meta: [
      { title: 'Old site · Settings' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: OldSitePage,
})
