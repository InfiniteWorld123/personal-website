import { createFileRoute } from '@tanstack/react-router'
import { SubscriptionsPage } from '#/frontend/pages/admin/invoices/SubscriptionsPage'

export const Route = createFileRoute('/admin/invoices/subscriptions')({
  component: SubscriptionsPage,
})
