import { createFileRoute } from '@tanstack/react-router'
import { ClientsPage } from '#/frontend/pages/admin/invoices/ClientsPage'

export const Route = createFileRoute('/admin/invoices/clients')({
  component: ClientsPage,
})
