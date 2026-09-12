import * as v from 'valibot'
import {
  RichTextDocSchema,
  type RichTextDoc,
  emptyRichTextDoc,
  isRichTextEmpty,
} from './rich-text'

/**
 * The same three languages the rest of the site publishes. Written out here
 * rather than imported from the projects module so the two contracts can be
 * read on their own; the database enforces the same list in a CHECK.
 */
export const POST_LANGUAGES = ['de', 'en', 'ar'] as const

export type PostLanguage = (typeof POST_LANGUAGES)[number]

const trimmed = (message: string, max: number) =>
  v.pipe(v.string(message), v.trim(), v.nonEmpty(message), v.maxLength(max, 'That text is too long'))

const perLanguage = <TSchema extends v.GenericSchema>(schema: TSchema) =>
  v.object({ de: v.optional(schema), en: v.optional(schema), ar: v.optional(schema) })

/** Part of a public URL, so the shape is fixed, as it is for projects. */
export const PostSlugSchema = v.pipe(
  v.string('A slug is required'),
  v.trim(),
  v.toLowerCase(),
  v.nonEmpty('A slug is required'),
  v.maxLength(100, 'That slug is too long'),
  v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens'),
)

const draftText = (max: number) =>
  v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max, 'That text is too long'))

/**
 * One language of an article. Only the title is required: an unfinished draft
 * has to be saveable, and `missingPublishRequirements` is what keeps it off
 * the public site until it is finished.
 */
export const PostTranslationSchema = v.object({
  title: trimmed('A title is required', 200),
  /**
   * Plain text on purpose. It is the card summary, the meta description, and
   * the feed description, and none of those render markup.
   */
  excerpt: draftText(400),
  body: v.optional(RichTextDocSchema, emptyRichTextDoc),
  /** Alt text for the cover in this language; required only when there is one. */
  coverAlt: draftText(500),
})

export type PostTranslationInput = v.InferOutput<typeof PostTranslationSchema>

export const PostCoverSchema = v.object({
  /** A public path today; an R2 object key once the upload block lands. */
  src: trimmed('An image path is required', 500),
  width: v.pipe(v.number('Width is required'), v.integer(), v.minValue(1), v.maxValue(10_000)),
  height: v.pipe(v.number('Height is required'), v.integer(), v.minValue(1), v.maxValue(10_000)),
})

export type PostCoverInput = v.InferOutput<typeof PostCoverSchema>

/**
 * An ISO date with no time part: the reader sees a day, and a feed built from
 * a day is stable no matter which hour the save happened.
 */
const PublishedOnSchema = v.pipe(
  v.nullish(v.string(), null),
  v.transform((value) => (value === null || value.trim() === '' ? null : value.trim())),
  v.nullable(v.pipe(v.string(), v.isoDate('Use a date like 2026-09-12'))),
)

/** One save replaces the whole post, translations and tag links included. */
export const PostWriteSchema = v.object({
  slug: PostSlugSchema,
  /** The case study this article is about, if it is about one. */
  projectId: v.nullish(v.pipe(v.string(), v.uuid('That is not a project id')), null),
  cover: v.nullish(PostCoverSchema, null),
  isPublished: v.boolean(),
  publishedOn: PublishedOnSchema,
  tagIds: v.pipe(
    v.array(v.pipe(v.string(), v.uuid('That is not a tag id'))),
    v.maxLength(8, 'Eight tags is already more than a reader will scan'),
  ),
  translations: perLanguage(PostTranslationSchema),
})

export type PostWriteInput = v.InferOutput<typeof PostWriteSchema>

/** A tag is a handful of words, so all three languages are required outright. */
export const TagWriteSchema = v.object({
  slug: PostSlugSchema,
  names: v.object({
    de: trimmed('A German name is required', 60),
    en: trimmed('An English name is required', 60),
    ar: trimmed('An Arabic name is required', 60),
  }),
})

export type TagWriteInput = v.InferOutput<typeof TagWriteSchema>

export const POST_PUBLISHED_FILTERS = ['all', 'published', 'draft'] as const

export type PostPublishedFilter = (typeof POST_PUBLISHED_FILTERS)[number]

export const POST_PAGE_SIZE = 20

/**
 * List filters arrive as query-string values, so every field coerces from a
 * string and falls back rather than rejecting: a hand-edited URL narrows the
 * list, it never produces an error page.
 */
export const PostFilterSchema = v.object({
  search: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(120)),
  published: v.optional(v.picklist(POST_PUBLISHED_FILTERS), 'all'),
  tag: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(100)),
  page: v.pipe(
    v.optional(v.union([v.string(), v.number()]), 1),
    v.transform((value) => Number(value)),
    v.number(),
    v.integer(),
    v.minValue(1),
  ),
})

export type PostFilterInput = v.InferOutput<typeof PostFilterSchema>

/**
 * A published post is one a visitor can read in any of the three languages —
 * the same rule projects follow, decided in D23. Shared with the frontend so
 * the publish toggle can explain itself before the request is sent.
 */
export const missingPublishRequirements = (input: {
  cover: PostCoverInput | null
  translations: Partial<Record<PostLanguage, Partial<PostTranslationInput>>>
}): string[] => {
  const missing: string[] = []

  for (const language of POST_LANGUAGES) {
    const translation = input.translations[language]
    const label = language.toUpperCase()

    if (!translation) {
      missing.push(`The ${label} translation is missing`)
      continue
    }

    if (!translation.title?.trim()) missing.push(`${label}: the title is empty`)
    if (!translation.excerpt?.trim()) missing.push(`${label}: the summary is empty`)

    if (!translation.body || isRichTextEmpty(translation.body as RichTextDoc)) {
      missing.push(`${label}: the article is empty`)
    }

    if (input.cover && !translation.coverAlt?.trim()) {
      missing.push(`${label}: the cover image has no alt text`)
    }
  }

  return missing
}
