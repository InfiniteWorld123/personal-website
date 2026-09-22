import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OwnerListItem, OwnerProject } from '#/backend2/contracts/project.contract'
import { ApiRequestError } from '#/frontend/api/response'
import type { Page } from '#/backend2/contracts/pagination.contract'
import {
  archiveProject,
  createProject,
  deleteProject,
  discardPending,
  listProjects,
  moveProject,
  publishProject,
  readProject,
  restoreProject,
  saveDraft,
  unpublishProject,
  type ProjectsQuery,
} from './api'

/**
 * What Projects reads, and what has to be re-read after each write.
 *
 * One prefix for the module, because almost every write changes more than the
 * thing it was made from: publishing changes the row's state *and* the media
 * library's idea of which files are live, moving one project renumbers all of
 * them, and archiving removes a row from the default list. A narrower
 * invalidation would leave a stale "Live" badge on screen, which is the one
 * label on this surface that must never be wrong.
 */
export const projectKeys = {
  all: ['backend2', 'projects'] as const,
  list: (query: ProjectsQuery) => [...projectKeys.all, 'list', query] as const,
  one: (id: string) => [...projectKeys.all, 'one', id] as const,
}

export const useProjects = (query: ProjectsQuery) =>
  useQuery<Page<OwnerListItem>>({
    queryKey: projectKeys.list(query),
    queryFn: () => listProjects(query),
    // Keeps the current page on screen while the next one loads, so paging
    // and typing in the search box do not blank the list.
    placeholderData: (previous) => previous,
  })

export const useProject = (id: string) =>
  useQuery<OwnerProject>({
    queryKey: projectKeys.one(id),
    queryFn: () => readProject(id),
    /*
     * A project that is not there will not be there on the third attempt
     * either. The default three retries with backoff meant a deleted project
     * kept its stale page on screen for the better part of ten seconds before
     * the editor admitted it was gone — so anything the server answered
     * deliberately is taken at its word, and only a real server failure is
     * retried.
     */
    retry: (attempt, error) =>
      !(error instanceof ApiRequestError && error.status < 500) && attempt < 2,
  })

/**
 * Media is invalidated too, and that is not over-caution: publishing is what
 * makes a file reachable by a visitor, so the library's "Live" marks and its
 * delete buttons change the moment a project's state does.
 */
const useRefresh = () => {
  const client = useQueryClient()

  return async () => {
    await client.invalidateQueries({ queryKey: projectKeys.all })
    await client.invalidateQueries({ queryKey: ['backend2', 'media'] })
  }
}

/**
 * Writes that return the whole project put it straight into the cache.
 *
 * The editor reads `draftRevision` from there, and the next save sends it
 * back. Waiting for a refetch would leave a window in which the value on
 * screen is one behind the server's — and a save with a stale revision is
 * refused, so that window would show up as a mysterious 409.
 */
const useProjectMutation = <TInput>(
  run: (input: TInput) => Promise<OwnerProject>,
) => {
  const client = useQueryClient()
  const refresh = useRefresh()

  return useMutation({
    mutationFn: run,
    onSuccess: async (project) => {
      client.setQueryData(projectKeys.one(project.id), project)
      await refresh()
    },
  })
}

export const useCreateProject = () =>
  useProjectMutation((input: Parameters<typeof createProject>[0]) => createProject(input))

export const useSaveDraft = () =>
  useProjectMutation((input: { id: string } & Parameters<typeof saveDraft>[1]) => {
    const { id, ...draft } = input

    return saveDraft(id, draft)
  })

export const usePublish = () =>
  useProjectMutation((input: { id: string; draftRevision: number }) =>
    publishProject(input.id, input.draftRevision),
  )

export const useUnpublish = () => useProjectMutation((id: string) => unpublishProject(id))

export const useDiscardPending = () =>
  useProjectMutation((input: { id: string; draftRevision: number }) =>
    discardPending(input.id, input.draftRevision),
  )

export const useArchive = () => useProjectMutation((id: string) => archiveProject(id))

export const useRestore = () => useProjectMutation((id: string) => restoreProject(id))

export const useMoveProject = () => {
  const refresh = useRefresh()

  return useMutation({
    mutationFn: (input: { id: string; position: number }) =>
      moveProject(input.id, input.position),
    onSuccess: refresh,
  })
}

export const useDeleteProject = () => {
  const refresh = useRefresh()

  return useMutation({
    mutationFn: (input: { id: string; confirm: string }) =>
      deleteProject(input.id, input.confirm),
    /*
     * Deliberately not awaited, unlike every other mutation here.
     *
     * `invalidateQueries` waits for the refetches it triggers, and one of
     * those is the editor asking for the project that was just deleted. The
     * caller is waiting on this to navigate away, so awaiting it meant the
     * screen sat on a project that no longer existed until the refetch gave
     * up. The list behind it still refreshes; it just does not hold the door.
     */
    onSuccess: () => {
      void refresh()
    },
  })
}
