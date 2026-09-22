import { ApiRequestError } from '#/frontend/api/response'
import type {
  Language,
  OwnerListItem,
  OwnerProject,
  ProjectDraftInput,
  ProjectType,
  PublicProjectDetail,
  WorkStatus,
} from '#/backend2/contracts/project.contract'
import type { Page } from '#/backend2/contracts/pagination.contract'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of Backend2 Projects.
 *
 * Plain `fetch`, like `media/api.ts` and `auth-v2/api.ts`: the Eden client is
 * typed against the legacy Elysia app, and V2 shares no code with it. The
 * envelope is the same, so one `ApiRequestError` carries a refusal to whatever
 * screen has to show it — with `code` and `details` intact, which is how the
 * editor tells a stale revision (`CONFLICT`) from a failed publication
 * (`VALIDATION_ERROR`, whose `details.missing` is the checklist).
 */

const OWNER = '/api/v2/owner/projects'

type Envelope = {
  success: boolean
  message?: string
  code?: string
  data?: unknown
  details?: unknown
}

const request = async <TData>(path: string, init: RequestInit = {}): Promise<TData> => {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (init.body !== undefined) headers.set('content-type', 'application/json')

  if (method !== 'GET' && method !== 'HEAD') {
    const token = csrfToken()

    if (token) headers.set('x-v2-csrf', token)
  }

  const response = await fetch(path, { credentials: 'same-origin', ...init, headers })
  const body = (await response.json().catch(() => null)) as Envelope | null

  if (!response.ok || !body?.success) {
    throw new ApiRequestError({
      message: body?.message ?? 'The server did not answer',
      code: body?.code ?? null,
      status: response.status,
      details: body?.details,
    })
  }

  return body.data as TData
}

/* -------------------------------------------------------------------- list */

export type ProjectsQuery = {
  page?: number
  pageSize?: number
  search?: string
  type?: 'all' | ProjectType
  workStatus?: 'all' | WorkStatus
  state?: string
  language?: Language
}

const toSearch = (query: ProjectsQuery): string => {
  const search = new URLSearchParams()

  if (query.page && query.page > 1) search.set('page', String(query.page))
  if (query.pageSize) search.set('pageSize', String(query.pageSize))
  if (query.search) search.set('search', query.search)
  if (query.type && query.type !== 'all') search.set('type', query.type)
  if (query.workStatus && query.workStatus !== 'all') search.set('workStatus', query.workStatus)
  if (query.state && query.state !== 'all') search.set('state', query.state)
  if (query.language) search.set('language', query.language)

  const text = search.toString()

  return text === '' ? '' : `?${text}`
}

export const listProjects = (query: ProjectsQuery) =>
  request<Page<OwnerListItem>>(`${OWNER}${toSearch(query)}`)

export const readProject = (id: string) => request<OwnerProject>(`${OWNER}/${id}`)

/* ------------------------------------------------------------------ writes */

export const createProject = (input: {
  type: ProjectType
  workStatus?: WorkStatus
  name?: string
}) => request<OwnerProject>(OWNER, { method: 'POST', body: JSON.stringify(input) })

/**
 * One save replaces the whole draft.
 *
 * `draftRevision` travels with it and a stale one is refused rather than
 * merged: the alternative is a second tab quietly writing over work done in
 * the first. The published version is not touched by this call at all.
 */
export const saveDraft = (id: string, draft: ProjectDraftInput & { draftRevision: number }) =>
  request<OwnerProject>(`${OWNER}/${id}`, { method: 'PUT', body: JSON.stringify(draft) })

export const publishProject = (id: string, draftRevision: number) =>
  request<OwnerProject>(`${OWNER}/${id}/publish`, {
    method: 'POST',
    body: JSON.stringify({ draftRevision }),
  })

export const unpublishProject = (id: string) =>
  request<OwnerProject>(`${OWNER}/${id}/unpublish`, { method: 'POST' })

export const discardPending = (id: string, draftRevision: number) =>
  request<OwnerProject>(`${OWNER}/${id}/discard-pending`, {
    method: 'POST',
    body: JSON.stringify({ draftRevision }),
  })

/**
 * An absolute position, never a direction.
 *
 * "Move up" and "move down" are this same call with `n ± 1`, which is what
 * lets a move from page 2 to position 1 work without the browser ever holding
 * the whole list. The server clamps and renumbers.
 */
export const moveProject = (id: string, position: number) =>
  request<{ id: string; position: number; order: string[] }>(`${OWNER}/${id}/position`, {
    method: 'POST',
    body: JSON.stringify({ position }),
  })

export const archiveProject = (id: string) =>
  request<OwnerProject>(`${OWNER}/${id}/archive`, { method: 'POST' })

export const restoreProject = (id: string) =>
  request<OwnerProject>(`${OWNER}/${id}/restore`, { method: 'POST' })

/** Permanent. `confirm` has to be the project's own id, which the UI types in. */
export const deleteProject = (id: string, confirm: string) =>
  request<{ deleted: true; releasedFiles: number }>(`${OWNER}/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm }),
  })

export const checkSlug = (slug: string, projectId: string) =>
  request<{ available: boolean; reason?: string }>(
    `${OWNER}/slug-available?slug=${encodeURIComponent(slug)}&projectId=${projectId}`,
  )

/**
 * The saved draft, in exactly the shape a visitor will receive once it is
 * published — built on the server by the same projection the public route
 * uses, so the preview cannot drift from the real thing. Only the one language
 * asked for is sent, as on the public route.
 */
export const previewProject = (id: string, language: Language) =>
  request<PublicProjectDetail>(`${OWNER}/${id}/preview?language=${language}`)
