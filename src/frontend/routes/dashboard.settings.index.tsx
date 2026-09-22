import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '#/frontend/pages/dashboard/settings/SettingsPage'

/** Appearance — what `/dashboard/settings` opens on. */
export const Route = createFileRoute('/dashboard/settings/')({
  head: () => ({ meta: [{ title: 'Appearance · Settings' }] }),
  component: SettingsPage,
})
