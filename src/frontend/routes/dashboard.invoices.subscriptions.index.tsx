import { createFileRoute } from '@tanstack/react-router'
import { parseSubscriptionsSearch } from '#/frontend/features/invoices-v2/invoice-search'
import { SubscriptionsPage } from '#/frontend/pages/dashboard/invoices/SubscriptionsPage'

/** Subscriptions. `?sub=` opens one beside the list, so another screen can link to it. */
export const Route = createFileRoute('/dashboard/invoices/subscriptions/')({
  validateSearch: parseSubscriptionsSearch,
  head: () => ({
    meta: [
      { title: 'Subscriptions · Invoices · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function SubscriptionsRoute() {
    return <SubscriptionsPage search={Route.useSearch()} />
  },
})
