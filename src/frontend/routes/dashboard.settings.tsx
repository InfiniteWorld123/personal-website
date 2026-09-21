import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/frontend/pages/dashboard/settings/SettingsPage'

export const Route = createFileRoute('/dashboard/settings')({
  head: () => ({ meta: [{ title: 'Settings · Dashboard' }] }),
  component: SettingsPage,
})
