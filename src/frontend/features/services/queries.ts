import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  Language,
  OwnerService,
  OwnerServiceListItem,
  PublicServiceDetail,
} from '#/backend2/contracts/service.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  checkSlug,
  createService,
  deleteService,
  discardPending,
  listServices,
  moveService,
  patchService,
  previewService,
  publishService,
  readService,
  unpublishService,
  type ServicesQuery,
} from './api'

/**
 * What Services reads, and what is re-read after each write. One prefix for
 * the module: a move renumbers every row and a publish changes a row's state,
 * and a stale "Live" badge is the one label here that must never be wrong.
 */
export const serviceKeys = {
  all: ['backend2', 'services'] as const,
  list: (query: ServicesQuery) => [...serviceKeys.all, 'list', query] as const,
  one: (id: string) => [...serviceKeys.all, 'one', id] as const,
  preview: (id: string, language: Language, revision: number) =>
    [...serviceKeys.all, 'preview', id, language, revision] as const,
  slug: (slug: string, id: string) => [...serviceKeys.all, 'slug', slug, id] as const,
}

/** Anything the server answered on purpose is taken at its word. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

export const useServices = (query: ServicesQuery) =>
  useQuery<Page<OwnerServiceListItem>>({
    queryKey: serviceKeys.list(query),
    queryFn: () => listServices(query),
    placeholderData: (previous) => previous,
    retry,
  })

export const useService = (id: string) =>
  useQuery<OwnerService>({ queryKey: serviceKeys.one(id), queryFn: () => readService(id), retry })

export const useServicePreview = (input: { id: string; language: Language; revision: number }) =>
  useQuery<PublicServiceDetail>({
    queryKey: serviceKeys.preview(input.id, input.language, input.revision),
    queryFn: () => previewService(input.id, input.language),
    placeholderData: (previous) => previous,
    retry,
  })

/** Is the address free? Asked only for a valid one, a moment after typing stops. */
export const useSlugCheck = (slug: string, id: string, enabled: boolean) =>
  useQuery({
    queryKey: serviceKeys.slug(slug, id),
    queryFn: () => checkSlug(slug, id),
    enabled,
    staleTime: 10_000,
    retry: false,
  })

const useRefresh = () => {
  const client = useQueryClient()

  return () => client.invalidateQueries({ queryKey: serviceKeys.all })
}

/**
 * Writes that return the whole service put it straight into the cache: the
 * editor sends `draftRevision` back on the next save, and a value one behind
 * the server's would surface as a 409.
 */
const useServiceMutation = <TInput>(run: (input: TInput) => Promise<OwnerService>) => {
  const client = useQueryClient()
  const refresh = useRefresh()

  return useMutation({
    mutationFn: run,
    onSuccess: async (service) => {
      client.setQueryData(serviceKeys.one(service.id), service)
      await refresh()
    },
  })
}

export const useCreateService = () =>
  useServiceMutation((input: Parameters<typeof createService>[0]) => createService(input))

export const usePatchService = () =>
  useServiceMutation((input: { id: string } & Parameters<typeof patchService>[1]) => {
    const { id, ...patch } = input

    return patchService(id, patch)
  })

export const usePublishService = () =>
  useServiceMutation((input: { id: string; draftRevision: number }) => publishService(input.id, input.draftRevision))

export const useUnpublishService = () => useServiceMutation((id: string) => unpublishService(id))

export const useDiscardPending = () =>
  useServiceMutation((input: { id: string; draftRevision: number }) => discardPending(input.id, input.draftRevision))

export const useMoveService = () => {
  const refresh = useRefresh()

  return useMutation({
    mutationFn: (input: { id: string; position: number }) => moveService(input.id, input.position),
    onSuccess: refresh,
  })
}

export const useDeleteService = () => {
  const refresh = useRefresh()

  return useMutation({
    mutationFn: (id: string) => deleteService(id),
    // Not awaited: one of the refetches is the editor asking for the service
    // that was just deleted, and the caller is waiting to navigate away.
    onSuccess: () => {
      void refresh()
    },
  })
}
