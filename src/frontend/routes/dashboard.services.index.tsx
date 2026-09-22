import { createFileRoute } from '@tanstack/react-router'
import { ServicesPage } from '#/frontend/pages/dashboard/services/ServicesPage'

/** The owner's catalogue. `docs/v2/services.md` owns what it does. */
export const Route = createFileRoute('/dashboard/services/')({
  head: () => ({
    meta: [
      { title: 'Services · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ServicesPage,
})
