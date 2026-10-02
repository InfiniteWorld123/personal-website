import { useCallback, useEffect, useMemo } from 'react'
import { infiniteQueryOptions, queryOptions, useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import type { ConversationDetail, InboxDraft, InboxLanguage } from '#/backend2/contracts/inbox.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  type ConversationsQuery,
  type SnippetInput,
  bulkConversations,
  createSnippet,
  deleteConversation,
  deleteSnippet,
  discardDraft,
  emptyTrash,
  listConversations,
  listDrafts,
  listSnippets,
  patchConversation,
  readConversation,
  readCounts,
  readSettings,
  restoreConversation,
  retryMessage,
  saveAttachmentToMedia,
  saveSettings,
  trashConversation,
  updateSnippet,
} from './api'

/** Shared keys let hover and opening consume the same deduplicated request. */
export const inboxKeys = {
  all: ['backend2', 'inbox'] as const,
  counts: () => [...inboxKeys.all, 'counts'] as const,
  list: (query: ConversationsQuery) => [...inboxKeys.all, 'list', query] as const,
  conversation: (id: string) => [...inboxKeys.all, 'conversation', id] as const,
  drafts: (page: number) => [...inboxKeys.all, 'drafts', page] as const,
  draft: (id: string) => [...inboxKeys.all, 'draft', id] as const,
  settings: () => [...inboxKeys.all, 'settings'] as const,
  snippets: (page: number, pageSize: number) => [...inboxKeys.all, 'snippets', page, pageSize] as const,
}

const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const conversationListOptions = (input: ConversationsQuery) => {
  const query = {
    ...input, unread: input.unread || undefined, starred: input.starred || undefined,
    q: input.q?.trim() || undefined, pageSize: input.pageSize ?? 25,
  }

  return queryOptions({
    queryKey: inboxKeys.list(query),
    queryFn: ({ signal }) => listConversations(query, signal),
    placeholderData: (previous) => previous,
    staleTime: 20_000,
    retry,
    // New mail arrives on its own; the list notices within a minute.
    refetchInterval: 60_000,
  })
}

export const useConversations = (query: ConversationsQuery, enabled = true) =>
  useQuery({ ...conversationListOptions(query), enabled })

/**
 * The unread count beside Inbox in the sidebar (approved choice 6A). Quiet
 * when it fails: a count is not worth an error on every screen.
 */
export const useInboxCounts = () =>
  useQuery({
    queryKey: inboxKeys.counts(),
    queryFn: readCounts,
    refetchInterval: (query) => (query.state.status === 'error' ? false : 60_000),
    staleTime: 20_000,
    retry: false,
  })

/**
 * One conversation, newest page first. "Show earlier messages" fetches the
 * next page back rather than the whole history.
 */
export const conversationOptions = (id: string) =>
  infiniteQueryOptions({
    queryKey: inboxKeys.conversation(id),
    queryFn: ({ pageParam, signal }) => readConversation(id, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.messages.hasMore ? last.messages.page + 1 : undefined),
    staleTime: 20_000,
    retry,
    // An interrupted request becomes recoverable after two minutes. Keep
    // checking while it is pending, then stop once its outcome is visible.
    refetchInterval: (query) => query.state.data?.pages.some((page) =>
      page.messages.items.some((message) => message.delivery?.status === 'sending'),
    ) ? 5_000 : false,
  })

export const useConversation = (id: string | null) =>
  useInfiniteQuery({ ...conversationOptions(id ?? ''), enabled: id !== null })

/** Read-only intent loading. A quick mouse crossing starts no request. */
export const createInboxPrefetcher = (client: QueryClient, warmReader?: () => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const cancel = () => { clearTimeout(timer); timer = undefined }
  const allowed = () => {
    const connection = typeof navigator === 'undefined' ? undefined
      : (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection

    return !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
  }
  const conversation = (id: string) => {
    if (id && allowed()) {
      warmReader?.()
      void client.prefetchInfiniteQuery(conversationOptions(id))
    }
  }
  const folder = (view: ConversationsQuery['view']) => {
    if (allowed()) void client.prefetchQuery(conversationListOptions({ view, page: 1 }))
  }
  const schedule = (load: () => void) => {
    cancel()
    timer = setTimeout(() => { timer = undefined; load() }, 120)
  }

  return {
    conversation, folder, cancel,
    hoverConversation: (id: string) => schedule(() => conversation(id)),
    hoverFolder: (view: ConversationsQuery['view']) => schedule(() => folder(view)),
  }
}

export const usePrefetchInbox = (warmReader?: () => void) => {
  const client = useQueryClient()
  const prefetch = useMemo(() => createInboxPrefetcher(client, warmReader), [client, warmReader])
  useEffect(() => prefetch.cancel, [prefetch])

  return prefetch
}

export const useDrafts = (page: number, enabled = true) =>
  useQuery({
    queryKey: inboxKeys.drafts(page),
    queryFn: () => listDrafts(page),
    placeholderData: (previous) => previous,
    enabled,
    retry,
  })

export const useInboxSettings = () =>
  useQuery({ queryKey: inboxKeys.settings(), queryFn: readSettings, retry, staleTime: 60_000 })

export const useSnippets = (page: number, pageSize = 25) =>
  useQuery({
    queryKey: inboxKeys.snippets(page, pageSize),
    queryFn: () => listSnippets(page, pageSize),
    placeholderData: (previous) => previous,
    retry,
  })

export const useRefreshInbox = () => {
  const client = useQueryClient()

  return () => client.invalidateQueries({ queryKey: inboxKeys.all })
}

/** Publish the exact saved revision without resetting the open form. */
export const useRememberDraft = () => {
  const client = useQueryClient()

  return useCallback((draft: InboxDraft) => {
    client.setQueryData(inboxKeys.draft(draft.id), draft)
    void client.invalidateQueries({
      queryKey: inboxKeys.all,
      predicate: (query) => ['drafts', 'counts', 'list'].includes(String(query.queryKey[2])),
    })
  }, [client])
}

const useInboxMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const refresh = useRefreshInbox()

  return useMutation({ mutationFn: fn, onSettled: () => refresh() })
}

export const usePatchConversation = () => {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: { id: string; isRead?: boolean; isStarred?: boolean; archived?: boolean }) =>
      patchConversation(input.id, { isRead: input.isRead, isStarred: input.isStarred, archived: input.archived }),
    onSuccess: (summary) => {
      client.setQueryData<InfiniteData<ConversationDetail>>(inboxKeys.conversation(summary.id), (cached) => cached ? {
        ...cached, pages: cached.pages.map((page) => ({
          ...page, conversation: { ...page.conversation, ...summary },
        })),
      } : undefined)
    },
    onSettled: async (_data, error, input) => {
      // A read/star/folder flag does not change message bodies or draft text.
      // Do not reload every cached history page just to mark the open mail read.
      await Promise.all([
        client.invalidateQueries({ queryKey: inboxKeys.counts() }),
        client.invalidateQueries({ queryKey: [...inboxKeys.all, 'list'] }),
        ...(error ? [client.invalidateQueries({ queryKey: inboxKeys.conversation(input.id) })] : []),
      ])
    },
  })
}

export const useBulkConversations = () => {
  const client = useQueryClient()

  return useMutation({
    mutationFn: bulkConversations,
    onSettled: (_result, _error, input) => client.invalidateQueries({
      queryKey: inboxKeys.all,
      predicate: (query) => ['counts', 'list', 'drafts'].includes(String(query.queryKey[2]))
        || (query.queryKey[2] === 'conversation' && input.conversationIds.includes(String(query.queryKey[3]))),
    }),
  })
}

export const useTrashConversation = () => useInboxMutation(trashConversation)
export const useRestoreConversation = () => useInboxMutation(restoreConversation)
export const useDeleteConversation = () => useInboxMutation(deleteConversation)
export const useEmptyTrash = () => useInboxMutation(() => emptyTrash())
export const useRetryMessage = () => useInboxMutation(retryMessage)
export const useSaveToMedia = () => useInboxMutation(saveAttachmentToMedia)
export const useDiscardDraft = () => useInboxMutation(discardDraft)
export const useSaveSettings = () =>
  useInboxMutation((signatures: Record<InboxLanguage, string>) => saveSettings(signatures))
export const useCreateSnippet = () => useInboxMutation(createSnippet)
export const useUpdateSnippet = () =>
  useInboxMutation((input: SnippetInput & { id: string }) => updateSnippet(input.id, input))
export const useDeleteSnippet = () => useInboxMutation(deleteSnippet)
