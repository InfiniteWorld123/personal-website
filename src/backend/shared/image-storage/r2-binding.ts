import type { ImageStore } from './types'

/**
 * The same store, reached without credentials.
 *
 * A Worker that declares `r2_buckets` in its Wrangler config is handed the
 * bucket directly: no access key, no secret, no signing. The S3 driver in
 * `r2.ts` still exists because the Node dev server has no bindings — but in
 * production this is the path, and it is why the owner never has to create an
 * R2 API token in the dashboard at all.
 *
 * `types.ts` says a second driver should be a new file rather than a change
 * anywhere else. This is that file.
 */

/**
 * Only what this driver uses, declared structurally.
 *
 * The application's `tsconfig` pulls in `vite/client`, not the Cloudflare
 * worker types, and adding a global type package for three methods would
 * change what every other file in the project sees.
 */
type R2BucketBinding = {
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

export const createR2BindingStore = (bucket: R2BucketBinding): ImageStore => ({
  async put({ key, body, contentType }) {
    // The interface hands bytes as a view; the binding wants the buffer.
    const bytes = body instanceof Uint8Array ? body : new Uint8Array(body as ArrayBuffer)

    await bucket.put(key, bytes.buffer as ArrayBuffer, { httpMetadata: { contentType } })
  },

  async get(key) {
    const object = await bucket.get(key)

    if (!object) return null

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
 * the whole module graph async, and Cloudflare then rejects the upload with
 * "The uploaded script has no registered event handlers" — the same trap
 * `db/client.ts` documents for Hyperdrive.
 *
 * The specifier is assembled at runtime because `cloudflare:workers` only
 * exists inside a Worker, and a static import would break the Node build.
 */
let resolution: Promise<R2BucketBinding | undefined> | undefined

export const getR2Binding = (): Promise<R2BucketBinding | undefined> =>
  (resolution ??= (async () => {
    try {
      const specifier = ['cloudflare', 'workers'].join(':')
      const workerModule = (await import(/* @vite-ignore */ specifier)) as {
        env?: Record<string, unknown>
      }

      const binding = workerModule.env?.MEDIA

      return binding && typeof binding === 'object' && 'put' in binding
        ? (binding as R2BucketBinding)
        : undefined
    } catch {
      // Not a Worker. The S3 driver takes over when credentials are present.
      return undefined
    }
  })())
