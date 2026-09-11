import { badRequestError } from '#/backend/shared/error'
import type { Bytes } from './sigv4'

/**
 * What the store accepts. Narrow on purpose: PNG, JPEG and WebP are what a
 * screenshot or a photograph arrives as, and all three state their dimensions
 * in the first few dozen bytes, so nothing has to be decoded to learn them.
 *
 * AVIF is deliberately absent from the *input* list even though visitors are
 * served it — Cloudflare Image Transformations negotiates the delivered format
 * from whatever we store, so accepting fewer formats in costs nothing out.
 */
export type ImageFormat = 'png' | 'jpeg' | 'webp'

export type ProbedImage = {
  format: ImageFormat
  contentType: string
  extension: string
  width: number
  height: number
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

const FORMAT_META: Record<ImageFormat, { contentType: string; extension: string }> = {
  png: { contentType: 'image/png', extension: 'png' },
  jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
  webp: { contentType: 'image/webp', extension: 'webp' },
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean =>
  signature.every((byte, index) => bytes[offset + index] === byte)

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.subarray(offset, offset + length))

/** Markers that carry a frame header. 0xC4 (DHT), 0xC8 (JPG) and 0xCC (DAC) do not. */
const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

const readPng = (view: DataView): { width: number; height: number } | null => {
  if (view.byteLength < 24) return null

  return { width: view.getUint32(16), height: view.getUint32(20) }
}

const readJpeg = (bytes: Uint8Array, view: DataView): { width: number; height: number } | null => {
  let offset = 2

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = bytes[offset + 1]

    // Standalone markers carry no length: padding, restarts, and SOI.
    if (marker === 0xff) {
      offset += 1
      continue
    }

    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }

    const segmentLength = view.getUint16(offset + 2)

    if (isStartOfFrame(marker)) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) }
    }

    // A segment shorter than its own length field means the file is malformed.
    if (segmentLength < 2) return null

    offset += 2 + segmentLength
  }

  return null
}

const readWebp = (bytes: Uint8Array, view: DataView): { width: number; height: number } | null => {
  const chunk = ascii(bytes, 12, 4)

  if (chunk === 'VP8 ' && view.byteLength >= 30) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    }
  }

  if (chunk === 'VP8L' && view.byteLength >= 25) {
    const bits = view.getUint32(21, true)

    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
  }

  if (chunk === 'VP8X' && view.byteLength >= 30) {
    const readUint24 = (offset: number) =>
      bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)

    return { width: readUint24(24) + 1, height: readUint24(27) + 1 }
  }

  return null
}

const detectFormat = (bytes: Uint8Array): ImageFormat | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'

  return null
}

/**
 * Decides what a file actually is from its own bytes. The declared MIME type
 * and the filename are never consulted — a form post is whatever the sender
 * chose to send, and the contact endpoint already distrusts both.
 *
 * Throws the standard `BAD_REQUEST` rather than returning null, so a caller
 * cannot forget to check.
 */
export const probeImage = (bytes: Bytes): ProbedImage => {
  if (bytes.byteLength === 0) throw badRequestError('The file is empty')

  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    throw badRequestError(`The image must be at most ${MAX_IMAGE_BYTES / (1024 * 1024)} MB`)
  }

  const format = detectFormat(bytes)

  if (!format) throw badRequestError('The file must be a PNG, JPG, or WebP image')

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const size =
    format === 'png' ? readPng(view) : format === 'jpeg' ? readJpeg(bytes, view) : readWebp(bytes, view)

  if (!size || size.width <= 0 || size.height <= 0) {
    throw badRequestError('The image is damaged: its dimensions could not be read')
  }

  return { format, ...FORMAT_META[format], ...size }
}

/**
 * The stored key. Generated, never derived from the uploaded filename: a name
 * chosen by the sender has no business deciding where a file lands.
 */
export const buildStorageKey = (prefix: string, extension: string): string =>
  `${prefix}/${crypto.randomUUID()}.${extension}`
