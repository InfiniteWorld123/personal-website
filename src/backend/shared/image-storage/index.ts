import { internalError } from '#/backend/shared/error'
import { env } from '#/shared/env'
import { createR2Store } from './r2'
import { createR2BindingStore, getR2Binding } from './r2-binding'
import type { ImageStore } from './types'

export * from './types'
export * from './url'
export { MAX_IMAGE_BYTES, buildStorageKey, probeImage } from './validate'
export type { ImageFormat, ProbedImage } from './validate'

let store: ImageStore | undefined

/**
 * True when the store can be read from and written to.
 *
 * Deliberately narrower than `isImageStoreConfigured`: putting and getting an
 * object needs four credentials, and the public hostname is not one of them.
 * Lead attachments are served through an admin-guarded route rather than from
 * a public URL, so requiring one would switch off a private feature because a
 * public setting is missing.
 */
export const isObjectStoreConfigured = (): boolean =>
  Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET,
  )

/**
 * The store, however this process can reach it.
 *
 * On Cloudflare the bucket arrives as a binding and needs no credentials at
 * all — which is the whole reason the owner never has to create an R2 API
 * token. On the Node dev server there is no binding, so it falls back to the
 * signed S3 driver, and without those credentials there is simply no store.
 *
 * Async because a binding can only be discovered by importing a module that
 * exists inside a Worker and nowhere else.
 */
export const resolveObjectStore = async (): Promise<ImageStore | null> => {
  const binding = await getR2Binding()

  if (binding) return createR2BindingStore(binding)

  return isObjectStoreConfigured() ? getImageStore() : null
}

/** True when the store can also publish a URL — what a project image needs. */
export const isImageStoreConfigured = (): boolean =>
  isObjectStoreConfigured() && Boolean(env.R2_PUBLIC_URL)

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
