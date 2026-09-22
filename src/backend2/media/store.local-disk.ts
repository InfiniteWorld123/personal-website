import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { MediaStore } from './store'

/**
 * The development store: the owner's own disk.
 *
 * `bun run dev` has no R2 binding and V2 deliberately has no S3 credentials,
 * so without this the whole module would be unbuildable and untestable on this
 * machine. `.backend2-media/` is in `.gitignore`; nothing here is ever
 * committed, and it is never used when `NODE_ENV=production`.
 */

const ROOT = resolve(process.cwd(), '.backend2-media')

/**
 * Keys are generated (`media/2026/09/<uuid>.png`), never derived from an
 * uploaded filename — but this is the one place a key becomes a filesystem
 * path, so it is also the place to prove that it cannot leave the root.
 */
const pathForKey = (key: string): string => {
  const target = resolve(ROOT, key)

  if (target !== ROOT && !target.startsWith(ROOT + sep)) {
    throw new Error(`Refusing a storage key that escapes the media root: ${key}`)
  }

  return target
}

const toNodeStream = (body: Uint8Array | ReadableStream<Uint8Array>): Readable =>
  body instanceof Uint8Array
    ? Readable.from([Buffer.from(body)])
    : Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])

export const createLocalDiskStore = (): MediaStore => ({
  async put({ key, body }) {
    const target = pathForKey(key)

    await mkdir(dirname(target), { recursive: true })

    /*
     * A failed write leaves no file behind. The service deletes the object
     * when the database insert fails; this covers the other half — a stream
     * that dies mid-upload does not leave a truncated "file" for the sweep to
     * find and the owner to wonder about.
     */
    try {
      await pipeline(toNodeStream(body), createWriteStream(target) as unknown as Writable)
    } catch (error) {
      await rm(target, { force: true }).catch(() => {})

      throw error
    }
  },

  async get(key) {
    const target = pathForKey(key)

    try {
      await stat(target)
    } catch {
      return null
    }

    return {
      body: Readable.toWeb(createReadStream(target)) as ReadableStream<Uint8Array>,
      /*
       * The disk keeps no metadata, and it does not need to: the content type
       * is decided from the bytes at upload and stored in the database, which
       * is where every caller reads it from. Returning a placeholder here
       * keeps the interface honest about what this driver actually knows.
       */
      contentType: 'application/octet-stream',
    }
  },

  async remove(key) {
    await rm(pathForKey(key), { force: true }).catch(() => {})
  },
})

/** Where the development store writes. Reported by the dev tooling, not a route. */
export const localMediaRoot = (): string => join(ROOT)
