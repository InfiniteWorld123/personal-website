import { internalError } from '#/backend/shared/error'
import { env } from '#/shared/env'
import { createR2Store } from './r2'
import type { ImageStore } from './types'

export * from './types'
export * from './url'
export { MAX_IMAGE_BYTES, buildStorageKey, probeImage } from './validate'
export type { ImageFormat, ProbedImage } from './validate'

let store: ImageStore | undefined

/** True when every credential the store needs is present. */
export const isImageStoreConfigured = (): boolean =>
  Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_URL,
  )

/**
 * The configured store. Resolved on first use rather than at import, so the
 * application still starts — and every page that does not upload still works —
 * on a machine with no R2 credentials.
 */
export const getImageStore = (): ImageStore => {
  if (store) return store

  if (!isImageStoreConfigured()) {
    throw internalError('Image storage is not configured')
  }

  store = createR2Store({
    accountId: env.R2_ACCOUNT_ID as string,
    accessKeyId: env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    bucket: env.R2_BUCKET as string,
  })

  return store
}
