import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  ContentFieldState,
  ContentHistoryEntry,
  ContentSaveResult,
  ContentSlot,
  ContentSnapshot,
  ContentValue,
} from '#/backend2/contracts/content.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of Backend2 Content (`docs/v2/content.md`).
 *
 * Plain `fetch`, like Services and Blog. A refusal arrives as one
 * `ApiRequestError` with its `code` and `details` intact, which is how a field
 * tells a stale revision (`CONFLICT`, with `details.current`) from a Legal lock
 * (`LEGAL_LOCKED`) or a rule the server enforced (`VALIDATION_ERROR`).
 *
 * There is no Publish call: a `PUT` that succeeds is what visitors read.
 */

const OWNER = '/api/v2/owner/content'

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

/** A list key ends in `[]`, so every key travels percent-encoded. */
const fieldPath = (key: string) => `${OWNER}/fields/${encodeURIComponent(key)}`

export const readContent = () => request<ContentSnapshot>(OWNER)

export const saveContentField = (input: {
  key: string
  language: ContentSlot
  value: ContentValue
  expectedRevision: number
  legalUnlocked: boolean
}) => {
  const { key, ...body } = input

  return request<ContentSaveResult>(fieldPath(key), { method: 'PUT', body: JSON.stringify(body) })
}

export const restoreContentOriginal = (input: {
  key: string
  language: ContentSlot
  expectedRevision: number
  legalUnlocked: boolean
}) => {
  const { key, ...body } = input

  return request<ContentSaveResult>(`${fieldPath(key)}/restore-original`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export const markContentReviewed = (input: { key: string; language: ContentSlot }) =>
  request<ContentFieldState>(`${fieldPath(input.key)}/reviewed`, {
    method: 'POST',
    body: JSON.stringify({ language: input.language }),
  })

export type ContentHistoryQuery = {
  page?: number
  pageSize?: number
  key?: string
  language?: ContentSlot
}

export const listContentHistory = (query: ContentHistoryQuery) => {
  const search = new URLSearchParams()

  if (query.page && query.page > 1) search.set('page', String(query.page))
  if (query.pageSize) search.set('pageSize', String(query.pageSize))
  if (query.key) search.set('key', query.key)
  if (query.language) search.set('language', query.language)

  const text = search.toString()

  return request<Page<ContentHistoryEntry>>(`${OWNER}/history${text ? `?${text}` : ''}`)
}

export const restoreContentHistory = (input: {
  id: string
  side: 'before' | 'after'
  expectedRevision: number
  legalUnlocked: boolean
}) => {
  const { id, ...body } = input

  return request<ContentSaveResult>(`${OWNER}/history/${id}/restore`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}
