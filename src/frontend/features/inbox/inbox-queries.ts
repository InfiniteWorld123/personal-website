import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addLeadNote,
  applyLeadBulkAction,
  deleteLeadNote,
  fetchInboxSettings,
  fetchLead,
  fetchLeads,
  fetchUnreadLeadCount,
  replyToLead,
  saveInboxPreferences,
  setLeadArchived,
  setLeadJunk,
  setLeadRead,
  setLeadStatus,
} from '#/frontend/api/lead.api'
import type { AdminLeadDetail } from '#/shared/types/lead.types'
import type {
  InboxPreferences,
  LeadBulkInput,
  LeadFilterInput,
  LeadReplyInput,
  LeadStatus,
} from '#/shared/validation/lead.validation'

export const leadsQuery = (filter: LeadFilterInput) =>
  queryOptions({
    queryKey: ['inbox', 'list', filter.tab, filter.search, filter.page, filter.withBookings],
    queryFn: () => fetchLeads(filter),
  })

export const leadQuery = (id: string | undefined) =>
  queryOptions({
    queryKey: ['inbox', 'lead', id],
    queryFn: () => fetchLead(id as string),
    enabled: Boolean(id),
  })

/**
 * The badge in the sidebar. Refetched on a timer because a message can arrive
 * while the owner is on another page and nothing else would tell him.
 */
export const unreadLeadsQuery = () =>
  queryOptions({
    queryKey: ['inbox', 'unread'],
    queryFn: fetchUnreadLeadCount,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

export const inboxSettingsQuery = () =>
  queryOptions({
    queryKey: ['inbox', 'settings'],
    queryFn: fetchInboxSettings,
    /** Read on every inbox render; it changes only from its own page. */
    staleTime: 5 * 60_000,
  })

/**
 * Every write returns the whole lead, so the cache is filled from the answer
 * rather than refetched — the reading pane must not blink after a status click.
 */
const useLeadWrite = <TInput>(write: (input: TInput) => Promise<AdminLeadDetail>) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: write,
    onSuccess: (lead) => {
      queryClient.setQueryData(['inbox', 'lead', lead.id], lead)
      void queryClient.invalidateQueries({ queryKey: ['inbox', 'list'] })
      void queryClient.invalidateQueries({ queryKey: ['inbox', 'unread'] })
    },
  })
}

export const useSetLeadStatus = () =>
  useLeadWrite(({ id, status }: { id: string; status: LeadStatus }) => setLeadStatus(id, status))

export const useSetLeadRead = () =>
  useLeadWrite(({ id, value }: { id: string; value: boolean }) => setLeadRead(id, value))

export const useSetLeadArchived = () =>
  useLeadWrite(({ id, value }: { id: string; value: boolean }) => setLeadArchived(id, value))

export const useSetLeadJunk = () =>
  useLeadWrite(({ id, value }: { id: string; value: boolean }) => setLeadJunk(id, value))

export const useAddLeadNote = () =>
  useLeadWrite(({ id, body }: { id: string; body: string }) => addLeadNote(id, body))

export const useDeleteLeadNote = () =>
  useLeadWrite(({ id, noteId }: { id: string; noteId: string }) => deleteLeadNote(id, noteId))

export const useReplyToLead = () =>
  useLeadWrite(({ id, input }: { id: string; input: LeadReplyInput }) => replyToLead(id, input))

export const useLeadBulkAction = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: LeadBulkInput) => applyLeadBulkAction(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    },
  })
}

export const useSaveInboxPreferences = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (preferences: InboxPreferences) => saveInboxPreferences(preferences),
    onSuccess: (settings) => {
      queryClient.setQueryData(['inbox', 'settings'], settings)
    },
  })
}
