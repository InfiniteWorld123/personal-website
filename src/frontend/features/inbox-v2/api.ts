import type {
  ConversationDetail,
  ConversationSummary,
  InboxCounts,
  InboxDraft,
  InboxLanguage,
  InboxMessage,
  InboxSettings,
  InboxSnippet,
  InboxView,
} from '#/backend2/contracts/inbox.contract'
import type { MediaAsset } from '#/backend2/contracts/media.contract'
import type { Page } from '#/backend2/contracts/pagination.contract'
import type { RichTextDoc } from '#/backend2/contracts/rich-text.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of the Backend2 Inbox. Plain `fetch`, like every other
 * V2 client; a refusal arrives as one `ApiRequestError` with its `code` and
 * `details` intact — `STALE_DRAFT` carries the newer draft, `SEND_FAILED` the
 * conversation and message the owner should be taken to.
 */

const OWNER = '/api/v2/owner/inbox'

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

const send = <TData>(method: string, path: string, body?: unknown) =>
  request<TData>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

const toSearch = (values: Record<string, string | number | boolean | undefined>): string => {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '' || value === false) continue

    search.set(key, String(value))
  }

  const text = search.toString()

  return text === '' ? '' : `?${text}`
}

/* ----------------------------------------------------------- conversations */

export type ConversationsQuery = {
  view: InboxView
  unread?: boolean
  starred?: boolean
  q?: string
  page: number
  pageSize?: number
}

export const listConversations = (query: ConversationsQuery) =>
  request<Page<ConversationSummary>>(`${OWNER}/conversations${toSearch({ ...query, pageSize: query.pageSize ?? 25 })}`)

export const readCounts = () => request<InboxCounts>(`${OWNER}/counts`)

export const readConversation = (id: string, page: number) =>
  request<ConversationDetail>(`${OWNER}/conversations/${id}${toSearch({ page, pageSize: 20 })}`)

export const patchConversation = (id: string, patch: { isRead?: boolean; isStarred?: boolean; archived?: boolean }) =>
  send<ConversationSummary>('PATCH', `${OWNER}/conversations/${id}`, patch)

export const trashConversation = (id: string) => send<ConversationSummary>('POST', `${OWNER}/conversations/${id}/trash`)

export const restoreConversation = (id: string) =>
  send<ConversationSummary>('POST', `${OWNER}/conversations/${id}/restore`)

export const deleteConversation = (id: string) =>
  send<{ deleted: true; storageRemoved: boolean }>('DELETE', `${OWNER}/conversations/${id}`, { confirm: id })

export const emptyTrash = () =>
  send<{ deleted: number; storageRemoved: boolean }>('POST', `${OWNER}/trash/empty`, { confirm: 'EMPTY TRASH' })

export const readMessageHtml = (id: string) => request<{ html: string }>(`${OWNER}/messages/${id}/html`)

export const retryMessage = (id: string) => send<InboxMessage>('POST', `${OWNER}/messages/${id}/retry`)

/* ------------------------------------------------------------------ drafts */

export const listDrafts = (page: number) => request<Page<InboxDraft>>(`${OWNER}/drafts${toSearch({ page, pageSize: 25 })}`)

export const createDraft = (input: {
  conversationId?: string | null
  toEmail?: string
  subject?: string
  language?: InboxLanguage
}) => send<InboxDraft>('POST', `${OWNER}/drafts`, input)

export const readDraft = (id: string) => request<InboxDraft>(`${OWNER}/drafts/${id}`)

export type DraftPatch = {
  revision: number
  toEmail?: string
  subject?: string
  bodyDoc?: RichTextDoc
  language?: InboxLanguage
  attachmentAssetIds?: string[]
}

export const saveDraft = (id: string, patch: DraftPatch) => send<InboxDraft>('PATCH', `${OWNER}/drafts/${id}`, patch)

export const discardDraft = (id: string) => send<{ discarded: true }>('DELETE', `${OWNER}/drafts/${id}`)

export type SendResult = { conversationId: string; message: InboxMessage; alreadySent: boolean }

export const sendDraft = (id: string, input: { revision: number; confirmBlankSubject: boolean }) =>
  send<SendResult>('POST', `${OWNER}/drafts/${id}/send`, input)

/* ------------------------------------------------------------- attachments */

/** A private download, straight from the owner route; the browser saves it. */
export const attachmentUrl = (id: string): string => `${OWNER}/attachments/${id}`

export const saveAttachmentToMedia = (id: string) =>
  send<{ asset: MediaAsset; alreadySaved: boolean }>('POST', `${OWNER}/attachments/${id}/save-to-media`, {})

/* ---------------------------------------------------------------- settings */

export const readSettings = () => request<InboxSettings>(`${OWNER}/settings`)

export const saveSettings = (signatures: Record<InboxLanguage, string>) =>
  send<InboxSettings>('PUT', `${OWNER}/settings`, { signatures })

export const listSnippets = (page: number, pageSize = 25) =>
  request<Page<InboxSnippet>>(`${OWNER}/snippets${toSearch({ page, pageSize })}`)

export type SnippetInput = { title: string; language: InboxLanguage | null; body: string }

export const createSnippet = (input: SnippetInput) => send<InboxSnippet>('POST', `${OWNER}/snippets`, input)

export const updateSnippet = (id: string, input: SnippetInput) => send<InboxSnippet>('PATCH', `${OWNER}/snippets/${id}`, input)

export const deleteSnippet = (id: string) => send<{ deleted: true }>('DELETE', `${OWNER}/snippets/${id}`)

export { ApiRequestError }
