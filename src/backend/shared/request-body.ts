export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body is too large')
    this.name = 'RequestBodyTooLargeError'
  }
}

/**
 * Reads a multipart body through a hard byte ceiling. `Content-Length` is only
 * an early hint: a streaming client may omit it or lie about it, so the stream
 * itself is counted before `formData()` is allowed to allocate the payload.
 */
export const readFormDataWithinLimit = async (
  request: Request,
  maxBytes: number,
): Promise<FormData> => {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyTooLargeError()
  }

  if (!request.body) return new FormData()

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

  const contentType = request.headers.get('content-type')
  const headers = contentType ? { 'Content-Type': contentType } : undefined

  return new Response(bytes, { headers }).formData()
}
