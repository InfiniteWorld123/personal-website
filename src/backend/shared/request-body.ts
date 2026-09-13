export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large')
    this.name = 'RequestBodyTooLargeError'
  }
}

/**
 * Reads a body through a hard byte ceiling. `Content-Length` is only an early
 * hint: a streaming client may omit it or lie about it, so the stream itself
 * is counted before anything is allowed to allocate the payload.
 */
const readBytesWithinLimit = async (
  request: Request,
  maxBytes: number,
  // `Uint8Array<ArrayBuffer>`, not the looser `ArrayBufferLike`: only the
  // former is a `BodyInit`, and widening it here breaks the caller below.
): Promise<Uint8Array<ArrayBuffer>> => {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError()
  }

  if (!request.body) return new Uint8Array(0)

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel('Request body exceeded its allowed size')
        throw new RequestBodyTooLargeError()
      }

      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes
}

export const readFormDataWithinLimit = async (
  request: Request,
  maxBytes: number,
): Promise<FormData> => {
  const bytes = await readBytesWithinLimit(request, maxBytes)
  const contentType = request.headers.get('content-type')
  const headers = contentType ? { 'Content-Type': contentType } : undefined

  return new Response(bytes, { headers }).formData()
}

/**
 * The same ceiling for a body that has to be read as raw text — a signed
 * webhook, where the signature covers the exact bytes received and re-encoding
 * a parsed object would change them.
 */
export const readTextWithinLimit = async (
  request: Request,
  maxBytes: number,
): Promise<string> => new TextDecoder().decode(await readBytesWithinLimit(request, maxBytes))
