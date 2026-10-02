// @vitest-environment jsdom
import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationSummary } from '#/backend2/contracts/inbox.contract'
import type { InboxSearch } from '#/frontend/routes/dashboard.inbox'

const route = vi.hoisted(() => ({ search: {} as InboxSearch, update: () => {} }))
const api = vi.hoisted(() => ({ listConversations: vi.fn(), listDrafts: vi.fn(), readCounts: vi.fn(), bulkConversations: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({
  useSearch: () => route.search,
  useNavigate: () => ({ search }: { search: (value: InboxSearch) => InboxSearch }) => { route.search = search(route.search); route.update() },
}))
vi.mock('#/frontend/features/inbox-v2/api', async (original) => ({ ...(await original<object>()), ...api }))
vi.mock('#/frontend/pages/dashboard/inbox/ConversationPane', () => ({ ConversationPane: () => <p>Open letter</p> }))
vi.mock('#/frontend/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() }, messageFromError: (error: Error) => error.message }))
const { InboxPage } = await import('#/frontend/pages/dashboard/inbox/InboxPage')
let client: QueryClient
let rows: ConversationSummary[]
const page = (items: ConversationSummary[], number = 1) => ({ items, page: number, pageSize: 25, total: 26, pageCount: 2, hasMore: number === 1 })

beforeEach(() => {
  vi.clearAllMocks()
  route.search = {}
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  rows = [1, 2].map((number) => ({ id: `00000000-0000-4000-8000-00000000000${number}`, subject: `Letter ${number}`, counterpartEmail: 'fixture@example.com', counterpartName: 'QA fixture', origin: 'incoming', folder: 'inbox', isRead: true, isStarred: false, messageCount: 1, lastMessageAt: '2026-10-02T12:00:00Z', lastDirection: 'incoming', lastPreview: 'Fictional data', hasFailedSend: false, hasDraft: false, trashedAt: null }))
  api.readCounts.mockResolvedValue({ inbox: 26, inboxUnread: 0, sent: 0, drafts: 0, archived: 0, trash: 0 })
  api.listConversations.mockImplementation(async (query) => page(query.page === 2 ? [rows[1]!] : rows, query.page))
  api.listDrafts.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25, pageCount: 0, hasMore: false })
  api.bulkConversations.mockImplementation(async (input) => ({ ...input }))
})
afterEach(() => { cleanup(); client.clear() })
function Harness() {
  const [, setVersion] = useState(0)
  route.update = () => setVersion((version) => version + 1)
  return <QueryClientProvider client={client}><InboxPage /></QueryClientProvider>
}
const mount = () => render(<Harness />)
const selectOne = async () => fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Letter 1' }))
const folder = (name: string) => within(screen.getByRole('navigation', { name: 'Inbox folders' })).getByRole('button', { name })

describe('Compact mailbox selection', () => {
  it('keeps checkboxes separate from opening a letter and sends exactly the selected ids', async () => {
    mount(); await selectOne()
    expect(route.search.c).toBeUndefined()
    expect((screen.getByRole('checkbox', { name: 'Select all conversations on this page' }) as HTMLInputElement).indeterminate).toBe(true)
    expect(screen.getByText('1 selected on this page')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect(api.bulkConversations.mock.calls[0]?.[0]).toEqual({ action: 'archive', conversationIds: [rows[0]!.id] }))
    await waitFor(() => expect(screen.queryByText('1 selected on this page')).toBeNull())
    expect((screen.getByRole('checkbox', { name: 'Select Letter 2' }) as HTMLInputElement).checked).toBe(false)
  })

  it('selects this page only and clears selection on folder, filter, search and page changes', async () => {
    mount()
    await screen.findByRole('checkbox', { name: 'Select Letter 1' })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all conversations on this page' }))
    expect(screen.getByText('2 selected on this page')).toBeTruthy()
    for (const next of [{ view: 'archived' }, { filter: 'unread' }, { q: 'different' }, { page: 2 }] as InboxSearch[]) {
      act(() => { route.search = next; route.update() })
      await waitFor(() => expect(screen.queryByText('2 selected on this page')).toBeNull())
      await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Select Letter 2' }) as HTMLInputElement).disabled).toBe(false))
      fireEvent.click(screen.getByRole('checkbox', { name: 'Select Letter 2' }))
      expect(screen.getByText('1 selected on this page')).toBeTruthy()
    }
    expect(api.bulkConversations).not.toHaveBeenCalled()
  })

  it('prevents acting on the previous page while the new page is loading', async () => {
    mount(); await selectOne()
    let finish!: (data: ReturnType<typeof page>) => void
    api.listConversations.mockImplementation((query) => query.page === 2 ? new Promise((resolve) => { finish = resolve }) : Promise.resolve(page(rows)))
    act(() => { route.search = { page: 2 }; route.update() })
    expect(screen.queryByText('1 selected on this page')).toBeNull()
    expect((screen.getByRole('checkbox', { name: 'Select Letter 1' }) as HTMLInputElement).disabled).toBe(true)
    await act(async () => finish(page([rows[1]!], 2)))
    await waitFor(() => expect((screen.getByRole('checkbox', { name: 'Select Letter 2' }) as HTMLInputElement).disabled).toBe(false))
    expect(route.search.page).toBe(2)
  })

  it('prunes a selected letter that disappeared on refresh', async () => {
    mount(); await selectOne()
    rows = [rows[1]!]
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(screen.queryByRole('checkbox', { name: 'Select Letter 1' })).toBeNull())
    expect(screen.queryByText('1 selected on this page')).toBeNull()
  })

  it('blocks duplicate bulk commands and preserves selection when the result is unconfirmed', async () => {
    let reject!: (error: Error) => void
    api.bulkConversations.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
    mount(); await selectOne()
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Archive' }) as HTMLButtonElement).disabled).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(api.bulkConversations).toHaveBeenCalledTimes(1)
    await act(async () => reject(new Error('Connection interrupted')))
    await screen.findByRole('alert')
    expect(screen.getByText('1 selected on this page')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('confirm the update')
  })

  it('offers restore in Trash without a permanent bulk-delete command', async () => {
    route.search = { view: 'trash' }
    mount(); await selectOne()
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Mailbox actions' })).queryByRole('button', { name: 'Trash' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    await waitFor(() => expect(api.bulkConversations.mock.calls[0]?.[0]).toEqual({ action: 'restore', conversationIds: [rows[0]!.id] }))
  })

  it('sends the More actions command and closes a selected open letter when marking unread', async () => {
    route.search = { c: rows[0]!.id }
    mount(); await selectOne()
    fireEvent.change(screen.getByRole('combobox', { name: 'More selected mail actions' }), { target: { value: 'mark-unread' } })
    await waitFor(() => expect(api.bulkConversations.mock.calls[0]?.[0]).toEqual({ action: 'mark-unread', conversationIds: [rows[0]!.id] }))
    await waitFor(() => expect(route.search.c).toBeUndefined())
  })

  it('restores the search box after address or Back navigation', async () => {
    mount(); await screen.findByRole('textbox', { name: 'Search mail' })
    act(() => { route.search = { q: 'restored search' }; route.update() })
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Search mail' }) as HTMLInputElement).value).toBe('restored search'))
    fireEvent.click(folder('Drafts'))
    expect(screen.queryByRole('checkbox', { name: 'Select all conversations on this page' })).toBeNull()
  })
})
