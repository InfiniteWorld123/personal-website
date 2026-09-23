import { createFileRoute } from '@tanstack/react-router'
import { InboxPage } from '#/frontend/pages/dashboard/inbox/InboxPage'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const VIEWS = ['sent', 'drafts', 'archived', 'trash'] as const

export type InboxSearch = {
  /** Absent is the Inbox itself. */
  view?: (typeof VIEWS)[number] | 'inbox'
  /** The open conversation. */
  c?: string
  /** The open draft: a new message on its own, or a reply inside `c`. */
  draft?: string
  q?: string
  filter?: 'unread' | 'starred'
  page?: number
}

/** The owner's mailbox. Everything on screen is in the address. */
export const Route = createFileRoute('/dashboard/inbox')({
  validateSearch: (search: Record<string, unknown>): InboxSearch => {
    const page = Number(search.page)

    return {
      view: VIEWS.includes(search.view as (typeof VIEWS)[number]) ? (search.view as InboxSearch['view']) : undefined,
      c: typeof search.c === 'string' && UUID.test(search.c) ? search.c : undefined,
      draft: typeof search.draft === 'string' && UUID.test(search.draft) ? search.draft : undefined,
      q: typeof search.q === 'string' && search.q.trim() ? search.q.trim().slice(0, 120) : undefined,
      filter: search.filter === 'unread' || search.filter === 'starred' ? search.filter : undefined,
      page: Number.isInteger(page) && page > 1 ? page : undefined,
    }
  },
  head: () => ({
    meta: [
      { title: 'Inbox · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: InboxPage,
})
