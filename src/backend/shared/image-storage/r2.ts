import { internalError } from '#/backend/shared/error'
import { canonicalPath, signRequest, type SigningCredentials } from './sigv4'
import type { ImageStore } from './types'

export type R2Config = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

/** R2 ignores the region but still signs with one, and expects this value. */
const R2_REGION = 'auto'

const failed = async (action: string, response: Response): Promise<never> => {
  // The body may name the bucket and the key; log it, never return it.
  console.error(`R2 ${action} failed`, {
    status: response.status,
    body: await response.text().catch(() => ''),
  })

  throw internalError('The image store rejected the request')
}

export const createR2Store = (config: R2Config): ImageStore => {
  const origin = `https://${config.accountId}.r2.cloudflarestorage.com`

  const credentials: SigningCredentials = {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: R2_REGION,
    service: 's3',
  }

  // The key is percent-encoded once, here, so the URL `fetch` sends and the
  // path the signature covers are the same string.
  const objectUrl = (key: string) => new URL(origin + canonicalPath(config.bucket, key))

  return {
    async put({ key, body, contentType }) {
      const url = objectUrl(key)

      // `content-length` is deliberately unsigned: fetch sets it itself, and
      // some runtimes refuse to let it be set by hand.
      const headers = await signRequest({
        method: 'PUT',
        url,
        headers: { 'content-type': contentType },
        body,
        credentials,
      })

      const response = await fetch(url, { method: 'PUT', headers, body })

      if (!response.ok) await failed('upload', response)
    },

    async get(key) {
      const url = objectUrl(key)
      const headers = await signRequest({ method: 'GET', url, headers: {}, credentials })
      const response = await fetch(url, { method: 'GET', headers })

      if (response.status === 404) return null
      if (!response.ok) await failed('read', response)

      return {
        body: response.body,
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
      }
    },

    async remove(key) {
      const url = objectUrl(key)
      const headers = await signRequest({ method: 'DELETE', url, headers: {}, credentials })
      const response = await fetch(url, { method: 'DELETE', headers })

      // A key that is already gone is the state the caller asked for.
      if (!response.ok && response.status !== 404) await failed('delete', response)
    },
  }
}
