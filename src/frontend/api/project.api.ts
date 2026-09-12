import type {
  AdminProjectDetail,
  AdminProjectList,
} from '#/shared/types/project.types'
import type { ProjectFilterInput, ProjectWriteInput } from '#/shared/validation/project.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * `ApiRequestError` is re-exported so the modules that already import it from
 * here keep working; it now lives beside the envelope unwrapping it belongs to.
 */
export { ApiRequestError } from './response'

/** Query-string values are strings; the server coerces and clamps them. */
const toQuery = (filter: ProjectFilterInput) => ({
  search: filter.search,
  status: filter.status,
  published: filter.published,
  tech: filter.tech,
  page: String(filter.page),
})

export async function fetchAdminProjects(filter: ProjectFilterInput): Promise<AdminProjectList> {
  return unwrap(await api().admin.projects.get({ query: toQuery(filter) }))
}

export async function fetchAdminProject(id: string): Promise<AdminProjectDetail> {
  return unwrap(await api().admin.projects({ id }).get())
}

export async function createAdminProject(input: ProjectWriteInput): Promise<AdminProjectDetail> {
  return unwrap(await api().admin.projects.post(input))
}

export async function updateAdminProject(
  id: string,
  input: ProjectWriteInput,
): Promise<AdminProjectDetail> {
  return unwrap(await api().admin.projects({ id }).put(input))
}

export async function deleteAdminProject(id: string): Promise<void> {
  unwrap(await api().admin.projects({ id }).delete())
}

export async function reorderAdminProjects(ids: string[]): Promise<void> {
  unwrap(await api().admin.projects.reorder.post({ ids }))
}
