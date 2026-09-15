import * as v from 'valibot'

export const CONTENT_LANGUAGES = ['de', 'en', 'ar', '*'] as const

export const CONTENT_EDIT_LANGUAGES = ['de', 'en', 'ar'] as const

/**
 * A stored value: a sentence, a list of sentences, or a price.
 *
 * The caps are here rather than in the service because they are part of the
 * contract: the editor's own character counter is advice about how the wording
 * will look, while these are the limits a request may not exceed at all.
 */
export const ContentValueSchema = v.union([
  v.pipe(v.string(), v.maxLength(6000, 'That text is too long to store')),
  v.pipe(
    v.array(v.pipe(v.string(), v.maxLength(600))),
    v.maxLength(24, 'That list has too many entries'),
  ),
  v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000_000)),
])

export const ContentKeySchema = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, 'A key is required'),
  v.maxLength(200),
)

/** Saving is always a draft. Publishing is a separate, deliberate request. */
export const ContentSaveSchema = v.object({
  key: ContentKeySchema,
  language: v.picklist(CONTENT_LANGUAGES),
  value: ContentValueSchema,
})

/** Restores the code's own wording by clearing the stored draft. */
export const ContentResetSchema = v.object({
  key: ContentKeySchema,
  language: v.picklist(CONTENT_LANGUAGES),
})

export const ContentRevertSchema = v.object({
  revisionId: v.pipe(v.string(), v.uuid('That is not a valid revision')),
})

/** Clears the review flag once the owner has looked at the other language. */
export const ContentReviewedSchema = v.object({
  key: ContentKeySchema,
  language: v.picklist(CONTENT_EDIT_LANGUAGES),
})

export type ContentSaveInput = v.InferOutput<typeof ContentSaveSchema>
export type ContentResetInput = v.InferOutput<typeof ContentResetSchema>
export type ContentRevertInput = v.InferOutput<typeof ContentRevertSchema>
export type ContentReviewedInput = v.InferOutput<typeof ContentReviewedSchema>
