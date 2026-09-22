import type { MediaStore } from './store'

/**
 * The V2 bucket, reached without credentials.
 *
 * A Worker that declares `r2_buckets` in its Wrangler config is handed the
 * bucket directly: no access key to create, none to store, none to leak. The
 * binding is `MEDIA_V2` and the bucket is `yamanwarda-v2-media` — separate from
 * the legacy `MEDIA` / `yamanwarda-media`, because the two systems must be able
 * to be deleted independently.
 *
 * A near-copy of `src/backend/shared/image-storage/r2-binding.ts`, and not an
 * import of it: `src/backend2/` imports nothing from `src/backend/`, so the
 * legacy backend stays deletable at cutover.
 */

/**
 * Only what this driver uses, declared structurally.
 *
 * The application's `tsconfig` pulls in `vite/client` rather than the
 * Cloudflare worker types, and adding a global type package for four methods
 * would change what every other file in the project sees.
 */
export type R2BucketBinding = {
  put(
    key: string,
    value: ArrayBuffer | ArrayBufferView | ReadableStream | string,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>
  get(key: string): Promise<{
    body: ReadableStream<Uint8Array> | null
    httpMetadata?: { contentType?: string }
  } | null>
  delete(key: string): Promise<void>
}

export const createR2BindingStore = (bucket: R2BucketBinding): MediaStore => ({
  async put({ key, body, contentType }) {
    if (body instanceof Uint8Array) {
      await bucket.put(key, body.buffer as ArrayBuffer, { httpMetadata: { contentType } })

      return
    }

    await bucket.put(key, body, { httpMetadata: { contentType } })
  },

  async get(key) {
    const object = await bucket.get(key)

    if (!object?.body) return null

    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
    }
  },

  async remove(key) {
    // A key that is already gone is the state the caller asked for.
    await bucket.delete(key)
  },
})

/**
 * The bucket this Worker was given, or `undefined` anywhere else.
 *
 * Resolved on first use rather than at module load: a top-level `await` makes
 * the whole module graph async, and Cloudflare then rejects the script with
 * "no registered event handlers". The specifier is assembled at runtime
 * because `cloudflare:workers` exists only inside a Worker, and a static
 * import would break the Node build.
 */
let resolution: Promise<R2BucketBinding | undefined> | undefined

export const getMediaBinding = (): Promise<R2BucketBinding | undefined> =>
  (resolution ??= (async () => {
    try {
      const specifier = ['cloudflare', 'workers'].join(':')
      const workerModule = (await import(/* @vite-ignore */ specifier)) as {
        env?: Record<string, unknown>
      }

      const binding = workerModule.env?.MEDIA_V2

      return binding && typeof binding === 'object' && 'put' in binding
        ? (binding as R2BucketBinding)
        : undefined
    } catch {
      // Not a Worker. The local disk store takes over off production.
      return undefined
    }
  })())

/** Only for tests, which need to observe both branches of the resolution. */
export const resetMediaBindingForTest = (): void => {
  resolution = undefined
}
