import { ApiRequestError } from '#/frontend/api/response'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  Language,
  OwnerService,
  OwnerServiceListItem,
  PublicServiceDetail,
  ServiceDraftPatch,
} from '#/backend2/contracts/service.contract'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of Backend2 Services.
 *
 * Plain `fetch`, like the Projects and Media clients: V2 shares no code with
 * the legacy Eden client. A refusal arrives as one `ApiRequestError` with its
 * `code` and `details` intact, which is how the editor tells a stale revision
 * (`CONFLICT`) from a failed publication (`VALIDATION_ERROR`, whose
 * `details.missing` is the checklist).
 */

const OWNER = '/api/v2/owner/services'

type Envelope = { success: boolean; message?: string; code?: string; data?: unknown; details?: unknown }

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

export type ServicesQuery = {
  page?: number
  pageSize?: number
  search?: string
  state?: string
  featured?: 'all' | 'featured' | 'not_featured'
  language?: Language
}

const toSearch = (query: ServicesQuery): string => {
  const search = new URLSearchParams()

  if (query.page && query.page > 1) search.set('page', String(query.page))
  if (query.pageSize) search.set('pageSize', String(query.pageSize))
  if (query.search) search.set('search', query.search)
  if (query.state && query.state !== 'all') search.set('state', query.state)
  if (query.featured && query.featured !== 'all') search.set('featured', query.featured)
  if (query.language) search.set('language', query.language)

  const text = search.toString()

  return text === '' ? '' : `?${text}`
}

export const listServices = (query: ServicesQuery) =>
  request<Page<OwnerServiceListItem>>(`${OWNER}${toSearch(query)}`)

export const readService = (id: string) => request<OwnerService>(`${OWNER}/${id}`)

export const createService = (input: { name?: string; language?: Language }) =>
  request<OwnerService>(OWNER, { method: 'POST', body: JSON.stringify(input) })

/**
 * Pending edits. Only the fields sent change, so the list can star a service
 * with `{ draftRevision, featured }` alone. Nothing visitors see changes.
 */
export const patchService = (id: string, patch: ServiceDraftPatch & { draftRevision: number }) =>
  request<OwnerService>(`${OWNER}/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const publishService = (id: string, draftRevision: number) =>
  request<OwnerService>(`${OWNER}/${id}/publish`, { method: 'POST', body: JSON.stringify({ draftRevision }) })

export const unpublishService = (id: string) =>
  request<OwnerService>(`${OWNER}/${id}/unpublish`, { method: 'POST' })

export const discardPending = (id: string, draftRevision: number) =>
  request<OwnerService>(`${OWNER}/${id}/discard-pending`, {
    method: 'POST',
    body: JSON.stringify({ draftRevision }),
  })

/** An absolute position in the one order; the server clamps and renumbers. */
export const moveService = (id: string, position: number) =>
  request<{ id: string; position: number; total: number }>(`${OWNER}/${id}/position`, {
    method: 'POST',
    body: JSON.stringify({ position }),
  })

/** Permanent. The server wants the service's own id back as confirmation. */
export const deleteService = (id: string) =>
  request<{ deleted: true }>(`${OWNER}/${id}`, { method: 'DELETE', body: JSON.stringify({ confirm: id }) })

export const checkSlug = (slug: string, serviceId: string) =>
  request<{ available: boolean; reason?: string }>(
    `${OWNER}/slug-available?slug=${encodeURIComponent(slug)}&serviceId=${serviceId}`,
  )

/** The saved draft through the same projection the public route uses. */
export const previewService = (id: string, language: Language) =>
  request<PublicServiceDetail>(`${OWNER}/${id}/preview?language=${language}`)
