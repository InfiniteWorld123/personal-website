import { createFileRoute } from '@tanstack/react-router'
import { parseAssistantSearch } from '#/frontend/features/assistant-v2/assistant-search'
import { ConversationsPage } from '#/frontend/pages/dashboard/assistant/ConversationsPage'

/**
 * What visitors asked the chat on the public website (`docs/v2/ai-assistant.md`).
 * A private transcript viewer — not an assistant inside the Dashboard. The
 * address keeps the filter, the search, the page and the open conversation.
 */
export const Route = createFileRoute('/dashboard/assistant/')({
  validateSearch: parseAssistantSearch,
  head: () => ({
    meta: [
      { title: 'Assistant · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: function AssistantConversationsRoute() {
    return <ConversationsPage search={Route.useSearch()} />
  },
})
