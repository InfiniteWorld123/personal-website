import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ConversationDetail, InboxLanguage } from '#/backend2/contracts/inbox.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  type ConversationsQuery,
  type SnippetInput,
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

/**
 * What the Inbox reads, and what is re-read after each write. One prefix,
 * invalidated whole: an archive changes a count, a folder and a row at once,
 * and a stale "3 unread" is the label that must never be wrong.
 */
export const inboxKeys = {
  all: ['backend2', 'inbox'] as const,
  counts: () => [...inboxKeys.all, 'counts'] as const,
  list: (query: ConversationsQuery) => [...inboxKeys.all, 'list', query] as const,
  conversation: (id: string) => [...inboxKeys.all, 'conversation', id] as const,
  drafts: (page: number) => [...inboxKeys.all, 'drafts', page] as const,
  settings: () => [...inboxKeys.all, 'settings'] as const,
  snippets: (page: number, pageSize: number) => [...inboxKeys.all, 'snippets', page, pageSize] as const,
}

const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const useConversations = (query: ConversationsQuery, enabled = true) =>
  useQuery({
    queryKey: inboxKeys.list(query),
    queryFn: () => listConversations(query),
    placeholderData: (previous) => previous,
    enabled,
    retry,
    // New mail arrives on its own; the list notices within a minute.
    refetchInterval: 60_000,
  })

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
export const useConversation = (id: string | null) =>
  useInfiniteQuery<ConversationDetail>({
    queryKey: inboxKeys.conversation(id ?? ''),
    queryFn: ({ pageParam }) => readConversation(id!, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.messages.hasMore ? last.messages.page + 1 : undefined),
    enabled: id !== null,
    retry,
  })

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

const useInboxMutation = <TInput, TResult>(fn: (input: TInput) => Promise<TResult>) => {
  const refresh = useRefreshInbox()

  return useMutation({ mutationFn: fn, onSettled: () => refresh() })
}

export const usePatchConversation = () =>
  useInboxMutation((input: { id: string; isRead?: boolean; isStarred?: boolean; archived?: boolean }) =>
    patchConversation(input.id, { isRead: input.isRead, isStarred: input.isStarred, archived: input.archived }),
  )

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
