import { ApiRequestError } from '#/frontend/api/response'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  ClientCandidate,
  ClientFields,
  ClientPatch,
  ClientStatus,
  OwnerClient,
  OwnerClientListItem,
} from '#/backend2/contracts/client.contract'
import type { NichePatch, OwnerNiche } from '#/backend2/contracts/niche.contract'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of Backend2 Clients and the shared niche list.
 *
 * Plain `fetch`, like the other V2 clients. A refusal arrives as one
 * `ApiRequestError` with its `code` and `details` intact, which is how the
 * form tells a likely duplicate (`CLIENT_DUPLICATE`, with the candidates)
 * from a stale edit (`CONFLICT`) or a field the server refused.
 */

const CLIENTS = '/api/v2/owner/clients'
const NICHES = '/api/v2/owner/niches'

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

const query = (values: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') continue

    search.set(key, String(value))
  }

  const text = search.toString()

  return text === '' ? '' : `?${text}`
}

/* ------------------------------------------------------------------ clients */

export type ClientsQuery = {
  page?: number
  pageSize?: number
  search?: string
  kind?: 'all' | 'person' | 'company'
  status?: 'all' | 'active' | 'inactive'
  niche?: string
  view?: 'directory' | 'trash'
}

export const listClients = (input: ClientsQuery) =>
  request<Page<OwnerClientListItem>>(
    `${CLIENTS}${query({
      page: input.page && input.page > 1 ? input.page : undefined,
      pageSize: input.pageSize,
      search: input.search,
      kind: input.kind === 'all' ? undefined : input.kind,
      status: input.status === 'active' ? undefined : input.status,
      niche: input.niche,
      view: input.view === 'trash' ? 'trash' : undefined,
    })}`,
  )

export const readClient = (id: string) => request<OwnerClient>(`${CLIENTS}/${id}`)

export const createClient = (input: ClientFields & { allowDuplicate?: boolean }) =>
  request<OwnerClient>(CLIENTS, { method: 'POST', body: JSON.stringify(input) })

export const patchClient = (id: string, patch: ClientPatch & { revision: number }) =>
  request<OwnerClient>(`${CLIENTS}/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const setClientStatus = (id: string, status: ClientStatus) =>
  request<OwnerClient>(`${CLIENTS}/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) })

export const trashClient = (id: string) => request<OwnerClient>(`${CLIENTS}/${id}/trash`, { method: 'POST' })

export const restoreClient = (id: string) => request<OwnerClient>(`${CLIENTS}/${id}/restore`, { method: 'POST' })

/** Permanent. The server wants the client's own id back as confirmation. */
export const deleteClient = (id: string) =>
  request<{ id: string; deleted: true }>(`${CLIENTS}/${id}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: id }),
  })

export const findDuplicates = (input: { email?: string; phone?: string; excludeId?: string }) =>
  request<{ candidates: ClientCandidate[] }>(`${CLIENTS}/duplicates${query(input)}`)

/* ------------------------------------------------------------------- niches */

export type NichesQuery = { page?: number; pageSize?: number; search?: string; hidden?: 'include' | 'exclude' }

export const listNiches = (input: NichesQuery) =>
  request<Page<OwnerNiche>>(
    `${NICHES}${query({
      page: input.page && input.page > 1 ? input.page : undefined,
      pageSize: input.pageSize,
      search: input.search,
      hidden: input.hidden === 'exclude' ? 'exclude' : undefined,
    })}`,
  )

export const createNiche = (name: string) =>
  request<OwnerNiche>(NICHES, { method: 'POST', body: JSON.stringify({ name }) })

export const patchNiche = (id: string, patch: NichePatch) =>
  request<OwnerNiche>(`${NICHES}/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const deleteNiche = (id: string) =>
  request<{ id: string; deleted: true }>(`${NICHES}/${id}`, { method: 'DELETE' })
