// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { ConversationDetail } from '#/backend2/contracts/inbox.contract'
import {
  conversationListOptions, conversationOptions, createInboxPrefetcher,
  inboxKeys, useConversation, usePatchConversation,
} from '#/frontend/features/inbox-v2/queries'

const detail: ConversationDetail = {
  conversation: {
    id: 'c1', subject: 'Sample mail', counterpartEmail: 'anna@example.com',
    counterpartName: 'Anna', origin: 'incoming', folder: 'inbox', isRead: false,
    isStarred: false, messageCount: 1, lastMessageAt: '2026-10-02T10:00:00Z',
    lastDirection: 'incoming', lastPreview: 'Hello', hasFailedSend: false,
    hasDraft: false, trashedAt: null, facts: {},
  },
  messages: { items: [], page: 1, pageSize: 20, total: 0, pageCount: 0, hasMore: false },
  replyDraftId: null,
}
const clients: QueryClient[] = []
const client = () => {
  const value = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  clients.push(value)
  return value
}
const requests: { url: string; method: string; signal?: AbortSignal | null }[] = []

beforeEach(() => {
  requests.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET'
    requests.push({ url, method, signal: init.signal })
    const data = method === 'PATCH' ? { ...detail.conversation, isRead: true }
      : url.includes('/counts') ? { inbox: 1, inboxUnread: 0 }
      : url.includes('/conversations/c1') ? detail
      : { items: [detail.conversation], page: 1, pageSize: 25, total: 1, pageCount: 1, hasMore: false }

    return new Response(JSON.stringify({ success: true, data }), { status: 200 })
  }))
})

afterEach(() => {
  cleanup()
  for (const value of clients.splice(0)) value.clear()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Inbox intent prefetch', () => {
  it('respects data saver without blocking an explicit conversation open', async () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } })
    const cache = client()
    const prefetch = createInboxPrefetcher(cache)
    prefetch.conversation('c1')
    prefetch.folder('inbox')
    expect(requests).toHaveLength(0)
    await cache.fetchInfiniteQuery(conversationOptions('c1'))
    expect(requests).toHaveLength(1)
  })
  it('ignores a quick mouse crossing and loads only after sustained intent', async () => {
    vi.useFakeTimers()
    const prefetch = createInboxPrefetcher(client())
    prefetch.hoverConversation('c1')
    await vi.advanceTimersByTimeAsync(100)
    prefetch.cancel()
    await vi.advanceTimersByTimeAsync(100)
    expect(requests).toHaveLength(0)

    prefetch.hoverConversation('c1')
    await vi.advanceTimersByTimeAsync(120)
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ method: 'GET' })
    expect(requests[0]!.signal).toBeInstanceOf(AbortSignal)
  })

  it('deduplicates focus and hover, then opens from the same fresh history cache', async () => {
    const cache = client()
    const prefetch = createInboxPrefetcher(cache)
    prefetch.conversation('c1')
    prefetch.conversation('c1')
    await waitFor(() => expect(cache.getQueryData(inboxKeys.conversation('c1'))).toBeDefined())
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    const opened = renderHook(() => useConversation('c1'), { wrapper })

    expect(opened.result.current.isPending).toBe(false)
    expect(opened.result.current.data?.pages[0]?.conversation.subject).toBe('Sample mail')
    expect(requests).toHaveLength(1)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  it('refetches expired or invalidated mail rather than trusting an old prefetch', async () => {
    const cache = client()
    await cache.prefetchInfiniteQuery(conversationOptions('c1'))
    await cache.invalidateQueries({ queryKey: inboxKeys.conversation('c1') })
    await cache.prefetchInfiniteQuery(conversationOptions('c1'))
    expect(requests).toHaveLength(2)

    cache.setQueryData(inboxKeys.conversation('c1'), cache.getQueryData(inboxKeys.conversation('c1')), { updatedAt: Date.now() - 25_000 })
    await cache.prefetchInfiniteQuery(conversationOptions('c1'))
    expect(requests).toHaveLength(3)
  })

  it('shares the folder key when optional filters have their default values', async () => {
    const cache = client()
    const prefetch = createInboxPrefetcher(cache)
    prefetch.folder('archived')
    await waitFor(() => expect(requests).toHaveLength(1))
    await cache.fetchQuery(conversationListOptions({ view: 'archived', page: 1, unread: false, starred: false }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.url).toContain('pageSize=25')
  })

  it('updates the open summary after marking read without downloading history again', async () => {
    const cache = client()
    await cache.prefetchInfiniteQuery(conversationOptions('c1'))
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    const hook = renderHook(() => ({ detail: useConversation('c1'), patch: usePatchConversation() }), { wrapper })

    await act(async () => { await hook.result.current.patch.mutateAsync({ id: 'c1', isRead: true }) })
    await waitFor(() => expect(hook.result.current.detail.data?.pages[0]?.conversation.isRead).toBe(true))
    expect(requests.filter((request) => request.method === 'GET' && request.url.includes('/conversations/c1'))).toHaveLength(1)
    expect(requests.filter((request) => request.method === 'PATCH')).toHaveLength(1)
  })
})
