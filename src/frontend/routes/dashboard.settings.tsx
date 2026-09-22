import { createFileRoute } from '@tanstack/react-router'
import { SettingsLayout } from '#/frontend/pages/dashboard/settings/SettingsLayout'

/**
 * The settings shell: the section list, and whichever section is open beside
 * it. Each section is its own route, so a link to Security is a real address.
 */
export const Route = createFileRoute('/dashboard/settings')({
  head: () => ({ meta: [{ title: 'Settings · Dashboard' }] }),
  component: SettingsLayout,
})
