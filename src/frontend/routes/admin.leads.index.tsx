import { createFileRoute } from '@tanstack/react-router'
import { LeadsPage } from '#/frontend/pages/admin/leads/LeadsPage'

export const Route = createFileRoute('/admin/leads/')({
  component: LeadsPage,
})
