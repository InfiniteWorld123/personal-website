import { ApiRequestError } from '#/frontend/api/response'
import type {
  MediaAsset,
  MediaFolder,
  MediaFolderNode,
  MediaListQuery,
  MediaReference,
} from '#/backend2/contracts/media.contract'
import type { Page } from '#/backend2/contracts/pagination.contract'
import { csrfToken } from '#/frontend/features/auth-v2/api'

/**
 * The Dashboard's side of the shared Media vault.
 *
 * Plain `fetch`, like every V2 client. One `ApiRequestError` carries a refusal
 * to whichever screen has to show it — including the `code`, which is how the
 * library tells "that file type is not accepted" from "something still uses
 * this file".
 */

const OWNER = '/api/v2/owner/media'

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

/* ------------------------------------------------------------------ files */

export type LibraryQuery = MediaListQuery & { page?: number; pageSize?: number }

const toSearch = (query: LibraryQuery): string => {
  const search = new URLSearchParams()

  if (query.page && query.page > 1) search.set('page', String(query.page))
  if (query.pageSize) search.set('pageSize', String(query.pageSize))
  if (query.folderId) search.set('folderId', query.folderId)
  if (query.kind) search.set('kind', query.kind)
  if (query.usage) search.set('usage', query.usage)
  if (query.q) search.set('q', query.q)
  if (query.sort && query.sort !== 'newest') search.set('sort', query.sort)

  const text = search.toString()

  return text === '' ? '' : `?${text}`
}

export const listFiles = (query: LibraryQuery) =>
  request<Page<MediaAsset>>(`${OWNER}/files${toSearch(query)}`)

export const readFile = (id: string) => request<MediaAsset>(`${OWNER}/files/${id}`)

export const updateFile = (id: string, patch: { displayName?: string; folderId?: string | null }) =>
  request<MediaAsset>(`${OWNER}/files/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const deleteFile = (id: string) =>
  request<{ storageRemoved: boolean }>(`${OWNER}/files/${id}`, { method: 'DELETE' })

export const listReferences = (id: string, page = 1) =>
  request<Page<MediaReference>>(`${OWNER}/files/${id}/references?page=${page}`)

/** Where the bytes are. Private, and never cached — the browser is told so. */
export const fileContentUrl = (id: string): string => `${OWNER}/files/${id}/content`

/* ---------------------------------------------------------------- folders */

export type FolderTree = {
  tree: MediaFolderNode[]
  total: number
  truncated: boolean
  /** The whole library and its root, counted by the server rather than by the
   *  page on screen — which is filtered, and would report the wrong thing. */
  files: { total: number; atRoot: number }
}

export const listFolders = () => request<FolderTree>(`${OWNER}/folders`)

export const createFolder = (input: { name: string; parentId: string | null }) =>
  request<MediaFolder>(`${OWNER}/folders`, { method: 'POST', body: JSON.stringify(input) })

export const updateFolder = (id: string, patch: { name?: string; parentId?: string | null }) =>
  request<MediaFolder>(`${OWNER}/folders/${id}`, { method: 'PATCH', body: JSON.stringify(patch) })

export const deleteFolder = (id: string) =>
  request<{ deleted: true }>(`${OWNER}/folders/${id}`, { method: 'DELETE' })

/* --------------------------------------------------------------- uploading */

export type UploadResult = { asset: MediaAsset; duplicateOf: string[] }

/**
 * One file, sent as the raw body.
 *
 * `XMLHttpRequest` rather than `fetch`, and not for nostalgia: `fetch` cannot
 * report upload progress, and a 100 MB video with no progress bar is a
 * dashboard that looks frozen. Sending the `File` directly also lets the
 * server stream it — a multipart envelope would have to be buffered whole, and
 * a Worker has 128 MB of memory.
 *
 * The returned object carries `abort`, because an upload the owner changed
 * their mind about should stop sending rather than finish invisibly.
 */
export const uploadFile = (input: {
  file: File
  folderId: string | null
  onProgress?: (percent: number) => void
}): { promise: Promise<UploadResult>; abort: () => void } => {
  const xhr = new XMLHttpRequest()

  const promise = new Promise<UploadResult>((resolve, reject) => {
    xhr.open('POST', `${OWNER}/files`, true)
    xhr.withCredentials = true

    // The filename travels in a header, percent-encoded: it is private
    // metadata — it can name a client — and a query string reaches access logs
    // and `Referer`.
    xhr.setRequestHeader('x-media-filename', encodeURIComponent(input.file.name))
    xhr.setRequestHeader('x-media-folder', input.folderId ?? 'root')
    xhr.setRequestHeader('content-type', input.file.type || 'application/octet-stream')

    const token = csrfToken()

    if (token) xhr.setRequestHeader('x-v2-csrf', token)

    xhr.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return

      input.onProgress?.(Math.round((event.loaded / event.total) * 100))
    })

    xhr.addEventListener('load', () => {
      const body = (() => {
        try {
          return JSON.parse(xhr.responseText) as Envelope
        } catch {
          return null
        }
      })()

      if (xhr.status >= 200 && xhr.status < 300 && body?.success) {
        resolve(body.data as UploadResult)

        return
      }

      reject(
        new ApiRequestError({
          message: body?.message ?? 'That upload did not finish',
          code: body?.code ?? null,
          status: xhr.status,
          details: body?.details,
        }),
      )
    })

    xhr.addEventListener('error', () =>
      reject(
        new ApiRequestError({
          message: 'The connection dropped. Nothing was added to the library.',
          code: 'UPLOAD_FAILED',
          status: 0,
        }),
      ),
    )

    xhr.addEventListener('abort', () =>
      reject(
        new ApiRequestError({ message: 'Upload cancelled', code: 'ABORTED', status: 0 }),
      ),
    )

    xhr.send(input.file)
  })

  return { promise, abort: () => xhr.abort() }
}
