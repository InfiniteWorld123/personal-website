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
}
