import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type { OwnerClient, OwnerClientListItem } from '#/backend2/contracts/client.contract'
import type { OwnerNiche } from '#/backend2/contracts/niche.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  createClient,
  createNiche,
  deleteClient,
  deleteNiche,
  listClients,
  listNiches,
  patchClient,
  patchNiche,
  readClient,
  restoreClient,
  setClientStatus,
  trashClient,
  type ClientsQuery,
  type NichesQuery,
} from './api'

/**
 * What Clients reads, and what is re-read after each write. Niches share the
 * prefix: renaming one changes the name shown on every Client that has it.
 */
export const clientKeys = {
  all: ['backend2', 'clients'] as const,
  list: (query: ClientsQuery) => [...clientKeys.all, 'list', query] as const,
  one: (id: string) => [...clientKeys.all, 'one', id] as const,
  niches: (query: NichesQuery) => [...clientKeys.all, 'niches', query] as const,
}

/** Anything the server answered on purpose is taken at its word. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const useClients = (query: ClientsQuery) =>
  useQuery<Page<OwnerClientListItem>>({
    queryKey: clientKeys.list(query),
    queryFn: () => listClients(query),
    placeholderData: (previous) => previous,
    retry,
  })

export const useClient = (id: string | undefined) =>
  useQuery<OwnerClient>({
    queryKey: clientKeys.one(id ?? ''),
    queryFn: () => readClient(id!),
    enabled: Boolean(id),
    retry,
  })

export const useNiches = (query: NichesQuery) =>
  useQuery<Page<OwnerNiche>>({
    queryKey: clientKeys.niches(query),
    queryFn: () => listNiches(query),
    placeholderData: (previous) => previous,
    retry,
  })

const useRefresh = () => {
  const client = useQueryClient()

  return () => client.invalidateQueries({ queryKey: clientKeys.all })
}

/**
 * Writes that return the whole Client put it straight into the cache: the
 * next edit sends its `revision` back, and a value one behind the server's
 * would surface as a 409.
 */
const useClientMutation = <TInput>(run: (input: TInput) => Promise<OwnerClient>) => {
  const client = useQueryClient()
  const refresh = useRefresh()

  return useMutation({
    mutationFn: run,
    onSuccess: async (saved) => {
      client.setQueryData(clientKeys.one(saved.id), saved)
      await refresh()
    },
  })
}

export const useCreateClient = () =>
  useClientMutation((input: Parameters<typeof createClient>[0]) => createClient(input))

export const usePatchClient = () =>
  useClientMutation((input: { id: string } & Parameters<typeof patchClient>[1]) => {
    const { id, ...patch } = input

    return patchClient(id, patch)
  })

export const useClientStatus = () =>
  useClientMutation((input: { id: string; status: 'active' | 'inactive' }) => setClientStatus(input.id, input.status))

export const useTrashClient = () => useClientMutation((id: string) => trashClient(id))

export const useRestoreClient = () => useClientMutation((id: string) => restoreClient(id))

export const useDeleteClient = () => {
  const client = useQueryClient()
  const refresh = useRefresh()

  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: (_, id) => {
      client.removeQueries({ queryKey: clientKeys.one(id) })
      void refresh()
    },
  })
}

/** Leads carry niches too: a renamed or hidden niche must read the same there. */
const useNicheMutation = <TInput, TOutput>(run: (input: TInput) => Promise<TOutput>) => {
  const client = useQueryClient()
  const refresh = useRefresh()

  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await refresh()
      await client.invalidateQueries({ queryKey: ['backend2', 'leads'] })
    },
  })
}

export const useCreateNiche = () => useNicheMutation((name: string) => createNiche(name))

export const usePatchNiche = () =>
  useNicheMutation((input: { id: string; name?: string; hidden?: boolean }) => {
    const { id, ...patch } = input

    return patchNiche(id, patch)
  })

export const useDeleteNiche = () => useNicheMutation((id: string) => deleteNiche(id))
