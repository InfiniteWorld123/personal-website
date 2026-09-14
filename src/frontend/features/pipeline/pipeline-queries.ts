import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createLeadByHand,
  decideSuggestion,
  fetchCalls,
  fetchLeadSettings,
  fetchPipeline,
  fetchServices,
  fetchToday,
  markNoShow,
  reopenLead,
  saveLeadSettings,
  setLeadFields,
  setLeadStage,
  snoozeLead,
} from '#/frontend/api/pipeline.api'
import type { PipelineCard } from '#/shared/types/pipeline.types'
import type {
  LeadFieldsWriteInput,
  LeadLostReason,
  LeadPreferences,
  ManualLeadInput,
  PipelineFilterInput,
  SuggestionDecisionInput,
} from '#/shared/validation/pipeline.validation'
import type { LeadStatus } from '#/shared/validation/lead.validation'

export const pipelineQuery = (filter: PipelineFilterInput) =>
  queryOptions({
    queryKey: ['pipeline', 'board', filter.service, filter.search, filter.sort, filter.withClosed],
    queryFn: () => fetchPipeline(filter),
    /**
     * Reading the board is also what runs the time-based rules, so a board
     * left open on a second screen keeps itself honest.
     */
    refetchInterval: 60_000,
  })

export const todayQuery = () =>
  queryOptions({ queryKey: ['pipeline', 'today'], queryFn: fetchToday, refetchInterval: 60_000 })

export const callsQuery = (filter: PipelineFilterInput) =>
  queryOptions({
    queryKey: ['pipeline', 'calls', filter.service],
    queryFn: () => fetchCalls(filter),
    refetchInterval: 60_000,
  })

export const servicesQuery = () =>
  queryOptions({
    queryKey: ['pipeline', 'services'],
    queryFn: fetchServices,
    /** Three rows that change when the offer changes, which is rarely. */
    staleTime: 10 * 60_000,
  })

export const leadSettingsQuery = () =>
  queryOptions({
    queryKey: ['pipeline', 'settings'],
    queryFn: fetchLeadSettings,
    staleTime: 5 * 60_000,
  })

/**
 * Every write answers with the whole card, so the caches are filled from the
 * answer rather than refetched. Moving a card must not make the board blink.
 *
 * The inbox keys are invalidated too: the same row is read there, and a stage
 * changed on the board has to show in the message list a second later — that
 * is the whole point of one record behind several lenses.
 */
const useCardWrite = <TInput>(write: (input: TInput) => Promise<PipelineCard>) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: write,
    onSuccess: (card) => {
      queryClient.setQueryData(['pipeline', 'card', card.id], card)
      void queryClient.invalidateQueries({ queryKey: ['pipeline', 'board'] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline', 'today'] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline', 'calls'] })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    },
  })
}

export const useSetLeadStage = () =>
  useCardWrite(({ id, status, lostReason }: { id: string; status: LeadStatus; lostReason?: LeadLostReason | null }) =>
    setLeadStage(id, status, lostReason),
  )

export const useSetLeadFields = () =>
  useCardWrite(({ id, input }: { id: string; input: LeadFieldsWriteInput }) => setLeadFields(id, input))

export const useSnoozeLead = () =>
  useCardWrite(({ id, days }: { id: string; days: number }) => snoozeLead(id, days))

export const useDecideSuggestion = () =>
  useCardWrite(({ id, input }: { id: string; input: SuggestionDecisionInput }) => decideSuggestion(id, input))

export const useMarkNoShow = () => useCardWrite(({ id }: { id: string }) => markNoShow(id))

export const useReopenLead = () => useCardWrite(({ id }: { id: string }) => reopenLead(id))

export const useCreateLeadByHand = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ManualLeadInput) => createLeadByHand(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    },
  })
}

export const useSaveLeadSettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (preferences: LeadPreferences) => saveLeadSettings(preferences),
    onSuccess: (settings) => {
      queryClient.setQueryData(['pipeline', 'settings'], settings)
      // Switches change what the board shows and what the rules do, so every
      // lens is asked again rather than left on yesterday's answer.
      void queryClient.invalidateQueries({ queryKey: ['pipeline'] })
    },
  })
}
