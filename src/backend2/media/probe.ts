import type { MediaKind } from '../contracts/media.contract'

/**
 * What a file actually is, read from its bytes.
 *
 * The browser's `Content-Type` header is a claim, and a renamed `.png` is the
 * oldest trick there is. `docs/v2/media.md`: "Verify actual file
 * contents/signatures, allowed MIME types, size, image dimensions, and
 * PDF/video handling on the server." So nothing in this module ever trusts the
 * declared type — the value stored in `v2_media_assets.content_type` is the one
 * decided here.
 *
 * Only the head of the file is needed: every signature below, and every image
 * dimension, lives in the first few kilobytes.
 */

export type ProbeResult = {
  kind: MediaKind
  contentType: string
  /** Images only. A video or PDF reports no dimensions rather than a guess. */
  width?: number
  height?: number
  /** The extension the storage key gets. Derived from the type, never the name. */
  extension: string
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0): boolean => {
  if (bytes.length < offset + signature.length) return false

  return signature.every((byte, index) => bytes[offset + index] === byte)
}

const ascii = (bytes: Uint8Array, offset: number, length: number): string => {
  if (bytes.length < offset + length) return ''

  let out = ''

  for (let index = 0; index < length; index += 1) out += String.fromCharCode(bytes[offset + index]!)

  return out
}

const u32be = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>>
  0

const u16le = (bytes: Uint8Array, offset: number): number => bytes[offset]! | (bytes[offset + 1]! << 8)

const u24le = (bytes: Uint8Array, offset: number): number =>
  bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)

/* --------------------------------------------------------------------- PNG */

const probePng = (bytes: Uint8Array): ProbeResult | null => {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null
  // The first chunk must be IHDR, or this is not a PNG whatever the magic says.
  if (ascii(bytes, 12, 4) !== 'IHDR' || bytes.length < 24) return null

  return {
    kind: 'image',
    contentType: 'image/png',
    width: u32be(bytes, 16),
    height: u32be(bytes, 20),
    extension: 'png',
  }
}

/* -------------------------------------------------------------------- JPEG */

/**
 * Walks the marker segments to the frame header.
 *
 * The dimensions are not at a fixed offset in a JPEG: they sit in whichever
 * SOFn segment the encoder wrote, after any number of application and quantisation
 * segments. Bounded by the head we were given, so a malformed file ends the
 * walk instead of spinning.
 */
const probeJpeg = (bytes: Uint8Array): ProbeResult | null => {
  if (!startsWith(bytes, [0xff, 0xd8, 0xff])) return null

  let offset = 2

  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1

      continue
    }

    const marker = bytes[offset + 1]!

    // Padding, and the standalone markers that carry no length.
    if (marker === 0xff) {
      offset += 1

      continue
    }

    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2

      continue
    }

    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!

    if (length < 2) return null

    // SOF0–SOF15, minus the three that are not frame headers.
    const isFrameHeader =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

    if (isFrameHeader) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!

      if (width <= 0 || height <= 0) return null

      return { kind: 'image', contentType: 'image/jpeg', width, height, extension: 'jpg' }
    }

    // Start of scan: the entropy-coded data begins, and no header follows.
    if (marker === 0xda) return null

    offset += 2 + length
  }

  return null
}

/* --------------------------------------------------------------------- GIF */

const probeGif = (bytes: Uint8Array): ProbeResult | null => {
  const header = ascii(bytes, 0, 6)

  if (header !== 'GIF87a' && header !== 'GIF89a') return null
  if (bytes.length < 10) return null

  return {
    kind: 'image',
    contentType: 'image/gif',
    width: u16le(bytes, 6),
    height: u16le(bytes, 8),
    extension: 'gif',
  }
}

/* -------------------------------------------------------------------- WebP */

const probeWebp = (bytes: Uint8Array): ProbeResult | null => {
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return null

  const chunk = ascii(bytes, 12, 4)
  const webp = (width: number, height: number): ProbeResult | null =>
    width > 0 && height > 0
      ? { kind: 'image', contentType: 'image/webp', width, height, extension: 'webp' }
      : null

  // Simple lossy: the VP8 key-frame start code, then 14-bit dimensions.
  if (chunk === 'VP8 ' && bytes.length >= 30 && startsWith(bytes, [0x9d, 0x01, 0x2a], 23)) {
    return webp(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff)
  }

  // Lossless: one 32-bit field holding two 14-bit values, each stored minus one.
  if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
    const packed =
      (bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24)) >>> 0

    return webp((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1)
  }

  // Extended (animation, alpha, metadata): the canvas size, also minus one.
  if (chunk === 'VP8X' && bytes.length >= 30) {
    return webp(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1)
  }

  return null
}

/* ------------------------------------------------------- ISO-BMFF: AVIF, MP4 */

const ISO_BRANDS = {
  avif: new Set(['avif', 'avis']),
  mp4: new Set(['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'mmp4']),
  quicktime: new Set(['qt  ']),
} as const

/**
 * The `ispe` box, found by a bounded scan rather than a full box walk.
 *
 * A correct walk would descend `meta → iprp → ipco → ispe`, and a malformed
 * length anywhere in that chain is a loop waiting to happen. Scanning the head
 * for the box name and reading the two fields behind it gets the same answer
 * from a well-formed file and cannot run away on a broken one. Missing
 * dimensions are not fatal: the column is nullable.
 */
const findIspe = (bytes: Uint8Array): { width: number; height: number } | null => {
  const limit = Math.min(bytes.length, 64 * 1024) - 16

  for (let offset = 8; offset < limit; offset += 1) {
    if (ascii(bytes, offset, 4) !== 'ispe') continue

    // 4 bytes of version and flags sit between the name and the fields.
    const width = u32be(bytes, offset + 8)
    const height = u32be(bytes, offset + 12)

    if (width > 0 && height > 0 && width < 100_000 && height < 100_000) return { width, height }
  }

  return null
}

const probeIsoBmff = (bytes: Uint8Array): ProbeResult | null => {
  if (ascii(bytes, 4, 4) !== 'ftyp' || bytes.length < 12) return null

  const brand = ascii(bytes, 8, 4)

  if (ISO_BRANDS.avif.has(brand)) {
    const size = findIspe(bytes)

    return {
      kind: 'image',
      contentType: 'image/avif',
      width: size?.width,
      height: size?.height,
      extension: 'avif',
    }
  }

  if (ISO_BRANDS.quicktime.has(brand)) {
    return { kind: 'video', contentType: 'video/quicktime', extension: 'mov' }
  }

  if (ISO_BRANDS.mp4.has(brand)) {
    return { kind: 'video', contentType: 'video/mp4', extension: 'mp4' }
  }

  /*
   * A brand this module does not know is refused rather than guessed at. The
   * compatible-brands list that follows could be searched for a known one, but
   * an unknown major brand is exactly the case where a guess is least safe.
   */
  return null
}

/* -------------------------------------------------------------------- WebM */

/**
 * Matroska's EBML header, narrowed to WebM.
 *
 * `.mkv` shares the magic and is not on the allowlist, so the DocType decides:
 * the string `webm` appears in the header of one and `matroska` in the other.
 */
const probeWebm = (bytes: Uint8Array): ProbeResult | null => {
  if (!startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return null

  const head = ascii(bytes, 0, Math.min(bytes.length, 128))

  if (!head.includes('webm')) return null

  return { kind: 'video', contentType: 'video/webm', extension: 'webm' }
}

/* --------------------------------------------------------------------- PDF */

const probePdf = (bytes: Uint8Array): ProbeResult | null => {
  if (ascii(bytes, 0, 5) !== '%PDF-') return null

  return { kind: 'document', contentType: 'application/pdf', extension: 'pdf' }
}

/* --------------------------------------------------------------------- RTF */

const probeRtf = (bytes: Uint8Array): ProbeResult | null =>
  ascii(bytes, 0, 5) === '{\\rtf' ? { kind: 'document', contentType: 'application/rtf', extension: 'rtf' } : null

/* --------------------------------------------- ZIP containers: Office, ODF */

const ZIP_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04], // a normal archive
  [0x50, 0x4b, 0x05, 0x06], // an empty one
  [0x50, 0x4b, 0x07, 0x08], // a spanned one
]

const doc = (contentType: string, extension: string): ProbeResult => ({
  kind: 'document',
  contentType,
  extension,
})

/**
 * What is inside the archive, read from the head rather than unzipped.
 *
 * A `.docx` is a ZIP whose entries start with `word/`; `.xlsx` uses `xl/` and
 * `.pptx` uses `ppt/`. OpenDocument is easier still — it stores an uncompressed
 * `mimetype` entry first, so its media type is literally sitting in the file's
 * first hundred bytes. Both facts are readable without a ZIP decoder, which is
 * the point: no decompression means no decompression bomb.
 */
const probeZipContainer = (bytes: Uint8Array): ProbeResult | null => {
  if (!ZIP_SIGNATURES.some((signature) => startsWith(bytes, signature))) return null

  const head = ascii(bytes, 0, Math.min(bytes.length, 8 * 1024))

  // OpenDocument and EPUB write their own media type into the archive.
  const declared = head.match(/mimetypeapplication\/vnd\.oasis\.opendocument\.([a-z]+)/u)

  if (declared) {
    const family = declared[1]

    if (family === 'text') return doc('application/vnd.oasis.opendocument.text', 'odt')
    if (family === 'spreadsheet') return doc('application/vnd.oasis.opendocument.spreadsheet', 'ods')
    if (family === 'presentation') return doc('application/vnd.oasis.opendocument.presentation', 'odp')
  }

  if (head.includes('[Content_Types].xml')) {
    if (head.includes('word/')) {
      return doc(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'docx',
      )
    }
    if (head.includes('xl/')) {
      return doc('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx')
    }
    if (head.includes('ppt/')) {
      return doc(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'pptx',
      )
    }
  }

  // A ZIP that is not pretending to be a document is simply a ZIP.
  return doc('application/zip', 'zip')
}

/* --------------------------------------------------- OLE2: legacy Office */

const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

/**
 * `.doc`, `.xls` and `.ppt` share one signature, so the family is proved from
 * the bytes and the application is read from the stream names beside it.
 *
 * Those names are UTF-16, so `WordDocument` appears as `W\0o\0r\0d\0…`. The
 * directory usually sits in the first sectors; when it does not, the extension
 * decides — and only between these three, because the file has already been
 * proved to be an OLE2 compound document. That is the honest boundary: the
 * format is verified, the flavour is a hint.
 */
const probeOle2 = (bytes: Uint8Array, hint?: string): ProbeResult | null => {
  if (!startsWith(bytes, OLE2)) return null

  // Strip the interleaved zero bytes so the stream names can be searched as ASCII.
  let wide = ''

  for (let offset = 0; offset < Math.min(bytes.length, 16 * 1024); offset += 2) {
    const code = bytes[offset]!

    wide += code >= 0x20 && code < 0x7f ? String.fromCharCode(code) : ' '
  }

  if (wide.includes('WordDocument')) return doc('application/msword', 'doc')
  if (wide.includes('Workbook') || wide.includes('Book')) return doc('application/vnd.ms-excel', 'xls')
  if (wide.includes('PowerPoint')) return doc('application/vnd.ms-powerpoint', 'ppt')

  const extension = (hint ?? '').toLowerCase().split('.').pop()

  if (extension === 'doc') return doc('application/msword', 'doc')
  if (extension === 'xls') return doc('application/vnd.ms-excel', 'xls')
  if (extension === 'ppt') return doc('application/vnd.ms-powerpoint', 'ppt')

  return null
}

/* --------------------------------------------------------------------- SVG */

/**
 * An SVG, accepted deliberately and isolated deliberately.
 *
 * The specification's default is to refuse it, because it is a script
 * container that happens to draw. The owner asked for it on 22 Sep 2026 for
 * logos, with strict isolation, and the isolation is real: every file response
 * carries `Content-Security-Policy: default-src 'none'; sandbox`, and a
 * sandbox without `allow-scripts` runs nothing — including when the URL is
 * opened directly, which is the only case where an SVG could ever execute.
 *
 * There is no substring hunt for `<script>` here on purpose. It is trivially
 * evaded with entities and it fails on innocent files, which would teach the
 * owner that the library rejects their design exports at random. The header is
 * the boundary; this function only confirms the file is what it claims.
 */
const probeSvg = (bytes: Uint8Array): ProbeResult | null => {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, Math.min(bytes.length, 4096)))
    // A byte-order mark, a declaration, a doctype or a comment may come first.
    .replace(/^﻿/u, '')
    .trimStart()

  if (!head.startsWith('<')) return null

  const withoutPreamble = head
    .replace(/<\?xml[\s\S]*?\?>/gu, '')
    .replace(/<!DOCTYPE[\s\S]*?>/giu, '')
    .replace(/<!--[\s\S]*?-->/gu, '')
    .trimStart()

  if (!/^<svg[\s>]/iu.test(withoutPreamble)) return null

  const width = withoutPreamble.match(/\bwidth\s*=\s*["']\s*([\d.]+)/iu)
  const height = withoutPreamble.match(/\bheight\s*=\s*["']\s*([\d.]+)/iu)
  const box = withoutPreamble.match(/\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/iu)

  const round = (value: string | undefined): number | undefined => {
    const parsed = Number(value)

    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined
  }

  return {
    kind: 'image',
    contentType: 'image/svg+xml',
    // A width in `em` or `%` is not a pixel size, so the viewBox is preferred.
    width: round(box?.[1]) ?? round(width?.[1]),
    height: round(box?.[2]) ?? round(height?.[1]),
    extension: 'svg',
  }
}

/* -------------------------------------------------------------- plain text */

const TEXT_EXTENSIONS: Record<string, { contentType: string; extension: string }> = {
  txt: { contentType: 'text/plain', extension: 'txt' },
  md: { contentType: 'text/markdown', extension: 'md' },
  markdown: { contentType: 'text/markdown', extension: 'md' },
  csv: { contentType: 'text/csv', extension: 'csv' },
  tsv: { contentType: 'text/plain', extension: 'txt' },
  log: { contentType: 'text/plain', extension: 'txt' },
}

/**
 * The one family with no signature to check, so the check is the content
 * itself: it must decode as UTF-8 and hold no control characters beyond tab,
 * carriage return and newline. A binary renamed `.txt` fails that immediately.
 *
 * The subtype comes from the extension because nothing else can tell a
 * Markdown file from a CSV — and it does not matter much if it is wrong, since
 * every one of these is served as `text/*` with `nosniff` and as a download.
 * Last in the list, because almost anything is "not obviously binary".
 */
const probeText = (bytes: Uint8Array, hint?: string): ProbeResult | null => {
  const extension = (hint ?? '').toLowerCase().split('.').pop() ?? ''
  const known = TEXT_EXTENSIONS[extension]

  if (!known) return null

  const sample = bytes.subarray(0, Math.min(bytes.length, 8 * 1024))

  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(sample)

    // eslint-disable-next-line no-control-regex
    if (/[ --]/u.test(text)) return null
  } catch {
    return null
  }

  return { kind: 'document', contentType: known.contentType, extension: known.extension }
}

/* ------------------------------------------------------------------- public */

/**
 * Order matters. Everything with a real signature runs first; SVG before text,
 * because an SVG is also valid text; and text last, because it is the only
 * check that is "nothing says otherwise" rather than "these bytes say so".
 */
const PROBES: Array<(bytes: Uint8Array, hint?: string) => ProbeResult | null> = [
  probePng,
  probeJpeg,
  probeGif,
  probeWebp,
  probeIsoBmff,
  probeWebm,
  probePdf,
  probeRtf,
  probeZipContainer,
  probeOle2,
  probeSvg,
  probeText,
]

/**
 * Identifies a file from the beginning of its bytes, or refuses it.
 *
 * `null` means "not a type this module accepts" — the same answer for an
 * executable renamed to `.jpg`, an HTML page, and a genuinely unsupported
 * video container. The caller turns it into `UNSUPPORTED_FILE_TYPE`.
 *
 * `hint` is the uploaded filename, and it is never allowed to decide what a
 * file *is*: it only picks between subtypes of a family the bytes have already
 * proved — which of three OLE2 applications, or which flavour of plain text.
 */
export const probeMedia = (head: Uint8Array, hint?: string): ProbeResult | null => {
  for (const probe of PROBES) {
    const result = probe(head, hint)

    if (result) return result
  }

  return null
}
