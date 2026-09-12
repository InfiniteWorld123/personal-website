import * as v from 'valibot'

/**
 * The three languages the public site publishes. Repeated here rather than
 * imported from the frontend so the backend never depends on frontend code;
 * the database enforces the same list in a CHECK constraint.
 */
export const PROJECT_LANGUAGES = ['de', 'en', 'ar'] as const

export type ProjectLanguage = (typeof PROJECT_LANGUAGES)[number]

export const PROJECT_STATUSES = ['live', 'building'] as const

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

const trimmed = (message: string, max: number) =>
  v.pipe(v.string(message), v.trim(), v.nonEmpty(message), v.maxLength(max, 'That text is too long'))

/**
 * One value per language, each optional. Written out rather than built from a
 * record so the inferred type names the three keys — the admin form reads
 * `translations.ar` and has to be told when that key does not exist.
 */
const perLanguage = <TSchema extends v.GenericSchema>(schema: TSchema) =>
  v.object({ de: v.optional(schema), en: v.optional(schema), ar: v.optional(schema) })

/** Part of a public URL, so the shape is fixed: lowercase words joined by hyphens. */
export const ProjectSlugSchema = v.pipe(
  v.string('A slug is required'),
  v.trim(),
  v.toLowerCase(),
  v.nonEmpty('A slug is required'),
  v.maxLength(80, 'That slug is too long'),
  v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens'),
)

/**
 * An optional link. An empty string from a cleared form field means "no link",
 * not an invalid URL, so it is normalised to `null` before the check runs.
 */
const OptionalUrlSchema = v.pipe(
  v.nullish(v.string(), null),
  v.transform((value) => (value === null || value.trim() === '' ? null : value.trim())),
  v.nullable(v.pipe(v.string(), v.url('Enter a full URL including https://'), v.maxLength(500))),
)

/**
 * A text field that may still be empty. Drafts are written over several
 * sittings, so an unfinished section must be saveable; what it may not do is
 * reach a visitor, which `missingPublishRequirements` below is what prevents.
 */
const draftText = (max: number) =>
  v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max, 'That text is too long'))

/**
 * One language of a case study. Only the name is required: a translation
 * without one cannot be listed, labelled, or found again in the admin.
 */
export const ProjectTranslationSchema = v.object({
  name: trimmed('A project name is required', 120),
  kind: draftText(80),
  summary: draftText(400),
  problem: draftText(4000),
  approach: draftText(4000),
  shows: draftText(4000),
  features: v.pipe(
    v.array(trimmed('A feature cannot be empty', 240)),
    v.maxLength(16, 'Sixteen features is already too many for one page'),
  ),
})

/** Every field a visitor reads. All of them must be written before publishing. */
export const PROJECT_TRANSLATION_FIELDS = [
  'name',
  'kind',
  'summary',
  'problem',
  'approach',
  'shows',
] as const

export type ProjectTranslationInput = v.InferOutput<typeof ProjectTranslationSchema>

export const ProjectImageSchema = v.object({
  /** A public path today; an R2 object key once the upload block lands. */
  src: trimmed('An image path is required', 500),
  width: v.pipe(v.number('Width is required'), v.integer(), v.minValue(1), v.maxValue(10_000)),
  height: v.pipe(v.number('Height is required'), v.integer(), v.minValue(1), v.maxValue(10_000)),
  isCover: v.boolean(),
  /**
   * Alternative text per language. Partial for the same reason translations
   * are: a draft is allowed to be incomplete, publishing is not.
   */
  alt: perLanguage(trimmed('Alt text cannot be empty', 500)),
})

export type ProjectImageInput = v.InferOutput<typeof ProjectImageSchema>

/**
 * One save replaces the whole project, translations and all. There is exactly
 * one editor, so there is no concurrent-edit merge to get wrong, and a full
 * replace keeps the client from having to diff anything.
 */
export const ProjectWriteSchema = v.object({
  slug: ProjectSlugSchema,
  status: v.picklist(PROJECT_STATUSES, 'Pick a status'),
  websiteUrl: OptionalUrlSchema,
  sourceUrl: OptionalUrlSchema,
  isPublished: v.boolean(),
  tech: v.pipe(
    v.array(trimmed('A technology cannot be empty', 60)),
    v.maxLength(24, 'That is more technologies than a card can show'),
  ),
  images: v.pipe(v.array(ProjectImageSchema), v.maxLength(12, 'Twelve images is the limit')),
  translations: perLanguage(ProjectTranslationSchema),
})

export type ProjectWriteInput = v.InferOutput<typeof ProjectWriteSchema>

export const PROJECT_PUBLISHED_FILTERS = ['all', 'published', 'draft'] as const

export type ProjectPublishedFilter = (typeof PROJECT_PUBLISHED_FILTERS)[number]

export const PROJECT_PAGE_SIZE = 20

/**
 * List filters. They arrive as query-string values, so every field coerces
 * from a string and falls back to a sane default rather than rejecting —
 * a hand-edited URL should narrow a list, never show an error page.
 */
export const ProjectFilterSchema = v.object({
  search: v.pipe(
    v.optional(v.string(), ''),
    v.trim(),
    v.maxLength(120),
  ),
  status: v.optional(v.picklist([...PROJECT_STATUSES, 'all'] as const), 'all'),
  published: v.optional(v.picklist(PROJECT_PUBLISHED_FILTERS), 'all'),
  tech: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(60)),
  page: v.pipe(
    v.optional(v.union([v.string(), v.number()]), 1),
    v.transform((value) => Number(value)),
    v.number(),
    v.integer(),
    v.minValue(1),
  ),
})

export type ProjectFilterInput = v.InferOutput<typeof ProjectFilterSchema>

/** Reordering sends the full ordered list of ids, not one move at a time. */
export const ProjectReorderSchema = v.object({
  ids: v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(200)),
})

export type ProjectReorderInput = v.InferOutput<typeof ProjectReorderSchema>

/**
 * A project may only be published when all three languages are fully written
 * and every image carries alt text in all three. Shared with the frontend so
 * the publish toggle can explain itself before the request is sent.
 */
export const missingPublishRequirements = (input: {
  translations: Partial<Record<ProjectLanguage, Partial<Record<string, unknown>>>>
  images: Array<{ alt: Partial<Record<ProjectLanguage, unknown>> }>
}): string[] => {
  const missing: string[] = []

  for (const language of PROJECT_LANGUAGES) {
    const translation = input.translations[language]
    const label = language.toUpperCase()

    if (!translation) {
      missing.push(`The ${label} translation is missing`)
      continue
    }

    for (const field of PROJECT_TRANSLATION_FIELDS) {
      const value = translation[field]

      if (typeof value !== 'string' || value.trim() === '') {
        missing.push(`${label}: ${field} is empty`)
      }
    }
  }

  input.images.forEach((image, index) => {
    for (const language of PROJECT_LANGUAGES) {
      if (!image.alt[language]) {
        missing.push(`Image ${index + 1} has no ${language.toUpperCase()} alt text`)
      }
    }
  })

  return missing
}
