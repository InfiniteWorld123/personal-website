import type { Bytes } from './sigv4'

export type StoredImage = {
  key: string
  width: number
  height: number
  contentType: string
  size: number
}

/**
 * Everything the application needs from an image store. Deliberately two
 * methods: R2 is the driver today, and a second one should be a new file
 * rather than a change anywhere else (`docs/architecture.md`).
 */
export type ImageStore = {
  put(input: { key: string; body: Bytes; contentType: string }): Promise<void>
  remove(key: string): Promise<void>
  /**
   * Reads an object back through the signed API rather than its public URL.
   *
   * A picture on a project page is meant to be public; a client's
   * Handelsregister is not, and an unguessable key is not a permission check.
   * Lead attachments are therefore streamed through an admin-guarded route,
   * and this is what that route reads them with. `null` when the key is gone.
   */
  get(key: string): Promise<{ body: ReadableStream<Uint8Array> | null; contentType: string } | null>
}
