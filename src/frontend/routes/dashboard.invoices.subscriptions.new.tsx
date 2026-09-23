import { createFileRoute } from '@tanstack/react-router'
import { NewSubscriptionPage } from '#/frontend/pages/dashboard/invoices/NewSubscriptionPage'

/** A subscription the owner agreed with a client. There is no public sign-up. */
export const Route = createFileRoute('/dashboard/invoices/subscriptions/new')({
  head: () => ({
    meta: [
      { title: 'New subscription · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: NewSubscriptionPage,
})
