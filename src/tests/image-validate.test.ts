import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_BYTES, buildStorageKey, probeImage } from '#/backend/shared/image-storage/validate'
import type { Bytes } from '#/backend/shared/image-storage/sigv4'

const load = (path: string): Bytes => new Uint8Array(readFileSync(path)) as Bytes

/** Builds the first 30 bytes of a WebP container — all the reader ever looks at. */
const webpHeader = (chunk: 'VP8X' | 'VP8L', payload: number[]): Bytes => {
  const bytes = new Uint8Array(30)
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index)
  }

  write(0, 'RIFF')
  write(8, 'WEBP')
  write(12, chunk)
  payload.forEach((byte, index) => {
    bytes[20 + index] = byte
  })

  return bytes as Bytes
}

describe('image validation', () => {
  it('reads the real screenshots at the sizes the site declares', () => {
    expect(probeImage(load('public/images/work/tech-store/catalog.jpg'))).toMatchObject({
      format: 'jpeg',
      contentType: 'image/jpeg',
      extension: 'jpg',
      width: 1600,
      height: 1000,
    })

    // A portrait-orientation phone screenshot: width and height must not swap.
    expect(probeImage(load('public/images/work/tech-store/mobile.jpg'))).toMatchObject({
      width: 360,
      height: 780,
    })

    expect(probeImage(load('public/images/work/inknest/discover.jpg'))).toMatchObject({
      width: 1600,
      height: 977,
    })
  })

  it('reads a PNG', () => {
    expect(probeImage(load('public/images/yaman-cutout.png'))).toMatchObject({
      format: 'png',
      contentType: 'image/png',
      width: 1000,
      height: 966,
    })
  })

  it('reads both WebP header shapes', () => {
    // VP8X stores width-1 and height-1 as little-endian 24-bit values at 24/27.
    const extended = webpHeader('VP8X', [0, 0, 0, 0, 0x3f, 0x05, 0x00, 0xe7, 0x03, 0x00])
    expect(probeImage(extended)).toMatchObject({ format: 'webp', width: 1344, height: 1000 })

    // VP8L packs width-1 into the low 14 bits and height-1 into the next 14,
    // little-endian from offset 21: (31 << 14) | 63 == 0x0007c03f -> 64 x 32.
    const lossless = webpHeader('VP8L', [0x2f, 0x3f, 0xc0, 0x07, 0x00])
    expect(probeImage(lossless)).toMatchObject({ format: 'webp', width: 64, height: 32 })
  })

  it('refuses a file whose bytes are not an image, whatever it is called', () => {
    const textFile = new TextEncoder().encode('not an image, despite the .jpg') as Bytes

    expect(() => probeImage(textFile)).toThrow(/PNG, JPG, or WebP/)
  })

  it('refuses an empty file and one over the size cap', () => {
    expect(() => probeImage(new Uint8Array(0) as Bytes)).toThrow(/empty/)

    const oversized = new Uint8Array(MAX_IMAGE_BYTES + 1) as Bytes
    oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

    expect(() => probeImage(oversized)).toThrow(/at most 8 MB/)
  })

  it('refuses a truncated image that passes the signature check', () => {
    const headerOnly = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) as Bytes

    expect(() => probeImage(headerOnly)).toThrow(/damaged/)
  })

  it('generates a key instead of trusting the uploaded filename', () => {
    const key = buildStorageKey('projects', 'jpg')

    expect(key).toMatch(/^projects\/[0-9a-f-]{36}\.jpg$/)
    expect(buildStorageKey('projects', 'jpg')).not.toBe(key)
  })
})
