import { createFileRoute } from '@tanstack/react-router'
import { NewInvoicePage } from '#/frontend/pages/dashboard/invoices/InvoicePage'

/** A new draft. Nothing is saved until the owner saves it, and nothing is numbered before issuing. */
export const Route = createFileRoute('/dashboard/invoices/new')({
  head: () => ({
    meta: [
      { title: 'New invoice · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: NewInvoicePage,
})
