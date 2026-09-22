import { badRequest, bodyTooLarge } from './error'

/**
 * The ceilings, stated here rather than imported from a module's contract.
 *
 * This file is the one place a limit is actually enforced, so it is the one
 * place the number belongs. A module that needs a different ceiling passes it
 * to `readLimited` directly.
 */
export const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/**
 * Backend2 enforces its own body limits.
 *
 * `src/start.ts` matches its limits on exact paths and knows nothing about
 * `/api/v2`. Rather than teach a shared file about V2 — and risk changing how
 * a public request is handled — the ceiling is applied here, where the route
 * that needs it lives.
 */

/**
 * Reads a stream while counting, and stops the moment the count passes the
 * ceiling. Measuring after buffering would mean holding the whole oversize
 * body in memory first, which is exactly what the limit exists to prevent.
 */
export const readLimited = async (request: Request, limit: number): Promise<Uint8Array> => {
  const declared = Number(request.headers.get('content-length'))

  if (Number.isFinite(declared) && declared > limit) throw bodyTooLarge()

  const body = request.body

  if (!body) return new Uint8Array()

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) break
    if (!value) continue

    total += value.byteLength

    if (total > limit) {
      await reader.cancel().catch(() => {})

      throw bodyTooLarge()
    }

    chunks.push(value)
  }

  const bytes = new Uint8Array(total)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes
}

export const readJsonBody = async (request: Request): Promise<unknown> => {
  const bytes = await readLimited(request, MAX_JSON_BODY_BYTES)

  if (bytes.byteLength === 0) return {}

  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw badRequest('The request body is not valid JSON')
  }
}

/** The one uploaded file, read under the upload ceiling. */
export const readUploadedFile = async (request: Request): Promise<Uint8Array> => {
  const contentType = request.headers.get('content-type') ?? ''

  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    throw badRequest('Send the image as multipart/form-data with a "file" field')
  }

  const declared = Number(request.headers.get('content-length'))

  // The multipart envelope costs a little more than the file it carries, so
  // the check allows for it rather than refusing a file that is exactly at the
  // limit.
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES + 64 * 1024) throw bodyTooLarge()

  const form = await request.formData().catch(() => null)

  if (!form) throw badRequest('That upload could not be read')

  const file = form.get('file')

  if (!(file instanceof File)) throw badRequest('Attach the image in a "file" field')
  if (file.size > MAX_UPLOAD_BYTES) throw bodyTooLarge()

  return new Uint8Array(await file.arrayBuffer())
}
