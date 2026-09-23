import type { Page } from '#/backend2/contracts/pagination.contract'
import type {
  CollectionMode,
  Currency,
  DocumentLanguage,
  FxProposal,
  InvoiceMode,
  InvoiceNotice,
  InvoicePayment,
  InvoiceSettings,
  InvoiceSummary,
  OwnerInvoice,
  OwnerInvoiceListItem,
  OwnerSubscription,
  RequestableLanguage,
  SubscriptionPeriod,
} from '#/backend2/contracts/invoice.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of Backend2 Invoices (`docs/v2/invoices.md`).
 *
 * Plain `fetch`, like the other V2 clients. A refusal arrives as one
 * `ApiRequestError` with its `code` and `details`, which is how a screen tells
 * a draft that is not ready (`INVOICE_NOT_READY`, with the problems) from a
 * stale edit (`CONFLICT`) or a field the server refused.
 *
 * PDFs and the yearly archive come back as bytes, not JSON. The server marks
 * them as downloads, so they are read into a `Blob` here and shown or saved
 * from the browser's memory — never opened as a page on this origin.
 */

const BASE = '/api/v2/owner/invoices'

type Envelope = { success: boolean; message?: string; code?: string; data?: unknown; details?: unknown }

const headersFor = (init: RequestInit): Headers => {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (init.body !== undefined) headers.set('content-type', 'application/json')

  if (method !== 'GET' && method !== 'HEAD') {
    const token = csrfToken()

    if (token) headers.set('x-v2-csrf', token)
  }

  return headers
}

const refusal = (response: Response, body: Envelope | null) =>
  new ApiRequestError({
    message: body?.message ?? 'The server did not answer',
    code: body?.code ?? null,
    status: response.status,
    details: body?.details,
  })

const request = async <TData>(path: string, init: RequestInit = {}): Promise<TData> => {
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers: headersFor(init) })
  const body = (await response.json().catch(() => null)) as Envelope | null

  if (!response.ok || !body?.success) throw refusal(response, body)

  return body.data as TData
}

/** A document or archive, as bytes. A refusal still arrives as JSON. */
const download = async (path: string): Promise<{ blob: Blob; fileName: string }> => {
  const response = await fetch(path, { credentials: 'same-origin', headers: headersFor({}) })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Envelope | null

    throw refusal(response, body)
  }

  const disposition = response.headers.get('content-disposition') ?? ''
  const star = /filename\*=UTF-8''([^;]+)/iu.exec(disposition)?.[1]
  const plain = /filename="?([^";]+)"?/iu.exec(disposition)?.[1]
  const fileName = star ? decodeURIComponent(star) : (plain ?? 'download')

  return { blob: await response.blob(), fileName }
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

const query = (values: Record<string, string | number | null | undefined>): string => {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue

    search.set(key, String(value))
  }

  const text = search.toString()

  return text === '' ? '' : `?${text}`
}

/* ---------------------------------------------------------------- invoices */

export type InvoiceListStatus = 'all' | 'draft' | 'open' | 'overdue' | 'paid' | 'cancelled'

export type InvoicesQuery = {
  mode: InvoiceMode | 'all'
  clientId?: string
  status?: InvoiceListStatus
  search?: string
  page?: number
  pageSize?: number
  kind?: 'all' | 'invoice' | 'cancellation'
  year?: number
  subscriptionId?: string
}

export const listInvoices = (input: InvoicesQuery) =>
  request<Page<OwnerInvoiceListItem>>(
    `${BASE}${query({
      mode: input.mode,
      status: input.status && input.status !== 'all' ? input.status : undefined,
      search: input.search,
      page: input.page && input.page > 1 ? input.page : undefined,
      pageSize: input.pageSize,
      kind: input.kind && input.kind !== 'all' ? input.kind : undefined,
      year: input.year,
      subscriptionId: input.subscriptionId,
      clientId: input.clientId,
    })}`,
  )

export const readSummary = (mode: InvoiceMode) => request<InvoiceSummary>(`${BASE}/summary${query({ mode })}`)

export const readInvoice = (id: string) => request<OwnerInvoice>(`${BASE}/${id}`)

/** Every field a draft may carry. All optional: a draft can be incomplete. */
export type DraftFields = {
  clientId?: string
  currency?: Currency
  language?: DocumentLanguage
  title?: string
  recipient?: { name: string; company: string; address: string; country: string; email: string; vatId: string }
  serviceDateFrom?: string | null
  serviceDateTo?: string | null
  paymentTermsDays?: number
  discountType?: 'none' | 'percent' | 'fixed'
  discountValue?: number
  reverseCharge?: boolean
  allowBank?: boolean
  allowStripe?: boolean
  notes?: string
  internalNote?: string
  lines?: Array<{
    description: string
    unit: string
    quantityMilli: number
    unitPriceMinor: number
    taxRateBp: number | null
    serviceId: string | null
  }>
  installments?: Array<{ dueDate: string; amountMinor: number; label: string }>
  fx?: { rateId: string } | null
}

export const createInvoice = (input: DraftFields & { mode: InvoiceMode; clientId: string }) =>
  request<OwnerInvoice>(BASE, json('POST', input))

export const patchInvoice = (id: string, patch: DraftFields & { revision: number }) =>
  request<OwnerInvoice>(`${BASE}/${id}`, json('PATCH', patch))

export const deleteDraft = (id: string) => request<{ id: string; deleted: true }>(`${BASE}/${id}`, json('DELETE'))

export const issueInvoice = (id: string, revision: number) =>
  request<OwnerInvoice>(`${BASE}/${id}/issue`, json('POST', { revision }))

export const previewPdf = (id: string, language: DocumentLanguage) =>
  download(`${BASE}/${id}/preview${query({ language })}`)

export const documentPdf = (id: string, language: DocumentLanguage) =>
  download(`${BASE}/${id}/pdf${query({ language })}`)

export const receiptPdf = (id: string, paymentId: string) => download(`${BASE}/${id}/payments/${paymentId}/receipt`)

export type SendResult = {
  invoice: OwnerInvoice
  draft: { id: string; toEmail: string; subject: string }
  sent: boolean
  paymentLinkIncluded: boolean
  paymentLinkError: string | null
}

export const sendInvoice = (id: string, language: RequestableLanguage) =>
  request<SendResult>(`${BASE}/${id}/send`, json('POST', { language }))

export const paymentLink = (id: string) =>
  request<{ url: string; amountMinor: number }>(`${BASE}/${id}/payment-link`, json('POST', {}))

export type PaymentFields = {
  idempotencyKey: string
  method: 'bank' | 'cash' | 'other'
  amountMinor: number
  paidOn: string
  reference: string
  note: string
}

export const recordPayment = (id: string, payment: PaymentFields) =>
  request<{ invoice: OwnerInvoice; payment: InvoicePayment; duplicate: boolean }>(
    `${BASE}/${id}/payments`,
    json('POST', payment),
  )

export const voidPayment = (id: string, paymentId: string, reason: string) =>
  request<OwnerInvoice>(`${BASE}/${id}/payments/${paymentId}/void`, json('POST', { reason }))

export type RefundFields = {
  idempotencyKey: string
  method: 'bank' | 'stripe' | 'cash' | 'other'
  amountMinor: number
  refundedOn: string
  note: string
}

export const recordRefund = (id: string, refund: RefundFields) =>
  request<{ invoice: OwnerInvoice; duplicate: boolean }>(`${BASE}/${id}/refunds`, json('POST', refund))

export type CancelResult = { invoice: OwnerInvoice; cancellation: OwnerInvoice; refundableMinor: number }

export const cancelInvoice = (id: string, reason: string) =>
  request<CancelResult>(`${BASE}/${id}/cancel`, json('POST', { reason }))

export const correctInvoice = (id: string, reason: string) =>
  request<CancelResult & { draft: OwnerInvoice }>(`${BASE}/${id}/correct`, json('POST', { reason }))

/* ---------------------------------------------------------------- settings */

export type SettingsFields = Omit<InvoiceSettings, 'revision' | 'updatedAt' | 'readiness'>

export const readSettings = () => request<InvoiceSettings>(`${BASE}/settings`)

export const saveSettings = (input: SettingsFields & { revision: number }) =>
  request<InvoiceSettings>(`${BASE}/settings`, json('PUT', input))

export const proposeRate = (input: { amountMinor: number; rate?: string }) =>
  request<FxProposal>(`${BASE}/fx/proposal`, json('POST', input))

export const yearArchive = (year: number) => download(`${BASE}/exports/${year}`)

/* ----------------------------------------------------------- subscriptions */

export type SubscriptionsQuery = {
  mode: InvoiceMode
  status?: 'all' | 'active' | 'paused' | 'ended'
  page?: number
  pageSize?: number
}

export const listSubscriptions = (input: SubscriptionsQuery) =>
  request<Page<OwnerSubscription>>(
    `${BASE}/subscriptions${query({
      mode: input.mode,
      status: input.status && input.status !== 'all' ? input.status : undefined,
      page: input.page && input.page > 1 ? input.page : undefined,
      pageSize: input.pageSize,
    })}`,
  )

export const readSubscription = (id: string) => request<OwnerSubscription>(`${BASE}/subscriptions/${id}`)

export type SubscriptionFields = {
  mode: InvoiceMode
  clientId: string
  collection: CollectionMode
  interval: 'monthly' | 'yearly'
  startDate: string
  currency: Currency
  language: DocumentLanguage
  description: string
  amountMinor: number
  serviceId: string | null
  allowBank: boolean
  allowStripe: boolean
  fx: { rateId: string } | null
  freePeriods: number | null
}

export const createSubscription = (input: SubscriptionFields) =>
  request<OwnerSubscription>(`${BASE}/subscriptions`, json('POST', input))

const subscriptionAction = (id: string, action: string, body: unknown = {}) =>
  request<OwnerSubscription>(`${BASE}/subscriptions/${id}/${action}`, json('POST', body))

export const pauseSubscription = (id: string, date: string | null) => subscriptionAction(id, 'pause', { date })
export const resumeSubscription = (id: string, date: string | null) => subscriptionAction(id, 'resume', { date })
export const endSubscription = (id: string, date: string | null) => subscriptionAction(id, 'end', { date })

export const changePrice = (
  id: string,
  input: { amountMinor: number; effectiveFrom: string | null; note: string; fx: { rateId: string } | null },
) => subscriptionAction(id, 'price', input)

export const addDiscount = (
  id: string,
  input: { discountType: 'percent' | 'fixed'; value: number; periods: number | null; startsOn: string | null; note: string },
) => subscriptionAction(id, 'discounts', input)

export const endDiscount = (id: string, discountId: string) => subscriptionAction(id, `discounts/${discountId}/end`)

export const addFreePeriod = (id: string, input: { startsOn: string | null; endsOn: string | null; note: string }) =>
  subscriptionAction(id, 'free-periods', input)

export const cardSetup = (id: string) =>
  request<{ url: string; subscription: OwnerSubscription }>(`${BASE}/subscriptions/${id}/card-setup`, json('POST', {}))

export const listPeriods = (id: string, page: number, pageSize: number) =>
  request<Page<SubscriptionPeriod>>(
    `${BASE}/subscriptions/${id}/periods${query({ page: page > 1 ? page : undefined, pageSize })}`,
  )

export const listNotices = (input: { status: 'pending' | 'prepared' | 'all'; page?: number; pageSize?: number }) =>
  request<Page<InvoiceNotice>>(
    `${BASE}/notices${query({ status: input.status, page: input.page && input.page > 1 ? input.page : undefined, pageSize: input.pageSize })}`,
  )

/* ---------------------------------------------------------------- blobs */

/** Hands a downloaded file to the browser's own "save" behaviour. */
export const saveBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
