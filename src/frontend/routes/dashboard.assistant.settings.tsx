import { createFileRoute } from '@tanstack/react-router'
import { AssistantSettingsPage } from '#/frontend/pages/dashboard/assistant/AssistantSettingsPage'

/** The public chat's on/off switch, how long conversations are kept, and its usage. */
export const Route = createFileRoute('/dashboard/assistant/settings')({
  head: () => ({
    meta: [
      { title: 'Assistant settings · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: AssistantSettingsPage,
})
