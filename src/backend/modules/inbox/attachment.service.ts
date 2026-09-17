import { getDb } from '#/backend/db/client'
import { badRequestError, internalError, notFoundError } from '#/backend/shared/error'
import { resolveObjectStore } from '#/backend/shared/image-storage'
import type { Attachment } from '#/shared/types/inbox.types'
import type { MessageDirection } from '#/shared/validation/inbox.validation'
import { toInt } from './inbox.sql'

/**
 * Ten megabytes. Large enough for a scanned register extract or the price list
 * a client actually sends, small enough that one letter cannot fill the bucket.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

/**
 * What may be stored.
 *
 * An allowlist rather than a blocklist: these bytes come from outside and are
 * handed back with the stored content type, so a stored `text/html` would run
 * as a page on the admin's own origin.
 */
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/heic',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

/** Everything else is handed over as a download rather than rendered in place. */
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])

const extensionOf = (filename: string): string => {
  const parts = filename.split('.')

  return parts.length > 1 ? (parts.pop() ?? 'bin').toLowerCase().slice(0, 12) : 'bin'
}

/**
 * Keeps a stored name from ever being read as a path or a header.
 *
 * The name never reaches the bucket — the key is a random UUID — but it does
 * reach `Content-Disposition`, where a quote or a newline would let it rewrite
 * the rest of the header.
 */
const safeFilename = (filename: string): string =>
  filename.replace(/[\\/\r\n"]/g, '_').slice(0, 200) || 'file'

export const attachmentUrl = (id: string): string => `/api/admin/inbox/attachments/${id}`

/**
 * Everything that can be known about a file before writing anything.
 *
 * Its own step so a new letter can be refused *before* its recipient is
 * created. Composing to an address that is not in the inbox has to create the
 * person first — a file belongs to somebody — and without this check a refused
 * attachment left a person in the inbox he had never written to.
 */
export const checkStorable = async (file: File): Promise<void> => {
  if (!(await resolveObjectStore())) {
    throw badRequestError('Files can only be stored on the live site, not on this dev server.')
  }

  if (file.size === 0) throw badRequestError(`${file.name} is empty`)
  if (file.size > MAX_ATTACHMENT_BYTES) throw badRequestError(`${file.name} is larger than 10 MB`)

  const contentType = file.type || 'application/octet-stream'

  if (!ALLOWED.has(contentType)) {
    throw badRequestError(`Files of type ${contentType} cannot be stored`)
  }
}

/**
 * Stores one file and records it.
 *
 * `messageId` is what ties a file to the letter it travelled with. A reply
 * uploads its files before the letter exists, so it passes nothing here and
 * the route links them afterwards; an arriving letter already has its id and
 * passes it, because nothing will come back later to link it.
 */
export const storeAttachmentBytes = async (input: {
  personId: string
  messageId?: string
  filename: string
  contentType: string
  // `Uint8Array<ArrayBuffer>`, not the looser `ArrayBufferLike`: only the
  // former is what the store accepts, the same narrowing `request-body.ts`
  // documents.
  bytes: Uint8Array<ArrayBuffer>
  direction: MessageDirection
}): Promise<Attachment> => {
  const store = await resolveObjectStore()

  if (!store) {
    /*
     * Only reachable on the Node dev server. In production the bucket arrives
     * as a Worker binding and needs no credentials at all; locally there is no
     * binding, so files can only be stored if R2 keys happen to be set. Said
     * plainly rather than failing quietly.
     */
    throw badRequestError('Files can only be stored on the live site, not on this dev server.')
  }

  const size = input.bytes.byteLength

  if (size === 0) throw badRequestError('That file is empty')
  if (size > MAX_ATTACHMENT_BYTES) throw badRequestError('That file is larger than 10 MB')

  const contentType = input.contentType || 'application/octet-stream'

  if (!ALLOWED.has(contentType)) {
    throw badRequestError(`Files of type ${contentType} cannot be stored`)
  }

  const filename = safeFilename(input.filename)
  const key = `inbox/${input.personId}/${crypto.randomUUID()}.${extensionOf(filename)}`

  await store.put({ key, body: input.bytes, contentType })

  const created = await getDb().query<{ id: string }>(
    `INSERT INTO lead_attachments
       (lead_id, message_id, filename, content_type, bytes, storage_key, direction)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
    [
      input.personId,
      input.messageId ?? null,
      filename,
      contentType,
      size,
      key,
      input.direction,
    ],
  )

  const id = created.rows[0]?.id

  if (!id) throw internalError('The file was stored but not recorded')

  return { id, filename, contentType, bytes: size, direction: input.direction, url: attachmentUrl(id) }
}

export const storeAttachment = async (input: {
  personId: string
  file: File
  direction: MessageDirection
}): Promise<Attachment> =>
  storeAttachmentBytes({
    personId: input.personId,
    filename: input.file.name,
    contentType: input.file.type || 'application/octet-stream',
    bytes: new Uint8Array(await input.file.arrayBuffer()),
    direction: input.direction,
  })

/**
 * Base64 without blowing the stack.
 *
 * `String.fromCharCode(...bytes)` spreads every byte as an argument, and a
 * megabyte-sized file is a megabyte of arguments — "Maximum call stack size
 * exceeded" on exactly the large attachment this exists to carry.
 */
const toBase64 = (bytes: Uint8Array): string => {
  let binary = ''

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }

  return btoa(binary)
}

/**
 * Total bytes one letter may carry, before base64 inflates them by a third.
 *
 * Resend refuses a request over 40 MB outright, and a refusal costs the whole
 * letter rather than one file — so the ceiling is here, where it can be said
 * in a sentence, rather than at the provider.
 */
const MAX_MAIL_ATTACHMENT_BYTES = 20 * 1024 * 1024

/**
 * The files a letter carries, as the mail provider wants them.
 *
 * Read back out of the bucket rather than kept in memory from the upload: the
 * upload and the send are two requests, and between them the only copy of the
 * bytes is the stored one.
 *
 * Throws rather than sending a letter without its attachment. A client who is
 * told "please find the offer attached" and finds nothing has been given a
 * wrong letter, and there is no second chance to notice.
 */
export const attachmentsForMail = async (
  personId: string,
  ids: string[],
): Promise<Array<{ filename: string; content: string; content_type: string }>> => {
  if (ids.length === 0) return []

  const result = await getDb().query<{
    id: string
    filename: string
    content_type: string
    bytes: number | string
    storage_key: string
  }>(
    // Filtered by person as well as by id: the ids arrive in a request body,
    // and a file belonging to somebody else must not be attachable to a letter
    // by guessing one.
    `SELECT id, filename, content_type, bytes, storage_key
       FROM lead_attachments WHERE id = ANY($1::uuid[]) AND lead_id = $2 ORDER BY created_at;`,
    [ids, personId],
  )

  if (result.rows.length !== ids.length) {
    throw notFoundError('One of those files is no longer here')
  }

  const total = result.rows.reduce((sum, row) => sum + toInt(row.bytes), 0)

  if (total > MAX_MAIL_ATTACHMENT_BYTES) {
    throw badRequestError('Those files are more than 20 MB together. Send them in two letters.')
  }

  const store = await resolveObjectStore()

  if (!store) throw badRequestError('Files can only be sent from the live site')

  const files = []

  for (const row of result.rows) {
    const object = await store.get(row.storage_key)

    if (!object?.body) throw notFoundError(`${row.filename} is no longer in the store`)

    files.push({
      filename: safeFilename(row.filename),
      content: toBase64(new Uint8Array(await new Response(object.body).arrayBuffer())),
      content_type: row.content_type,
    })
  }

  return files
}

/**
 * Hands one file back, behind the admin guard.
 *
 * `X-Content-Type-Options: nosniff` matters here more than anywhere else on
 * the site: a browser that guesses the type would run a stranger's file on the
 * admin's own origin.
 */
export const readAttachment = async (id: string): Promise<Response> => {
  const result = await getDb().query<{
    filename: string
    content_type: string
    bytes: number | string
    storage_key: string
  }>('SELECT filename, content_type, bytes, storage_key FROM lead_attachments WHERE id = $1;', [id])

  const row = result.rows[0]

  if (!row) throw notFoundError('That file is not here')

  const store = await resolveObjectStore()

  if (!store) throw badRequestError('Files can only be read on the live site')

  const object = await store.get(row.storage_key)

  if (!object) throw notFoundError('That file is no longer in the store')

  return new Response(object.body, {
    headers: {
      'content-type': row.content_type,
      'content-length': String(toInt(row.bytes)),
      'content-disposition': `${INLINE.has(row.content_type) ? 'inline' : 'attachment'}; filename="${safeFilename(row.filename)}"`,
      'x-content-type-options': 'nosniff',
      'cache-control': 'private, max-age=300',
    },
  })
}

export const deleteAttachment = async (personId: string, id: string): Promise<void> => {
  const result = await getDb().query<{ storage_key: string }>(
    'DELETE FROM lead_attachments WHERE id = $1 AND lead_id = $2 RETURNING storage_key;',
    [id, personId],
  )

  const key = result.rows[0]?.storage_key

  if (!key) return

  const store = await resolveObjectStore()

  // The row is gone, which is what the caller asked for. An orphan object in
  // the bucket is cheaper than a failed delete that leaves the row behind.
  await store?.remove(key).catch(() => {})
}
