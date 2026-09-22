import { MEDIA_LIMITS } from '../../contracts/media.contract'
import { badRequest } from '../../http/error'
import { responseOk } from '../../http/response'
import { HttpStatus } from '../../http/status'
import { contentDisposition } from '../../media/naming'
import type { OpenedAsset } from './media.service'

/**
 * The transport details the Media routes share.
 *
 * Kept out of the route files so both of them — the owner's and the visitor's —
 * cannot drift apart on the headers that decide whether a private file can end
 * up in a shared cache.
 */

/** Every owner reply. `no-store` because the whole library is private. */
export const ownerJson = <T>(options: { data: T; message?: string; status?: number }): Response =>
  new Response(JSON.stringify(responseOk({ data: options.data, message: options.message })), {
    status: options.status ?? HttpStatus.OK,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    },
  })

/**
 * The filename the owner sent, out of a header rather than the URL.
 *
 * A filename is private metadata — it can name a client — and a query string
 * reaches access logs and `Referer` headers. Percent-encoded because a header
 * value may not carry arbitrary UTF-8.
 */
export const readFileNameHeader = (request: Request): string => {
  const raw = request.headers.get('x-media-filename')?.trim()

  if (!raw) throw badRequest('Send the file name in the X-Media-Filename header')

  let decoded: string

  try {
    decoded = decodeURIComponent(raw)
  } catch {
    throw badRequest('The file name header is not correctly encoded')
  }

  const name = decoded.trim()

  if (name === '') throw badRequest('Send the file name in the X-Media-Filename header')

  return name.slice(0, MEDIA_LIMITS.filename * 2)
}

export const readFolderHeader = (request: Request): string | null => {
  const raw = request.headers.get('x-media-folder')?.trim()

  if (!raw || raw === 'root') return null

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(raw)) {
    throw badRequest('That is not a folder id')
  }

  return raw
}

export const readDeclaredSize = (request: Request): number | null => {
  const raw = request.headers.get('content-length')

  if (raw === null) return null

  const size = Number(raw)

  return Number.isFinite(size) && size >= 0 ? size : null
}

/**
 * Sends the bytes.
 *
 * `disposition` is `attachment` for everything that is not an image or a
 * video, which now means PDF, Office, OpenDocument, RTF, text and ZIP. A PDF
 * rendered inline is a document the browser runs scripts for, in this origin;
 * downloading it costs one click and removes the question entirely.
 *
 * The `sandbox` in the CSP is what makes SVG safe enough to accept at all. It
 * is served inline, because that is what a logo is for — and a sandbox with no
 * `allow-scripts` runs nothing, including when the URL is opened directly,
 * which is the only context where an SVG could ever execute. `default-src
 * 'none'` also stops it fetching anything of its own. `nosniff` everywhere, so
 * a file whose stored type is somehow wrong cannot be reinterpreted as
 * something executable.
 */
export const fileResponse = (
  opened: OpenedAsset,
  options: { cacheControl: string; etag?: string },
): Response => {
  const inline = opened.asset.kind === 'image' || opened.asset.kind === 'video'

  const headers = new Headers({
    'content-type': opened.contentType,
    'content-length': String(opened.asset.byteSize),
    'cache-control': options.cacheControl,
    'content-disposition': contentDisposition(
      opened.asset.displayName,
      inline ? 'inline' : 'attachment',
    ),
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; sandbox",
    'referrer-policy': 'no-referrer',
  })

  if (options.etag) headers.set('etag', options.etag)

  return new Response(opened.body, { status: HttpStatus.OK, headers })
}

/** A `304` costs nothing and the object is immutable, so the checksum is a true ETag. */
export const notModified = (etag: string, cacheControl: string): Response =>
  new Response(null, {
    status: HttpStatus.NOT_MODIFIED,
    headers: { etag, 'cache-control': cacheControl },
  })

export const matchesEtag = (request: Request, etag: string): boolean => {
  const header = request.headers.get('if-none-match')

  if (!header) return false

  return header
    .split(',')
    .map((value) => value.trim().replace(/^W\//u, ''))
    .includes(etag)
}
