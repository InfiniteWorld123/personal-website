import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/frontend/pages/dashboard/invoices/SettingsPage'

/** Seller details, tax mode, bank, and what real invoices still need. */
export const Route = createFileRoute('/dashboard/invoices/settings')({
  head: () => ({
    meta: [
      { title: 'Seller & tax · Invoices · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: SettingsPage,
})
