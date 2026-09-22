import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import { MAX_BYTES, MAX_UPLOAD_BYTES, PROBE_BYTES } from '../contracts/media.contract'
import { badRequest, fileTooLarge, unsupportedFileType, uploadFailed } from '../http/error'
import { buildStorageKey } from './naming'
import { probeMedia, type ProbeResult } from './probe'
import type { MediaStore } from './store'

/**
 * Taking one file in, without ever holding all of it.
 *
 * The ceiling is 100 MB and a Cloudflare Worker has 128 MB of memory, so
 * `await request.arrayBuffer()` is not an option for a video: a file that is
 * inside its own limit would still take the isolate down. The bytes therefore
 * pass through in chunks, and three things happen to them on the way — they
 * are counted, they are hashed, and the first `PROBE_BYTES` of them are kept
 * back long enough to decide what the file actually is.
 *
 * Nothing is written to the database here. `docs/v2/media.md` asks for uploads
 * that fail "without creating phantom library items", so the row is the
 * caller's last step, after the bytes have landed.
 */

export type StoredUpload = {
  storageKey: string
  probe: ProbeResult
  byteSize: number
  /** SHA-256, hex. The ETag, and how a duplicate is recognised. */
  checksum: string
}

const megabytes = (bytes: number): number => Math.round(bytes / (1024 * 1024))

/**
 * Reads until there is enough to identify the file, or the stream ends.
 *
 * The chunks are kept rather than concatenated as they arrive: joining a
 * growing buffer on every read is quadratic, and this runs on every upload.
 */
const readHead = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<{ head: Uint8Array; finished: boolean }> => {
  const chunks: Uint8Array[] = []
  let total = 0

  while (total < PROBE_BYTES) {
    const { done, value } = await reader.read()

    if (done) {
      return { head: concat(chunks, total), finished: true }
    }

    if (!value || value.byteLength === 0) continue

    chunks.push(value)
    total += value.byteLength
  }

  return { head: concat(chunks, total), finished: false }
}

const concat = (chunks: Uint8Array[], total: number): Uint8Array => {
  if (chunks.length === 1) return chunks[0]!

  const bytes = new Uint8Array(total)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes
}

/**
 * Validates, stores, and reports what was stored.
 *
 * Throws before anything is written when the type is not accepted or the
 * declared length is already over the family's ceiling. Throws *after*
 * removing the partial object when the real length turns out to exceed it —
 * a `Content-Length` is a claim like any other.
 */
export const storeUploadedFile = async (input: {
  body: ReadableStream<Uint8Array> | null
  declaredSize: number | null
  store: MediaStore
  now?: Date
  /**
   * The uploaded filename, passed to the probe as a hint and nothing more.
   * It cannot make a file be something — it only chooses between subtypes of
   * a family the bytes have already proved.
   */
  fileName?: string
  /**
   * Called with the key once it exists and before a byte is sent to the store.
   *
   * This is where the caller records that an object is about to exist. A
   * process that dies during the `put` is then recoverable, because the key was
   * written down before the bytes it names.
   */
  beforeWrite?: (storageKey: string) => Promise<void>
}): Promise<StoredUpload> => {
  if (!input.body) throw badRequest('The upload had no body')

  /*
   * The cheapest refusal there is: a length the browser itself admits is over
   * the largest ceiling any family has, rejected before a single byte of the
   * body is read.
   */
  if (input.declaredSize !== null && input.declaredSize > MAX_UPLOAD_BYTES) {
    throw fileTooLarge(`That file is larger than ${megabytes(MAX_UPLOAD_BYTES)} MB`)
  }

  const reader = input.body.getReader()
  let head: Uint8Array
  let finished: boolean

  try {
    ;({ head, finished } = await readHead(reader))
  } catch {
    await reader.cancel().catch(() => {})

    throw uploadFailed('That upload stopped before it could be read')
  }

  if (head.byteLength === 0) {
    await reader.cancel().catch(() => {})

    throw uploadFailed('That file is empty')
  }

  const probe = probeMedia(head, input.fileName)

  if (!probe) {
    await reader.cancel().catch(() => {})

    throw unsupportedFileType(
      'That file type is not accepted. Images, MP4/MOV/WebM video, PDF, ' +
        'Office and OpenDocument files, RTF, text and ZIP are.',
    )
  }

  const limit = MAX_BYTES[probe.kind]

  if (input.declaredSize !== null && input.declaredSize > limit) {
    await reader.cancel().catch(() => {})

    throw fileTooLarge(`A ${probe.kind} may be up to ${megabytes(limit)} MB`)
  }

  // Already over the ceiling before the rest of the stream is even touched.
  if (head.byteLength > limit) {
    await reader.cancel().catch(() => {})

    throw fileTooLarge(`A ${probe.kind} may be up to ${megabytes(limit)} MB`)
  }

  const storageKey = buildStorageKey(probe.extension, input.now)
  const hasher = sha256.create()
  let byteSize = 0
  let overflowed = false
  let drained = false

  /*
   * The head is emitted first and the rest follows, so the store sees one
   * ordinary stream and never learns that anything was held back.
   */
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      hasher.update(head)
      byteSize += head.byteLength
      controller.enqueue(head)

      if (finished) {
        drained = true
        controller.close()
      }
    },
    async pull(controller) {
      const { done, value } = await reader.read()

      if (done) {
        drained = true
        controller.close()

        return
      }

      if (!value || value.byteLength === 0) return

      byteSize += value.byteLength

      if (byteSize > limit) {
        overflowed = true
        await reader.cancel().catch(() => {})
        controller.error(new Error('upload exceeded its limit'))

        return
      }

      hasher.update(value)
      controller.enqueue(value)
    },
    cancel: (reason) => reader.cancel(reason).catch(() => {}),
  })

  try {
    await input.beforeWrite?.(storageKey)

    await input.store.put({
      key: storageKey,
      body,
      contentType: probe.contentType,
      size: input.declaredSize ?? undefined,
    })
  } catch (error) {
    // Whatever landed is not a file anybody asked for.
    await input.store.remove(storageKey).catch(() => {})

    if (overflowed) throw fileTooLarge(`A ${probe.kind} may be up to ${megabytes(limit)} MB`)

    throw uploadFailed(
      error instanceof Error && error.message.includes('escapes the media root')
        ? 'That file could not be stored'
        : 'That upload did not finish. Nothing was added to the library.',
    )
  }

  /*
   * A store that returned without draining the stream would leave a truncated
   * object behind a checksum for bytes nobody has. Checked rather than
   * trusted, because the driver is swappable — and checked this way rather
   * than by comparing `Content-Length`, which a proxy that decompresses a
   * request body would make wrong for an upload that is perfectly fine.
   */
  if (!drained) {
    await input.store.remove(storageKey).catch(() => {})

    throw uploadFailed('That upload did not finish. Nothing was added to the library.')
  }

  return { storageKey, probe, byteSize, checksum: bytesToHex(hasher.digest()) }
}
