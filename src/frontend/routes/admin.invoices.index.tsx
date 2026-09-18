import { createFileRoute } from '@tanstack/react-router'
import { InvoicesPage } from '#/frontend/pages/admin/invoices/InvoicesPage'

export const Route = createFileRoute('/admin/invoices/')({
  component: InvoicesPage,
})
