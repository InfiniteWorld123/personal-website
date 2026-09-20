import { createFileRoute } from '@tanstack/react-router'
import { SentPage } from '#/frontend/pages/admin/invoices/SentPage'

export const Route = createFileRoute('/admin/invoices/sent')({
  component: SentPage,
})
