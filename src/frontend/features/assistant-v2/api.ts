import { ApiRequestError } from '#/frontend/api/response'
import type {
  AssistantSettings,
  AssistantUsage,
  OwnerConversation,
  OwnerConversationPage,
  RetentionMode,
} from '#/backend2/contracts/assistant.contract'
import { csrfToken } from '#/frontend/features/auth-v2/api'
import type { AssistantFilter } from './assistant-search'

/**
 * The Dashboard's side of the public assistant's owner routes
 * (`docs/v2/ai-assistant.md`): the private conversation list, one
 * conversation, deleting it, the usage counters and the two settings.
 *
 * Plain `fetch`, like the other V2 clients. A refusal arrives as one
 * `ApiRequestError` with its `code` and `details`: `NOT_FOUND` for a
 * conversation that is gone, `VALIDATION_ERROR` with field issues.
 */

const BASE = '/api/v2/owner/assistant'

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

export type ConversationsQuery = {
  page?: number
  pageSize?: number
  search?: string
  show?: AssistantFilter
}

/** The address filter becomes the server's two: `outcome` or `language`. */
export const conversationsPath = (input: ConversationsQuery): string => {
  const search = new URLSearchParams()

  if (input.page && input.page > 1) search.set('page', String(input.page))
  if (input.pageSize) search.set('pageSize', String(input.pageSize))
  if (input.search) search.set('search', input.search)
  if (input.show === 'fallback') search.set('outcome', 'fallback')
  else if (input.show) search.set('language', input.show)

  const text = search.toString()

  return `${BASE}/conversations${text ? `?${text}` : ''}`
}

export const listConversations = (input: ConversationsQuery) => request<OwnerConversationPage>(conversationsPath(input))

export const readConversation = (id: string) => request<OwnerConversation>(`${BASE}/conversations/${id}`)

/** Permanent: the conversation and every message in it. */
export const deleteConversation = (id: string) =>
  request<{ id: string; deleted: true }>(`${BASE}/conversations/${id}`, { method: 'DELETE' })

export const readUsage = (days: number) => request<AssistantUsage>(`${BASE}/usage?days=${days}`)

export const readSettings = () => request<AssistantSettings>(`${BASE}/settings`)

export type SettingsPatchInput = {
  enabled?: boolean
  retentionMode?: RetentionMode
  retentionDays?: number | null
}

export const patchSettings = (patch: SettingsPatchInput) =>
  request<AssistantSettings>(`${BASE}/settings`, { method: 'PATCH', body: JSON.stringify(patch) })
