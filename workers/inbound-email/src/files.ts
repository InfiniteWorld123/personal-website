/**
 * Turning the parts of an arriving letter into JSON the site can verify.
 *
 * Its own file, apart from `index.ts`, for one reason: `index.ts` is written
 * against Cloudflare's worker globals, and nothing that needs those globals
 * can be imported by a test running under the site's own TypeScript
 * configuration. This half needs none of them, and
 * `src/tests/inbound-attachments.test.ts` runs it against the site's decoder
 * over the same bytes — the only thing standing between a client's PDF and
 * rubble in the bucket.
 */

/** Ten megabytes, the same ceiling the site puts on a file he uploads himself. */
const MAX_FILE_BYTES = 10 * 1024 * 1024

/** Everything one letter may carry, before base64 inflates it by a third. */
const MAX_TOTAL_BYTES = 20 * 1024 * 1024

/**
 * A signature logo is not a document.
 *
 * An inline part with a content id is something the sender's mail client
 * embedded in the body — usually a company logo, a few kilobytes, on every
 * letter they ever send. Kept above this size, because a photograph dragged
 * into the body is also inline and *is* what they meant to send.
 */
const EMBEDDED_IMAGE_BYTES = 20 * 1024

/**
 * Base64 in chunks.
 *
 * Spreading a megabyte of bytes as arguments to `String.fromCharCode` is a
 * megabyte of arguments, and the stack gives out on exactly the large
 * attachment this exists to carry.
 */
const toBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }

  return btoa(binary)
}

/**
 * Only what this file reads, declared structurally.
 *
 * `postal-mime` hands bytes back as either an `ArrayBuffer` or a view on one,
 * depending on how the part was encoded, and a string when it was asked for
 * base64 — which it is not here. Naming the library's own type would drag its
 * whole shape into the site's build for four fields.
 */
export type ParsedAttachment = {
  filename?: string | null
  mimeType?: string | null
  disposition?: string | null
  contentId?: string | null
  content: ArrayBuffer | ArrayBufferView | string
}

/** One file as it travels inside the signed JSON. */
export type CarriedFile = { filename: string; contentType: string; content: string }

/**
 * A file the letter had but this Worker could not carry — named, so the
 * Inbox can show it as missing instead of never mentioning it. The bytes are
 * still in the copy forwarded to the owner's own mailbox.
 */
export type OmittedFile = {
  filename: string
  contentType: string
  byteSize: number
  reason: 'too-large' | 'letter-too-large'
}

/** The four characters base64 spends on every three bytes. */
const base64Length = (bytes: number): number => 4 * Math.ceil(bytes / 3)

/**
 * The files, as JSON the site can verify along with the rest of the letter.
 *
 * Everything travels inside the one signed payload rather than as a second
 * request: a file posted separately would either need its own signature or
 * arrive unauthenticated, and the site would have to hold a half-recorded
 * letter open while it waited.
 *
 * `maxEncodedBytes` is what the files may add to the JSON, base64 and field
 * names included. A file that does not fit is skipped — and the next, smaller
 * one may still fit — and named in `omitted`, as is any single file over the
 * ten-megabyte ceiling the site would refuse anyway. Empty parts and small
 * embedded logos are dropped without a word: there is nothing to miss.
 */
export const packFiles = (
  attachments: ParsedAttachment[],
  options: { maxEncodedBytes?: number; maxTotalBytes?: number; maxFiles?: number } = {},
): { files: CarriedFile[]; omitted: OmittedFile[] } => {
  const maxEncoded = options.maxEncodedBytes ?? Number.POSITIVE_INFINITY
  const maxTotal = options.maxTotalBytes ?? MAX_TOTAL_BYTES
  const maxFiles = options.maxFiles ?? Number.POSITIVE_INFINITY
  const files: CarriedFile[] = []
  const omitted: OmittedFile[] = []
  let total = 0
  let encoded = 0

  for (const attachment of attachments) {
    if (typeof attachment.content === 'string' || !attachment.content) continue

    const buffer = ArrayBuffer.isView(attachment.content)
      ? attachment.content.buffer.slice(
          attachment.content.byteOffset,
          attachment.content.byteOffset + attachment.content.byteLength,
        )
      : attachment.content
    const bytes = buffer.byteLength
    const embedded = attachment.disposition === 'inline' && Boolean(attachment.contentId)
    // Clamped: a receiving schema that refuses a 2,000-character name would
    // refuse the whole letter with it.
    const filename = (attachment.filename?.trim() || 'attachment').slice(0, 255)
    const contentType = (attachment.mimeType ?? 'application/octet-stream').slice(0, 255)

    if (bytes === 0) continue
    if (embedded && bytes <= EMBEDDED_IMAGE_BYTES) continue

    if (bytes > MAX_FILE_BYTES) {
      omitted.push({ filename, contentType, byteSize: bytes, reason: 'too-large' })
      continue
    }

    // The field names, quotes and an escaped name, generously.
    const cost = base64Length(bytes) + 2 * (filename.length + contentType.length) + 96

    if (files.length >= maxFiles || total + bytes > maxTotal || encoded + cost > maxEncoded) {
      omitted.push({ filename, contentType, byteSize: bytes, reason: 'letter-too-large' })
      continue
    }

    total += bytes
    encoded += cost
    files.push({ filename, contentType, content: toBase64(buffer as ArrayBuffer) })
  }

  return { files, omitted }
}

/**
 * The files the legacy site takes: the carried ones only, as it always had.
 */
export const filesFrom = (attachments: ParsedAttachment[]): CarriedFile[] => packFiles(attachments).files
