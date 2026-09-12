import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  createAdminProject,
  deleteAdminProject,
  fetchAdminProject,
  fetchAdminProjects,
  reorderAdminProjects,
  updateAdminProject,
} from '#/frontend/api/project.api'
import type { ProjectFilterInput, ProjectWriteInput } from '#/shared/validation/project.validation'

export const projectKeys = {
  all: ['admin', 'projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (filter: ProjectFilterInput) => [...projectKeys.lists(), filter] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
}

export const adminProjectsQuery = (filter: ProjectFilterInput) =>
  queryOptions({
    queryKey: projectKeys.list(filter),
    queryFn: () => fetchAdminProjects(filter),
  })

export const adminProjectQuery = (id: string) =>
  queryOptions({
    queryKey: projectKeys.detail(id),
    queryFn: () => fetchAdminProject(id),
  })

/**
 * Every write invalidates the lists, because a save can change the title, the
 * status, the order, and whether the row belongs in the current filter at all.
 */
export const useSaveProject = (id: string | null) => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: ProjectWriteInput) =>
      id ? updateAdminProject(id, input) : createAdminProject(input),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(project.id), project)
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
    },
  })
}

export const useDeleteProject = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => deleteAdminProject(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: projectKeys.lists() })
    },
  })
}

export const useReorderProjects = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (ids: string[]) => reorderAdminProjects(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectKeys.lists() }),
  })
}
