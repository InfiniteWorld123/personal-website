import { createFileRoute } from '@tanstack/react-router'
import { LeadSettingsPage } from '#/frontend/pages/admin/pipeline/LeadSettingsPage'

export const Route = createFileRoute('/admin/leads/settings')({
  component: LeadSettingsPage,
})
