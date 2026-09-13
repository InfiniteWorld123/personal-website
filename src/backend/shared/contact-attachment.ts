import { probeImage } from './image-storage/validate'

export const MAX_CONTACT_ATTACHMENT_BYTES = 5 * 1024 * 1024

export type ContactAttachmentInfo = {
  extension: 'jpg' | 'pdf' | 'png' | 'webp'
  contentType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp'
}

const hasPdfSignature = (bytes: Uint8Array): boolean => {
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 5))
  const tail = new TextDecoder('ascii').decode(bytes.subarray(Math.max(0, bytes.length - 1024)))

  return header === '%PDF-' && tail.includes('%%EOF')
}

const crc32 = (bytes: Uint8Array, from: number, to: number): number => {
  let crc = 0xffffffff
  for (let index = from; index < to; index += 1) {
    crc ^= bytes[index]
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }

  return (crc ^ 0xffffffff) >>> 0
}

const dimensionsAreSafe = (width: number, height: number): boolean =>
  width > 0 && height > 0 && width <= 10_000 && height <= 10_000 && width * height <= 25_000_000

const isValidPng = (bytes: Uint8Array): boolean => {
  if (bytes.byteLength < 45) return false

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let chunkIndex = 0
  let sawImageData = false

  while (offset + 12 <= bytes.byteLength) {
    const length = view.getUint32(offset)
    const type = new TextDecoder('ascii').decode(bytes.subarray(offset + 4, offset + 8))
    const dataEnd = offset + 8 + length
    const chunkEnd = dataEnd + 4
    if (dataEnd < offset || chunkEnd > bytes.byteLength) return false
    if (crc32(bytes, offset + 4, dataEnd) !== view.getUint32(dataEnd)) return false

    if (chunkIndex === 0) {
      if (type !== 'IHDR' || length !== 13) return false
      const width = view.getUint32(offset + 8)
      const height = view.getUint32(offset + 12)
      const bitDepth = bytes[offset + 16]
      const colorType = bytes[offset + 17]
      const validDepths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      }
      if (
        !dimensionsAreSafe(width, height) ||
        !validDepths[colorType]?.includes(bitDepth) ||
        bytes[offset + 18] !== 0 ||
        bytes[offset + 19] !== 0 ||
        bytes[offset + 20] > 1
      ) {
        return false
      }
    } else if (type === 'IHDR') {
      return false
    }

    if (type === 'IDAT') sawImageData = true
    if (type === 'IEND') return length === 0 && sawImageData && chunkEnd === bytes.byteLength

    offset = chunkEnd
    chunkIndex += 1
  }

  return false
}

const isStartOfFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

const isValidJpeg = (bytes: Uint8Array): boolean => {
  if (bytes.byteLength < 14 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2
  let sawFrame = false
  let sawScan = false

  while (offset < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      if (!sawScan) return false
      offset += 1
      continue
    }

    while (bytes[offset] === 0xff) offset += 1
    if (offset >= bytes.byteLength) return false
    const marker = bytes[offset]
    offset += 1

    if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
      if (!sawScan) return false
      continue
    }
    if (marker === 0xd9) return sawFrame && sawScan && offset === bytes.byteLength
    if (marker === 0xd8 || marker === 0x01) continue
    if (offset + 2 > bytes.byteLength) return false

    const segmentLength = view.getUint16(offset)
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) return false

    if (isStartOfFrame(marker)) {
      if (segmentLength < 8) return false
      const height = view.getUint16(offset + 3)
      const width = view.getUint16(offset + 5)
      if (!dimensionsAreSafe(width, height)) return false
      sawFrame = true
    }
    if (marker === 0xda) sawScan = true

    offset += segmentLength
  }

  return false
}

const isValidWebp = (bytes: Uint8Array): boolean => {
  if (bytes.byteLength < 20) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(4, true) + 8 !== bytes.byteLength) return false

  let offset = 12
  let sawImageChunk = false
  while (offset + 8 <= bytes.byteLength) {
    const type = new TextDecoder('ascii').decode(bytes.subarray(offset, offset + 4))
    const length = view.getUint32(offset + 4, true)
    const chunkEnd = offset + 8 + length + (length % 2)
    if (chunkEnd < offset || chunkEnd > bytes.byteLength) return false
    if (type === 'VP8 ' || type === 'VP8L' || type === 'VP8X') sawImageChunk = true
    offset = chunkEnd
  }

  return sawImageChunk && offset === bytes.byteLength
}

/** Trusts the bytes only; filename and browser MIME are intentionally absent. */
export const inspectContactAttachment = (bytes: Uint8Array): ContactAttachmentInfo | null => {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CONTACT_ATTACHMENT_BYTES) return null

  if (hasPdfSignature(bytes)) {
    return { extension: 'pdf', contentType: 'application/pdf' }
  }

  try {
    const image = probeImage(new Uint8Array(bytes))
    const structurallyValid =
      image.format === 'png'
        ? isValidPng(bytes)
        : image.format === 'jpeg'
          ? isValidJpeg(bytes)
          : isValidWebp(bytes)

    if (!structurallyValid) return null

    return {
      extension: image.extension as ContactAttachmentInfo['extension'],
      contentType: image.contentType as ContactAttachmentInfo['contentType'],
    }
  } catch {
    return null
  }
}
