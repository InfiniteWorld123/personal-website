import { ApiRequestError } from '#/frontend/api/response'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  FollowUpListItem,
  ImportCommitInput,
  ImportPreview,
  ImportPreviewInput,
  ImportResult,
  LeadCandidate,
  LeadChoice,
  LeadFields,
  LeadPatch,
  LeadStage,
  OwnerLead,
  OwnerLeadListItem,
  StageChange,
} from '#/backend2/contracts/lead.contract'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of Backend2 Leads (`docs/v2/leads.md`).
 *
 * Plain `fetch`, like the other V2 clients. A refusal arrives as one
 * `ApiRequestError` with its `code` and `details` intact: `LEAD_DUPLICATE`
 * (with candidates), `CLIENT_DUPLICATE` at Won (with the Clients that have the
 * email), `CONFLICT` for a stale edit, `VALIDATION_ERROR` with field issues.
 */

const LEADS = '/api/v2/owner/leads'

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

const json = (method: string, body?: unknown): RequestInit =>
  body === undefined ? { method } : { method, body: JSON.stringify(body) }

/* -------------------------------------------------------------------- leads */

export type LeadView = 'active' | 'won' | 'lost' | 'all' | 'trash'

export type LeadsQuery = {
  page?: number
  pageSize?: number
  search?: string
  view?: LeadView
  stage?: string
  source?: string
  niche?: string
  country?: string
}

export const listLeads = (input: LeadsQuery) =>
  request<Page<OwnerLeadListItem>>(
    `${LEADS}${query({
      page: input.page && input.page > 1 ? input.page : undefined,
      pageSize: input.pageSize,
      search: input.search,
      view: input.view && input.view !== 'active' ? input.view : undefined,
      stage: input.stage,
      source: input.source,
      niche: input.niche,
      country: input.country,
    })}`,
  )

export const readLead = (id: string) => request<OwnerLead>(`${LEADS}/${id}`)

export const createLead = (input: LeadFields & { allowDuplicate?: boolean }) =>
  request<OwnerLead>(LEADS, json('POST', input))

export const patchLead = (id: string, patch: LeadPatch & { revision: number; allowDuplicate?: boolean }) =>
  request<OwnerLead>(`${LEADS}/${id}`, json('PATCH', patch))

/** Every move, from the List, the Board or the file — one rule set on the server. */
export const changeStage = (id: string, change: StageChange) =>
  request<OwnerLead>(`${LEADS}/${id}/stage`, json('POST', change))

export const trashLead = (id: string) => request<OwnerLead>(`${LEADS}/${id}/trash`, json('POST'))

export const restoreLead = (id: string) => request<OwnerLead>(`${LEADS}/${id}/restore`, json('POST'))

/** Permanent. The server wants the lead's own id back as confirmation. */
export const deleteLead = (id: string) =>
  request<{ id: string; deleted: true }>(`${LEADS}/${id}`, json('DELETE', { confirm: id }))

export const findLeadDuplicates = (input: { email?: string; phone?: string; excludeId?: string }) =>
  request<{ candidates: LeadCandidate[] }>(`${LEADS}/duplicates${query(input)}`)

/* ---------------------------------------------------------------- follow-up */

export const createFollowUp = (id: string, input: { date: string; time: string; note?: string }) =>
  request<OwnerLead>(`${LEADS}/${id}/follow-up`, json('POST', input))

/** Postpone or reword the open one. */
export const patchFollowUp = (id: string, input: { date?: string; time?: string; note?: string }) =>
  request<OwnerLead>(`${LEADS}/${id}/follow-up`, json('PATCH', input))

export const completeFollowUp = (id: string) => request<OwnerLead>(`${LEADS}/${id}/follow-up/complete`, json('POST'))

export const cancelFollowUp = (id: string) => request<OwnerLead>(`${LEADS}/${id}/follow-up/cancel`, json('POST'))

export const listFollowUps = (input: { page?: number; pageSize?: number; when?: 'due' | 'upcoming' | 'all' }) =>
  request<Page<FollowUpListItem>>(
    `${LEADS}/follow-ups${query({
      page: input.page && input.page > 1 ? input.page : undefined,
      pageSize: input.pageSize,
      when: input.when && input.when !== 'all' ? input.when : undefined,
    })}`,
  )

export const dueFollowUpCount = () => request<{ due: number }>(`${LEADS}/follow-ups/due-count`)

/* ------------------------------------------------------------------ choices */

export const listStages = () => request<LeadStage[]>(`${LEADS}/stages`)

export const createStage = (name: string) => request<LeadStage[]>(`${LEADS}/stages`, json('POST', { name }))

/** Rename a custom stage, or move an active one to a 1-based place among the active stages. */
export const patchStage = (id: string, patch: { name?: string; position?: number }) =>
  request<LeadStage[]>(`${LEADS}/stages/${id}`, json('PATCH', patch))

export const deleteStage = (id: string) => request<LeadStage[]>(`${LEADS}/stages/${id}`, json('DELETE'))

export type ChoiceKind = 'sources' | 'loss-reasons'

export type ChoicesQuery = { page?: number; pageSize?: number; search?: string; hidden?: 'include' | 'exclude' }

export const listChoices = (kind: ChoiceKind, input: ChoicesQuery) =>
  request<Page<LeadChoice>>(
    `${LEADS}/${kind}${query({
      page: input.page && input.page > 1 ? input.page : undefined,
      pageSize: input.pageSize,
      search: input.search,
      hidden: input.hidden === 'exclude' ? 'exclude' : undefined,
    })}`,
  )

export const createChoice = (kind: ChoiceKind, name: string) =>
  request<LeadChoice>(`${LEADS}/${kind}`, json('POST', { name }))

export const patchChoice = (kind: ChoiceKind, id: string, patch: { name?: string; hidden?: boolean }) =>
  request<LeadChoice>(`${LEADS}/${kind}/${id}`, json('PATCH', patch))

export const deleteChoice = (kind: ChoiceKind, id: string) =>
  request<{ id: string; deleted: true }>(`${LEADS}/${kind}/${id}`, json('DELETE'))

/* ------------------------------------------------------------------- import */

export const previewImport = (input: ImportPreviewInput) =>
  request<ImportPreview>(`${LEADS}/imports/preview`, json('POST', input))

export const commitImport = (input: ImportCommitInput) => request<ImportResult>(`${LEADS}/imports`, json('POST', input))

export const listImports = (input: { page?: number; pageSize?: number }) =>
  request<Page<ImportResult>>(`${LEADS}/imports${query({ page: input.page, pageSize: input.pageSize })}`)

export type ImportDetail = ImportResult & {
  rejections: Page<{ row: number; reason: string; cells: string[] }>
}

export const readImport = (id: string, input: { page?: number; pageSize?: number } = {}) =>
  request<ImportDetail>(`${LEADS}/imports/${id}${query({ page: input.page, pageSize: input.pageSize })}`)

/** Where the browser downloads the rejected rows as a CSV file. A plain link: the cookie rides along. */
export const rejectionReportUrl = (id: string) => `${LEADS}/imports/${id}/rejections.csv`

export const deleteImport = (id: string) =>
  request<{ id: string; deleted: true }>(`${LEADS}/imports/${id}`, json('DELETE'))
