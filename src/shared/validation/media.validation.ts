import * as v from 'valibot'

/**
 * Where an upload may land. A prefix is chosen from this list by the server,
 * never taken from the request as a free string — a path supplied by the
 * caller has no business deciding where a file is written.
 */
export const MEDIA_PREFIXES = ['projects', 'posts'] as const

export type MediaPrefix = (typeof MEDIA_PREFIXES)[number]

export const MediaPrefixSchema = v.picklist(MEDIA_PREFIXES, 'Unknown upload target')

/**
 * A key this application generated: a known prefix, a UUID, a known
 * extension. Matching it exactly is what stops a delete request from reaching
 * an object it did not create.
 */
export const MediaKeySchema = v.pipe(
  v.string('A storage key is required'),
  v.regex(
    new RegExp(`^(${MEDIA_PREFIXES.join('|')})/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\\.(jpg|png|webp)$`),
    'That is not a key this application issued',
  ),
)

export type MediaUploadResult = {
  key: string
  url: string
  width: number
  height: number
}
