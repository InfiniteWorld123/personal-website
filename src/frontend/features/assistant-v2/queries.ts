import { useEffect } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AssistantSettings } from '#/backend2/contracts/assistant.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  type ConversationsQuery,
  type SettingsPatchInput,
  deleteConversation,
  listConversations,
  patchSettings,
  readConversation,
  readSettings,
  readUsage,
} from './api'

/**
 * What the assistant screens read, and what is re-read after each write. One
 * prefix for the module: deleting a conversation changes the list, its count
 * and the usage panel's stored numbers at once.
 */
export const assistantKeys = {
  all: ['backend2', 'assistant'] as const,
  list: (query: ConversationsQuery) => [...assistantKeys.all, 'list', query] as const,
  one: (id: string) => [...assistantKeys.all, 'one', id] as const,
  usage: (days: number) => [...assistantKeys.all, 'usage', days] as const,
  settings: () => [...assistantKeys.all, 'settings'] as const,
}

/** Anything the server answered on purpose is taken at its word. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const useAssistantConversations = (query: ConversationsQuery) =>
  useQuery({
    queryKey: assistantKeys.list(query),
    queryFn: () => listConversations(query),
    placeholderData: keepPreviousData,
    retry,
  })

/** The next page is read while this one is shown, and a conversation as the pointer rests on it. */
export const usePrefetchNextConversations = (query: ConversationsQuery, hasMore: boolean | undefined) => {
  const client = useQueryClient()

  useEffect(() => {
    if (!hasMore) return

    const next = { ...query, page: (query.page ?? 1) + 1 }

    void client.prefetchQuery({ queryKey: assistantKeys.list(next), queryFn: () => listConversations(next), staleTime: 30_000 })
  }, [client, hasMore, query])
}

export const usePrefetchConversation = () => {
  const client = useQueryClient()

  return (id: string) =>
    void client.prefetchQuery({ queryKey: assistantKeys.one(id), queryFn: () => readConversation(id), staleTime: 30_000 })
}

export const useAssistantConversation = (id: string) =>
  useQuery({ queryKey: assistantKeys.one(id), queryFn: () => readConversation(id), retry })

export const useAssistantUsage = (days = 30) =>
  useQuery({ queryKey: assistantKeys.usage(days), queryFn: () => readUsage(days), retry })

export const useAssistantSettings = () =>
  useQuery({ queryKey: assistantKeys.settings(), queryFn: readSettings, retry })

export const useDeleteAssistantConversation = () => {
  const client = useQueryClient()

  return useMutation({
    mutationFn: deleteConversation,
    // The list and the usage panel are re-read. The deleted conversation's own
    // cache is left to the screen, which closes it first: re-reading it here
    // while it is still open would flash "not found" at the owner.
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: [...assistantKeys.all, 'list'] }),
        client.invalidateQueries({ queryKey: [...assistantKeys.all, 'usage'] }),
      ])
    },
  })
}

export const useSaveAssistantSettings = () => {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (patch: SettingsPatchInput) => patchSettings(patch),
    onSuccess: (settings: AssistantSettings) => {
      client.setQueryData(assistantKeys.settings(), settings)
    },
  })
}
