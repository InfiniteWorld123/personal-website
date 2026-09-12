import type {
  AdminProjectDetail,
  AdminProjectList,
} from '#/shared/types/project.types'
import type { ProjectFilterInput, ProjectWriteInput } from '#/shared/validation/project.validation'
import { api } from './client'

/**
 * A failed API call, carrying what the central error flow returned. `details`
 * holds the field issues, so a form can point at the input that is wrong.
 */
export class ApiRequestError extends Error {
  readonly code: string | null
  readonly status: number
  readonly details: unknown

  constructor({
    message,
    code,
    status,
    details,
  }: {
    message: string
    code?: string | null
    status: number
    details?: unknown
  }) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code ?? null
    this.status = status
    this.details = details
  }
}

type ErrorBody = { message?: string; code?: string; details?: unknown }

/**
 * The shape every Eden Treaty call returns. `error.status` is widened to
 * `unknown` on purpose: Treaty types it that way for routes whose error
 * responses are not declared in an Elysia schema, and this application
 * validates with Valibot instead.
 */
type TreatyResponse = {
  data: unknown
  error: { status?: unknown; value?: unknown } | null
  status: number
}

/** Unwraps the shared response envelope, or throws what the server reported. */
const unwrap = <TData>(response: TreatyResponse): TData => {
  if (response.error) {
    const body = (response.error.value ?? {}) as ErrorBody

    throw new ApiRequestError({
      message: body.message ?? 'The request failed',
      code: body.code,
      status: typeof response.error.status === 'number' ? response.error.status : response.status,
      details: body.details,
    })
  }

  return (response.data as { data: TData }).data
}

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
