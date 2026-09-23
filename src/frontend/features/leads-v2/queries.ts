import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  FollowUpListItem,
  LeadChoice,
  LeadStage,
  OwnerLead,
  OwnerLeadListItem,
  StageChange,
} from '#/backend2/contracts/lead.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  type ChoiceKind,
  type ChoicesQuery,
  type LeadsQuery,
  cancelFollowUp,
  changeStage,
  commitImport,
  completeFollowUp,
  createChoice,
  createFollowUp,
  createLead,
  createStage,
  deleteChoice,
  deleteImport,
  deleteLead,
  deleteStage,
  dueFollowUpCount,
  listChoices,
  listFollowUps,
  listImports,
  listLeads,
  listStages,
  patchChoice,
  patchFollowUp,
  patchLead,
  patchStage,
  previewImport,
  readImport,
  readLead,
  restoreLead,
  trashLead,
} from './api'

/**
 * What Leads reads, and what is re-read after each write. One prefix for the
 * whole module: a stage move changes a column's count, a list, the lead's
 * file and maybe the due count at once. A Won move creates or changes a
 * Client, so that cache is refreshed too. Niches are the one list Leads and
 * Clients share, and they live under the Clients prefix.
 */
export const leadKeys = {
  all: ['backend2', 'leads'] as const,
  list: (query: LeadsQuery) => [...leadKeys.all, 'list', query] as const,
  one: (id: string) => [...leadKeys.all, 'one', id] as const,
  stages: () => [...leadKeys.all, 'stages'] as const,
  choices: (kind: ChoiceKind, query: ChoicesQuery) => [...leadKeys.all, 'choices', kind, query] as const,
  followUps: (query: object) => [...leadKeys.all, 'follow-ups', query] as const,
  dueCount: () => [...leadKeys.all, 'due-count'] as const,
  imports: (query: object) => [...leadKeys.all, 'imports', query] as const,
  import: (id: string, query: object) => [...leadKeys.all, 'import', id, query] as const,
}

const CLIENTS_KEY = ['backend2', 'clients'] as const

/**
 * Every cached niche page, whatever its query. Each niche carries how many
 * Leads use it, and Manage niches offers Delete only while that count is 0:
 * a stale 0 invites a delete the server then refuses as in use.
 */
const NICHES_KEY = [...CLIENTS_KEY, 'niches'] as const

/** Anything the server answered on purpose is taken at its word. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const useLeads = (query: LeadsQuery, options: { enabled?: boolean } = {}) =>
  useQuery<Page<OwnerLeadListItem>>({
    queryKey: leadKeys.list(query),
    queryFn: () => listLeads(query),
    placeholderData: (previous) => previous,
    enabled: options.enabled ?? true,
    retry,
  })

export const useLead = (id: string | undefined) =>
  useQuery<OwnerLead>({
    queryKey: leadKeys.one(id ?? ''),
    queryFn: () => readLead(id!),
    enabled: Boolean(id),
    retry,
  })

export const useStages = () => useQuery<LeadStage[]>({ queryKey: leadKeys.stages(), queryFn: listStages, retry })

export const useChoices = (kind: ChoiceKind, query: ChoicesQuery) =>
  useQuery<Page<LeadChoice>>({
    queryKey: leadKeys.choices(kind, query),
    queryFn: () => listChoices(kind, query),
    placeholderData: (previous) => previous,
    retry,
  })

export const useFollowUps = (query: { page?: number; pageSize?: number; when?: 'due' | 'upcoming' | 'all' }) =>
  useQuery<Page<FollowUpListItem>>({
    queryKey: leadKeys.followUps(query),
    queryFn: () => listFollowUps(query),
    placeholderData: (previous) => previous,
    retry,
  })

/**
 * How many follow-ups are due — the sidebar count and the banner on Leads.
 * Re-read every minute, so a follow-up that falls due while the Dashboard is
 * open shows up without a reload. Quiet on failure: a count is not worth an
 * error on every screen.
 */
export const useDueFollowUpCount = () =>
  useQuery<{ due: number }>({
    queryKey: leadKeys.dueCount(),
    queryFn: dueFollowUpCount,
    refetchInterval: 60_000,
    retry: false,
  })

export const useImports = (query: { page?: number; pageSize?: number }) =>
  useQuery({ queryKey: leadKeys.imports(query), queryFn: () => listImports(query), placeholderData: (p) => p, retry })

export const useImport = (id: string | undefined, query: { page?: number; pageSize?: number } = {}) =>
  useQuery({
    queryKey: leadKeys.import(id ?? '', query),
    queryFn: () => readImport(id!, query),
    enabled: Boolean(id),
    placeholderData: (p) => p,
    retry,
  })

/* ------------------------------------------------------------------ writes */

/**
 * What a write may have changed outside Leads. `clients` re-reads all of
 * Clients, niches included; `niches` only the niche lists, for a write that
 * can give a niche a Lead or take one away but touches no Client.
 */
type RefreshOptions = { clients?: boolean; niches?: boolean }

const useRefresh = () => {
  const client = useQueryClient()

  return async (options: RefreshOptions = {}) => {
    await client.invalidateQueries({ queryKey: leadKeys.all })
    if (options.clients) await client.invalidateQueries({ queryKey: CLIENTS_KEY })
    else if (options.niches) await client.invalidateQueries({ queryKey: NICHES_KEY })
  }
}

/**
 * Writes that return the whole Lead put it straight into the cache: the next
 * edit sends its `revision` back, and a value one behind the server's would
 * surface as a 409.
 */
const useLeadMutation = <TInput>(run: (input: TInput) => Promise<OwnerLead>, options: RefreshOptions = {}) => {
  const client = useQueryClient()
  const refresh = useRefresh()

  return useMutation({
    mutationFn: run,
    onSuccess: async (saved) => {
      client.setQueryData(leadKeys.one(saved.id), saved)
      await refresh(options)
    },
  })
}

/** A new Lead may take a niche, which changes that niche's lead count. */
export const useCreateLead = () =>
  useLeadMutation((input: Parameters<typeof createLead>[0]) => createLead(input), { niches: true })

/** An edit may move a Lead from one niche to another, so both counts change. */
export const usePatchLead = () =>
  useLeadMutation(
    (input: { id: string } & Parameters<typeof patchLead>[1]) => {
      const { id, ...patch } = input

      return patchLead(id, patch)
    },
    { niches: true },
  )

/** A stage move. Won may create or change a Client, so Clients are re-read too. */
export const useChangeStage = () =>
  useLeadMutation((input: { id: string; change: StageChange }) => changeStage(input.id, input.change), {
    clients: true,
  })

export const useTrashLead = () => useLeadMutation((id: string) => trashLead(id))

export const useRestoreLead = () => useLeadMutation((id: string) => restoreLead(id))

/** A deleted Lead no longer counts toward its niche, and may unlink a Client. */
export const useDeleteLead = () => {
  const client = useQueryClient()
  const refresh = useRefresh()

  return useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: leadKeys.one(id) })
      void refresh({ clients: true })
    },
  })
}

export const useCreateFollowUp = () =>
  useLeadMutation((input: { id: string; date: string; time: string; note?: string }) => {
    const { id, ...rest } = input

    return createFollowUp(id, rest)
  })

export const usePatchFollowUp = () =>
  useLeadMutation((input: { id: string; date?: string; time?: string; note?: string }) => {
    const { id, ...rest } = input

    return patchFollowUp(id, rest)
  })

export const useCompleteFollowUp = () => useLeadMutation((id: string) => completeFollowUp(id))

export const useCancelFollowUp = () => useLeadMutation((id: string) => cancelFollowUp(id))

const useStagesMutation = <TInput>(run: (input: TInput) => Promise<LeadStage[]>) => {
  const client = useQueryClient()
  const refresh = useRefresh()

  return useMutation({
    mutationFn: run,
    onSuccess: async (stages) => {
      client.setQueryData(leadKeys.stages(), stages)
      await refresh()
    },
  })
}

export const useCreateStage = () => useStagesMutation((name: string) => createStage(name))

export const usePatchStage = () =>
  useStagesMutation((input: { id: string; name?: string; position?: number }) => {
    const { id, ...patch } = input

    return patchStage(id, patch)
  })

export const useDeleteStage = () => useStagesMutation((id: string) => deleteStage(id))

const useRefreshingMutation = <TInput, TOutput>(
  run: (input: TInput) => Promise<TOutput>,
  options: RefreshOptions = {},
) => {
  const refresh = useRefresh()

  return useMutation({ mutationFn: run, onSuccess: () => refresh(options) })
}

export const useCreateChoice = () =>
  useRefreshingMutation((input: { kind: ChoiceKind; name: string }) => createChoice(input.kind, input.name))

export const usePatchChoice = () =>
  useRefreshingMutation((input: { kind: ChoiceKind; id: string; name?: string; hidden?: boolean }) =>
    patchChoice(input.kind, input.id, { name: input.name, hidden: input.hidden }),
  )

export const useDeleteChoice = () =>
  useRefreshingMutation((input: { kind: ChoiceKind; id: string }) => deleteChoice(input.kind, input.id))

/** A preview saves nothing, so nothing is refreshed after it. */
export const usePreviewImport = () => useMutation({ mutationFn: previewImport })

/** Imported rows may name niches, so their lead counts change. */
export const useCommitImport = () => useRefreshingMutation(commitImport, { niches: true })

/** Removes only the report; the imported Leads and their niches stay as they are. */
export const useDeleteImport = () => useRefreshingMutation((id: string) => deleteImport(id))
