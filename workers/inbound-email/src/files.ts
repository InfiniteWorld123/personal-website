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

/**
 * The files, as JSON the site can verify along with the rest of the letter.
 *
 * Everything travels inside the one signed payload rather than as a second
 * request: a file posted separately would either need its own signature or
 * arrive unauthenticated, and the site would have to hold a half-recorded
 * letter open while it waited.
 *
 * What is dropped here is dropped for a reason that cannot be recovered
 * further down — no bytes, or a letter so large that carrying the rest of it
 * matters more. Everything else is the site's decision, and it says so in the
 * conversation when it refuses.
 */
export const filesFrom = (
  attachments: ParsedAttachment[],
): Array<{ filename: string; contentType: string; content: string }> => {
  const files = []
  let total = 0

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

    if (bytes === 0 || bytes > MAX_FILE_BYTES) continue
    if (embedded && bytes <= EMBEDDED_IMAGE_BYTES) continue
    if (total + bytes > MAX_TOTAL_BYTES) break

    total += bytes
    files.push({
      filename: attachment.filename?.trim() || 'attachment',
      contentType: attachment.mimeType ?? 'application/octet-stream',
      content: toBase64(buffer as ArrayBuffer),
    })
  }

  return files
}
