import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  addLine,
  createDeal,
  deleteDeal,
  deleteLine,
  fetchBoard,
  fetchLeadFile,
  fetchLeads,
  fetchOverdueCount,
  moveDeal,
  updateDeal,
} from '#/frontend/api/lead.api'
import type {
  DealMoveInput,
  DealWriteInput,
  EventNoteInput,
} from '#/shared/validation/lead.validation'

/**
 * One key prefix for the section, so any write refreshes everything it could
 * have changed. Moving one deal changes its person's file, the list's
 * grouping, the board and three of the four numbers — one invalidation covers
 * all of them, and the alternative is a dozen hand-patched caches that each
 * have to stay correct as the screens change.
 */
const LEADS = ['admin', 'leads'] as const

export const leadsQuery = (stage: string, search: string) =>
  queryOptions({
    queryKey: [...LEADS, 'list', stage, search],
    queryFn: () => fetchLeads(stage, search),
  })

export const leadFileQuery = (personId: string) =>
  queryOptions({
    queryKey: [...LEADS, 'file', personId],
    queryFn: () => fetchLeadFile(personId),
    enabled: personId !== '',
  })

export const boardQuery = () =>
  queryOptions({ queryKey: [...LEADS, 'board'], queryFn: fetchBoard })

/**
 * The number on the sidebar.
 *
 * Asked for on every admin page, so it is allowed to be a minute out of date —
 * but never wrong in a way he would act on: a minute is shorter than the time
 * between opening two pages, and a follow-up date changes by the day.
 */
export const overdueQuery = () =>
  queryOptions({
    queryKey: [...LEADS, 'overdue'],
    queryFn: fetchOverdueCount,
    staleTime: 60_000,
  })

const useLeadMutation = <TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) => {
  const client = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => void client.invalidateQueries({ queryKey: LEADS }),
  })
}

export const useCreateDeal = (personId: string) =>
  useLeadMutation((input: DealWriteInput) => createDeal(personId, input))

export const useUpdateDeal = (personId: string) =>
  useLeadMutation((input: { dealId: string } & DealWriteInput) => {
    const { dealId, ...rest } = input

    return updateDeal(personId, dealId, rest)
  })

export const useMoveDeal = (personId: string) =>
  useLeadMutation((input: { dealId: string } & DealMoveInput) => {
    const { dealId, ...rest } = input

    return moveDeal(personId, dealId, rest)
  })

export const useDeleteDeal = (personId: string) =>
  useLeadMutation((dealId: string) => deleteDeal(personId, dealId))

export const useAddLine = (personId: string) =>
  useLeadMutation((input: EventNoteInput) => addLine(personId, input))

export const useDeleteLine = (personId: string) =>
  useLeadMutation((eventId: string) => deleteLine(personId, eventId))

/**
 * The board moves a deal that belongs to somebody else's file, so the person
 * is part of the input rather than baked into the hook.
 */
export const useMoveDealOnBoard = () =>
  useLeadMutation((input: { personId: string; dealId: string } & DealMoveInput) => {
    const { personId, dealId, ...rest } = input

    return moveDeal(personId, dealId, rest)
  })
