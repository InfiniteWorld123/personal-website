/**
 * Reading and writing a dotted path inside the content tree.
 *
 * Deliberately importing nothing: the override store and the editable-field
 * registry both need these, and the registry needs the content tree while the
 * store is needed *by* the content tree. Keeping the two helpers on their own
 * is what stops that from becoming an import cycle.
 */

export type ContentValue = string | string[] | number

/** `home.process.steps.0.title`, or `home.hero.typed[]` for a list. */
export const readContentPath = (root: unknown, path: string): ContentValue | undefined => {
  const segments = path.replace(/\[\]$/, '').split('.')
  let cursor: unknown = root

  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = (cursor as Record<string, unknown>)[segment]
  }

  if (typeof cursor === 'string' || typeof cursor === 'number') return cursor
  if (Array.isArray(cursor) && cursor.every((entry) => typeof entry === 'string')) return cursor

  return undefined
}

/**
 * Writes a value back at `path`. A path that does not already exist is
 * ignored rather than created: an override is a replacement for something the
 * code ships, and a stored key that no longer exists must not grow a new
 * branch on the content tree.
 */
export const writeContentPath = (root: unknown, path: string, value: ContentValue): void => {
  const segments = path.replace(/\[\]$/, '').split('.')
  const last = segments.pop()
  if (!last) return

  let cursor: unknown = root

  for (const segment of segments) {
    if (cursor === null || typeof cursor !== 'object') return
    cursor = (cursor as Record<string, unknown>)[segment]
  }

  if (cursor === null || typeof cursor !== 'object') return
  if (!Object.hasOwn(cursor as object, last)) return

  ;(cursor as Record<string, unknown>)[last] = value
}
