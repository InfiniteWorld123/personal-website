// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConversationDetail } from '#/backend2/contracts/inbox.contract'
const api = vi.hoisted(() => ({ readConversation: vi.fn(), patchConversation: vi.fn() }))
vi.mock('#/frontend/features/inbox-v2/api', async (original) => ({ ...(await original<object>()), ...api }))
vi.mock('#/frontend/pages/dashboard/inbox/Composer', () => ({ Composer: () => null }))
vi.mock('#/frontend/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() }, messageFromError: () => 'Test failure' }))
const { ConversationPane } = await import('#/frontend/pages/dashboard/inbox/ConversationPane')
let client: QueryClient
let detail: ConversationDetail
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1 })
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  detail = {
    conversation: { id: 'qa-letter', subject: 'QA letter', counterpartEmail: 'fixture@example.com', counterpartName: '', origin: 'incoming', folder: 'inbox', isRead: true, isStarred: false, messageCount: 0, lastMessageAt: '2026-10-02T10:00:00Z', lastDirection: 'incoming', lastPreview: '', hasFailedSend: false, hasDraft: false, trashedAt: null, facts: {} },
    messages: { items: [], page: 1, pageSize: 20, total: 0, pageCount: 0, hasMore: false }, replyDraftId: null,
  }
  api.readConversation.mockImplementation(async () => structuredClone(detail))
  api.patchConversation.mockImplementation(async (_id, flags) => {
    detail.conversation = { ...detail.conversation, ...flags }
    return structuredClone(detail.conversation)
  })
})
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals() })
const mount = () => render(<QueryClientProvider client={client}><ConversationPane id="qa-letter" backLabel="Inbox" onGone={vi.fn()} onOpenConversation={vi.fn()} /></QueryClientProvider>)
describe('explicit unread commands', () => {
  it('does not undo marking an initially read open letter unread', async () => {
    mount(); await screen.findByRole('heading', { name: 'QA letter' })
    expect(api.patchConversation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Mark unread' }))
    await waitFor(() => expect(api.patchConversation).toHaveBeenCalledTimes(1))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Mark unread' }) as HTMLButtonElement).disabled).toBe(false))
    expect(detail.conversation.isRead).toBe(false)
    expect(api.patchConversation.mock.calls[0]?.[1].isRead).toBe(false)
    expect(api.readConversation).toHaveBeenCalledTimes(1)
  })
  it('marks an initially unread letter read once and then respects an unread command', async () => {
    detail.conversation.isRead = false
    mount(); await screen.findByRole('heading', { name: 'QA letter' })
    await waitFor(() => expect(api.patchConversation).toHaveBeenCalledTimes(1))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Mark unread' }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: 'Mark unread' }))
    await waitFor(() => expect(api.patchConversation).toHaveBeenCalledTimes(2))
    await waitFor(() => expect((screen.getByRole('button', { name: 'Mark unread' }) as HTMLButtonElement).disabled).toBe(false))
    expect(detail.conversation.isRead).toBe(false)
  })
})
