import { MEDIA_LIMITS } from '../contracts/media.contract'

/**
 * Names, kept apart from paths.
 *
 * `docs/v2/media.md`: "Store opaque IDs and generated object keys. Preserve the
 * original filename only as private metadata, sanitize it for display/download,
 * and never use it directly as an R2 key or filesystem path." So there are two
 * functions here and they never meet: one produces something to show the owner,
 * the other produces a key, and the key is built from a uuid.
 */

/** Control characters, path separators, and the Windows-reserved punctuation. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f<>:"/\\|?*]/gu

/**
 * A filename that is safe to render, to put in a `Content-Disposition`, and to
 * save to any filesystem — while still looking like what the owner uploaded.
 *
 * The extension is appended from the *detected* type, not the claimed one: a
 * PDF named `holiday.jpg` is stored as `holiday.pdf`, so the library never
 * shows a name that contradicts the file.
 */
export const sanitizeFileName = (original: string, extension: string): string => {
  const withoutPath = original.split(/[/\\]/u).pop() ?? ''

  let base = withoutPath
    .replace(UNSAFE, '')
    // Collapse runs of whitespace so a pasted name does not arrive with tabs.
    .replace(/\s+/gu, ' ')
    .trim()
    // A leading dot makes a hidden file; a trailing one is invalid on Windows.
    .replace(/^\.+/u, '')
    .replace(/\.+$/u, '')
    .trim()

  // Drop a claimed extension so it cannot disagree with the detected one.
  const lastDot = base.lastIndexOf('.')

  if (lastDot > 0 && base.length - lastDot <= 6) base = base.slice(0, lastDot).trim()

  if (base === '') base = 'file'

  const room = MEDIA_LIMITS.filename - extension.length - 1

  if (base.length > room) base = base.slice(0, room).trim()

  return `${base}.${extension}`
}

/**
 * The object key. Generated, opaque, and stable for the life of the file.
 *
 * Dated folders are for the owner's benefit if they ever have to look inside
 * the bucket; nothing reads them. The uuid is what makes the key unguessable,
 * and the library's own folders live in the database, not in the key — so
 * moving a file between folders never rewrites an object.
 */
export const buildStorageKey = (extension: string, now: Date = new Date()): string => {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')

  return `media/${year}/${month}/${crypto.randomUUID()}.${extension}`
}

/**
 * A `Content-Disposition` value that survives a non-ASCII name.
 *
 * Both forms, as RFC 6266 asks: a stripped ASCII fallback for old clients and
 * the percent-encoded UTF-8 one everything modern reads.
 */
export const contentDisposition = (fileName: string, mode: 'inline' | 'attachment'): string => {
  const ascii = fileName.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_')

  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}
