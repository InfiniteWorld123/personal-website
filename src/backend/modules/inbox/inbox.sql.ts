/** Small shared pieces, so the list and the person page cannot disagree. */

export const toInt = (value: unknown): number =>
  typeof value === 'number' ? value : Number(value ?? 0)

/** Every instant crosses the wire as an ISO string, never as a `Date`. */
export const toIso = (value: Date | string | null): string | null =>
  value === null || value === undefined ? null : new Date(value).toISOString()

export const toIsoRequired = (value: Date | string): string => new Date(value).toISOString()

export const emptyToNull = (value: string | null): string | null =>
  value === null || value.trim() === '' ? null : value

/**
 * The list is sorted on this and nothing else, so it is kept current by every
 * write that adds a letter rather than recomputed per render.
 */
export const TOUCH_PERSON = `
  UPDATE leads SET last_message_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
   WHERE id = $1`
