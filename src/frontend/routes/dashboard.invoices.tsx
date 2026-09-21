import { createFileRoute } from '@tanstack/react-router'
import { InvoicesPage } from '#/frontend/pages/dashboard/invoices/InvoicesPage'

export const Route = createFileRoute('/dashboard/invoices')({
  head: () => ({ meta: [{ title: 'Invoices · Dashboard' }] }),
  component: InvoicesPage,
})
