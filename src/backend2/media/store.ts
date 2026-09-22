import { storageUnavailable } from '../http/error'
import { createLocalDiskStore } from './store.local-disk'
import { createR2BindingStore, getMediaBinding } from './store.r2-binding'

/**
 * Where the vault's bytes live.
 *
 * Three resolutions, one interface, and deliberately **no signed-S3 driver**:
 * V2 needs no R2 access key, no secret, and no credential in `.env`. There is
 * nothing to leak, and `docs/v2/media.md` is explicit — "Do not add an unusable
 * Cloudflare binding or expose R2 credentials/keys in the browser."
 */

export type MediaStore = {
  /**
   * A stream rather than only a buffer, because the ceiling is 100 MB and a
   * Worker has 128 MB of memory. Holding a whole video in an array to hand it
   * to the bucket is how an upload that is within its limit still fails.
   */
  put(input: {
    key: string
    body: Uint8Array | ReadableStream<Uint8Array>
    contentType: string
    /** Known length, when there is one. Some backends need it for a stream. */
    size?: number
  }): Promise<void>
  get(key: string): Promise<{ body: ReadableStream<Uint8Array>; contentType: string } | null>
  remove(key: string): Promise<void>
}

/**
 * Overridden by the integration suite, which stores objects in a Map.
 *
 * `'none'` is not the same as clearing the override: it forces the third case
 * below, so a test can see what a deployment with no bucket does without
 * setting `NODE_ENV=production` — which the owner fence reads too, and which
 * would make the route answer 404 before it ever reached the storage question.
 */
let override: MediaStore | 'none' | undefined

export const useMediaStoreForTest = (store: MediaStore | 'none' | undefined): void => {
  override = store
}

/**
 * The store for this environment, or `undefined` when there is none.
 *
 * 1. An R2 **binding** named `MEDIA_V2` — Cloudflare and `wrangler dev`, with
 *    no credentials at all.
 * 2. Otherwise, off production, a local disk store under `.backend2-media/`.
 *    This is what `bun run dev` uses.
 * 3. Otherwise nothing, and the media routes answer `503 STORAGE_UNAVAILABLE`
 *    rather than pretending to have stored a file.
 *
 * Case 3 is the current deployed state on purpose: `wrangler.jsonc` has no
 * `MEDIA_V2` binding, because a binding to a bucket that does not exist fails
 * the deploy. Creating `yamanwarda-v2-media` and adding the binding is the
 * owner action in §"What the owner has to do".
 */
export const resolveMediaStore = async (
  environment: Record<string, string | undefined> = process.env,
): Promise<MediaStore | undefined> => {
  if (override === 'none') return undefined
  if (override) return override

  const binding = await getMediaBinding()

  if (binding) return createR2BindingStore(binding)

  if (environment.NODE_ENV === 'production') return undefined

  return createLocalDiskStore()
}

/** The same resolution, for a route that cannot proceed without a store. */
export const requireMediaStore = async (
  environment: Record<string, string | undefined> = process.env,
): Promise<MediaStore> => {
  const store = await resolveMediaStore(environment)

  if (!store) {
    throw storageUnavailable(
      'Media storage is not configured in this environment. No file was stored.',
    )
  }

  return store
}
