import * as v from 'valibot'
import {
  LANGUAGES,
  type Language,
  type PublicRichTextNode,
  SLUG_PATTERN,
  slugify,
} from './project.contract'
import {
  type RichTextDoc,
  type RichTextNode,
  RichTextNodeSchema,
  collectImageNodes,
  collectMediaIds,
  richTextToPlainText,
} from './rich-text.contract'

/**
 * The Blog contract, shared by the server and the Dashboard editor.
 *
 * See `docs/v2/blog.md`.
 *
 * Pure — valibot and plain TypeScript, nothing server-only — for the reason the
 * Projects and Services contracts are: the editor has to draw the publication
 * checklist before anything is sent, and the server enforces the identical
 * rules afterwards. One file, one set of rules.
 *
 * The three languages, the web-address rule and the rich-text nodes come from
 * the existing contracts rather than being copied: an address means the same
 * thing in every module, and a heading is a heading whether it sits in a case
 * study or an article. What the Blog adds is its own document — the same nodes
 * plus a YouTube video — and its own limits.
 */

export { LANGUAGES, slugify }
export type { Language }

/* ----------------------------------------------------------------- the words */

/** Upper-cased for the blocker sentences: "AR: the title is empty". */
const LANGUAGE_LABEL: Record<Language, string> = { de: 'DE', en: 'EN', ar: 'AR' }

/** `docs/v2/blog.md`: "The visible author is always Yaman Warda." */
export const BLOG_AUTHOR_NAME = 'Yaman Warda' as const

/** Where a scheduled time is read. The owner picks a wall-clock time here. */
export const BLOG_TIME_ZONE = 'Europe/Berlin' as const

/**
 * Derived on every read, never stored twice.
 *
 * `scheduled` sits between the two ends because it is exactly that: frozen and
 * waiting, not yet something a visitor can read.
 */
export const BLOG_STATES = [
  'draft',
  'scheduled',
  'published',
  'published_with_pending_changes',
  'unpublished',
] as const
export type BlogState = (typeof BLOG_STATES)[number]

/** What the Dashboard list may filter by. `pending` is a short alias. */
export const BLOG_LIST_STATES = ['all', ...BLOG_STATES, 'pending'] as const
export type BlogListState = (typeof BLOG_LIST_STATES)[number]

/**
 * How the Dashboard list is ordered. Articles have no manual order — the blog
 * is chronological — so the owner chooses which date to sort by.
 */
export const BLOG_LIST_SORTS = ['updated', 'created', 'published'] as const
export type BlogListSort = (typeof BLOG_LIST_SORTS)[number]

/* ---------------------------------------------------------------- the limits */

export const BLOG_LIMITS = {
  /** The same ceiling as a project's or a service's address. */
  slug: 80,
  title: 160,
  summary: 400,
  seoTitle: 80,
  seoDescription: 200,
  altText: 500,
  tagsPerArticle: 10,
  /** Per language. An article is writing with pictures, not an album. */
  inlineImagesPerLanguage: 30,
  videosPerLanguage: 10,
  /** Distinct library files across the cover and all three bodies. */
  filesPerArticle: 60,
  /** Characters of text in one language's body. */
  bodyCharacters: 100_000,
  videoTitle: 200,
  /** A start offset of at most a day, in seconds. */
  videoStartSeconds: 86_400,
} as const

export const TAG_LIMITS = { slug: 60, name: 40 } as const

/** The Dashboard lists, as Projects and Services: pages of 20, at most 50. */
export const BLOG_PAGE_SIZE = { min: 1, default: 20, max: 50 } as const
export const TAG_PAGE_SIZE = { min: 1, default: 50, max: 100 } as const
export const OWNER_COMMENT_PAGE = { min: 1, default: 20, max: 50 } as const

/**
 * One public batch. Nine is what `/blog` already shows per "Load more"; the
 * ceiling lets a deep link to page four arrive in one bounded request.
 */
export const PUBLIC_BLOG_BATCH = { min: 1, default: 9, max: 36, maxOffset: 1000 } as const

/** The public tag filter is a row of chips, not a browsable list. Still bounded. */
export const PUBLIC_TAG_LIMIT = 100

export const PUBLIC_COMMENT_PAGE = { min: 1, default: 10, max: 30 } as const
export const PUBLIC_REPLY_PAGE = { min: 1, default: 10, max: 50 } as const

/**
 * The comment rules. `docs/v2/blog.md` leaves the exact thresholds to
 * engineering, "to document and test before release"; these are those
 * numbers, and `docs/v2/blog.md` records why each one is what it is.
 */
export const COMMENT_LIMITS = {
  /** Characters, after the text is normalised. */
  body: 3000,
  /** More than this many links is a promotion, not a comment. */
  links: 2,
  /** Levels, a thread's first comment being level one. */
  depth: 20,
  /**
   * Below this length a text is too ordinary to call a copy — "Thanks!" — so
   * only the same reader repeating it counts as a duplicate. At or above it,
   * the same words on the same article within a day are refused from anyone.
   */
  duplicateMinLength: 20,
} as const

/**
 * How often comments may arrive. `source` limits count per sender — a keyed
 * hash of the address, kept in the shared rate-limit table and forgotten
 * within two days, never stored with the comment. `article` limits count per
 * article, whoever sends, so a flood from many addresses is still bounded.
 */
export const COMMENT_RATE_LIMITS = [
  { scope: 'blog-comment-minute', per: 'source', limit: 3, windowSeconds: 60 },
  { scope: 'blog-comment-hour', per: 'source', limit: 15, windowSeconds: 60 * 60 },
  { scope: 'blog-comment-article', per: 'article', limit: 100, windowSeconds: 60 * 60 },
] as const

/**
 * The counters' limits, per sender and hour. Loose on purpose: somebody reading
 * five articles in a row is a good afternoon, not an attack, and a limit that
 * fired on real reading would make the figures wrong in the one direction that
 * matters.
 */
export const ENGAGEMENT_RATE_LIMITS = {
  read: { scope: 'blog-read', limit: 120, windowSeconds: 60 * 60 },
  like: { scope: 'blog-like', limit: 60, windowSeconds: 60 * 60 },
} as const

export const READING_WORDS_PER_MINUTE = 200

/** A schedule that ran later than this is reported to the owner as late. */
export const SCHEDULE_LATE_AFTER_MINUTES = 5

/** How far ahead a publication may be scheduled. */
export const SCHEDULE_HORIZON_DAYS = 366

/* ------------------------------------------------------------- the document */

/**
 * A YouTube video, by its id and nothing else.
 *
 * `docs/v2/blog.md`: "do not accept arbitrary executable HTML or arbitrary
 * embed code." So the server never sees an `<iframe>`, a URL or a player
 * option it did not name: the editor extracts the eleven-character id from
 * whatever the owner pasted, and the website builds the player from that id
 * alone. The title is the frame's accessible name in this language.
 */
export type YoutubeNode = {
  type: 'youtube'
  attrs: { videoId: string; start: number | null; title: string }
}

/** A node of an article: every case-study node, plus a video at the top level. */
export type BlogNode = RichTextNode | YoutubeNode

export type BlogDoc = { type: 'doc'; content: BlogNode[] }

export const emptyBlogDoc = (): BlogDoc => ({ type: 'doc', content: [] })

export const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/**
 * The video id in whatever the owner pasted: a bare id, a watch link, a short
 * link, a Shorts or embed address. Anything else is null. The link itself is
 * never stored.
 */
export const youtubeVideoIdFrom = (input: string): string | null => {
  const value = input.trim()

  if (YOUTUBE_VIDEO_ID.test(value)) return value

  let url: URL

  try {
    url = new URL(value)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '')
  let id: string | null = null

  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0] ?? null
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else id = /^\/(?:embed|shorts|live|v)\/([^/]+)/.exec(url.pathname)?.[1] ?? null
  }

  return id && YOUTUBE_VIDEO_ID.test(id) ? id : null
}

const YoutubeSchema = v.object({
  type: v.literal('youtube'),
  attrs: v.object({
    videoId: v.pipe(
      v.string('A video needs its YouTube id'),
      v.trim(),
      v.regex(YOUTUBE_VIDEO_ID, 'That is not a YouTube video id'),
    ),
    start: v.nullish(
      v.pipe(
        v.number('A start time is a number of seconds'),
        v.integer('A start time is a whole number of seconds'),
        v.minValue(0, 'A start time cannot be negative'),
        v.maxValue(BLOG_LIMITS.videoStartSeconds, 'That start time is too late'),
      ),
      null,
    ),
    title: v.nullish(
      v.pipe(
        v.string('A video title must be text'),
        v.trim(),
        v.maxLength(BLOG_LIMITS.videoTitle, 'That video title is too long'),
      ),
      '',
    ),
  }),
})

/**
 * One node at the top of an article.
 *
 * A video is allowed only here, never inside a list, a quote or a table cell:
 * a player is a block of its own. Everything else is the case study's node,
 * with the case study's rules, down to the last mark on the last link.
 */
const BlogTopNodeSchema = v.lazy((input) =>
  typeof input === 'object' && input !== null && (input as { type?: unknown }).type === 'youtube'
    ? YoutubeSchema
    : RichTextNodeSchema,
) as v.GenericSchema<BlogNode>

/** The document without its videos, in the shape the shared helpers read. */
const textPart = (doc: BlogDoc): RichTextDoc => ({
  type: 'doc',
  content: doc.content.filter((node): node is RichTextNode => node.type !== 'youtube'),
})

/** Every word in the article, flattened. */
export const blogPlainText = (doc: BlogDoc): string => richTextToPlainText(textPart(doc))

/** Every inline image, in document order, so a blocker can name "image 2". */
export const blogImageNodes = (doc: BlogDoc): Array<{ mediaId: string; alt: string }> =>
  collectImageNodes(textPart(doc))

/** Every library file the body uses, once each, in order. */
export const blogMediaIds = (doc: BlogDoc): string[] => collectMediaIds(textPart(doc))

export const blogVideos = (doc: BlogDoc): YoutubeNode[] =>
  doc.content.filter((node): node is YoutubeNode => node.type === 'youtube')

/**
 * An article body with nothing in it.
 *
 * Words, a picture or a video each make it not empty: an article that is one
 * video with its summary is still an article. Empty paragraphs do not.
 */
export const isBlogBodyEmpty = (doc: BlogDoc | null): boolean =>
  !doc ||
  (blogPlainText(doc) === '' && blogImageNodes(doc).length === 0 && blogVideos(doc).length === 0)

/**
 * Minutes to read, rounded up and never below one.
 */
export const readingMinutesOf = (doc: BlogDoc): number => {
  const words = blogPlainText(doc).split(/\s+/).filter(Boolean).length

  return Math.max(1, Math.ceil(words / READING_WORDS_PER_MINUTE))
}

export const BlogDocSchema: v.GenericSchema<BlogDoc> = v.pipe(
  v.object({
    type: v.literal('doc'),
    content: v.pipe(v.array(BlogTopNodeSchema), v.maxLength(2000, 'That article is too long')),
  }),
  v.check(
    (doc) => blogPlainText(doc as BlogDoc).length <= BLOG_LIMITS.bodyCharacters,
    `One language of an article may hold at most ${BLOG_LIMITS.bodyCharacters.toLocaleString('en')} characters`,
  ),
) as v.GenericSchema<BlogDoc>

/* --------------------------------------------------------------- the payload */

/** The one cover, and its alternative text in each language. */
export type BlogCover = { mediaId: string; alt: Record<Language, string> }

export type BlogTexts = {
  title: string
  /** Plain text: the card, the default meta description, the feed. */
  summary: string
  body: BlogDoc
  /** Optional. Empty means the title is used. */
  seoTitle: string
  /** Optional. Empty means the summary is used. */
  seoDescription: string
}

/** One version of an article: everything a visitor could ever see of it. */
export type BlogDraftInput = {
  slug: string
  cover: BlogCover | null
  projectId: string | null
  tagIds: string[]
  texts: Record<Language, BlogTexts>
}

/**
 * What `PATCH /owner/blog/posts/:id` accepts: only what changes.
 *
 * Every key is optional, down to one field in one language, and a key that is
 * not sent is a key that is not touched. A `null` is a value ("no cover"), not
 * an omission.
 */
export type BlogDraftPatch = {
  slug?: string
  cover?: BlogCover | null
  projectId?: string | null
  tagIds?: string[]
  texts?: Partial<Record<Language, Partial<BlogTexts>>>
}

export const emptyBlogTexts = (): BlogTexts => ({
  title: '',
  summary: '',
  body: emptyBlogDoc(),
  seoTitle: '',
  seoDescription: '',
})

export const emptyBlogDraft = (): BlogDraftInput => ({
  slug: '',
  cover: null,
  projectId: null,
  tagIds: [],
  texts: { de: emptyBlogTexts(), en: emptyBlogTexts(), ar: emptyBlogTexts() },
})

/* ------------------------------------------------------------- the schemas */

const text = (max: number, label: string) =>
  v.pipe(v.string(`${label} must be text`), v.trim(), v.maxLength(max, `${label} is too long`))

/** Line endings made one kind, so a Windows paste and a Mac paste are equal. */
const plain = (max: number, label: string) =>
  v.pipe(
    v.string(`${label} must be text`),
    v.transform((value) => value.replace(/\r\n?/g, '\n')),
    v.trim(),
    v.maxLength(max, `${label} is too long`),
  )

const uuid = (message: string) => v.pipe(v.string(message), v.trim(), v.uuid(message))

const SlugSchema = v.pipe(
  v.string('The web address must be text'),
  v.trim(),
  v.maxLength(BLOG_LIMITS.slug, 'That address is too long'),
  v.check(
    (value) => value === '' || SLUG_PATTERN.test(value),
    'A web address may use lowercase letters, numbers and single hyphens only',
  ),
)

const AltSchema = v.pipe(
  v.optional(v.string('Alternative text must be text'), ''),
  v.trim(),
  v.maxLength(BLOG_LIMITS.altText, 'That alternative text is too long'),
)

const CoverSchema = v.object({
  mediaId: uuid('That is not a file from Media'),
  alt: v.object({ de: AltSchema, en: AltSchema, ar: AltSchema }),
})

const TagIdsSchema = v.pipe(
  v.array(uuid('That is not a tag'), 'Tags must be a list'),
  v.maxLength(BLOG_LIMITS.tagsPerArticle, `An article may carry at most ${BLOG_LIMITS.tagsPerArticle} tags`),
  v.check((ids) => new Set(ids).size === ids.length, 'The same tag is listed twice'),
)

const TEXT_FIELDS = {
  title: text(BLOG_LIMITS.title, 'The title'),
  summary: plain(BLOG_LIMITS.summary, 'The summary'),
  body: v.nullish(BlogDocSchema, emptyBlogDoc),
  seoTitle: text(BLOG_LIMITS.seoTitle, 'The search title'),
  seoDescription: plain(BLOG_LIMITS.seoDescription, 'The search description'),
} as const

const TextsSchema = v.object({
  title: v.optional(TEXT_FIELDS.title, ''),
  summary: v.optional(TEXT_FIELDS.summary, ''),
  body: TEXT_FIELDS.body,
  seoTitle: v.optional(TEXT_FIELDS.seoTitle, ''),
  seoDescription: v.optional(TEXT_FIELDS.seoDescription, ''),
})

const TextsPatchSchema = v.object({
  title: v.optional(TEXT_FIELDS.title),
  summary: v.optional(TEXT_FIELDS.summary),
  body: v.optional(TEXT_FIELDS.body),
  seoTitle: v.optional(TEXT_FIELDS.seoTitle),
  seoDescription: v.optional(TEXT_FIELDS.seoDescription),
})

const RevisionField = v.pipe(
  v.number('Send the revision you are editing'),
  v.integer('A revision is a whole number'),
  v.minValue(1, 'A revision starts at 1'),
)

/**
 * The rules no single field can check on its own. Sentences, collected rather
 * than thrown at the first, because the editor draws a list.
 *
 * These are *save* rules — an article over them cannot be stored at all.
 * What an article needs before a visitor may read it is `blogPublishIssues`.
 */
export const blogDraftIssues = (draft: BlogDraftInput): string[] => {
  const issues: string[] = []

  for (const language of LANGUAGES) {
    const body = draft.texts[language].body
    const label = LANGUAGE_LABEL[language]

    if (blogImageNodes(body).length > BLOG_LIMITS.inlineImagesPerLanguage) {
      issues.push(
        `${label}: an article may hold at most ${BLOG_LIMITS.inlineImagesPerLanguage} images`,
      )
    }

    if (blogVideos(body).length > BLOG_LIMITS.videosPerLanguage) {
      issues.push(`${label}: an article may hold at most ${BLOG_LIMITS.videosPerLanguage} videos`)
    }
  }

  if (blogFileIds(draft).length > BLOG_LIMITS.filesPerArticle) {
    issues.push(`An article may use at most ${BLOG_LIMITS.filesPerArticle} files from Media`)
  }

  return issues
}

/** A whole version, shape and limits only. An unfinished draft must stay saveable. */
export const BlogDraftSchema = v.pipe(
  v.object({
    slug: v.optional(SlugSchema, ''),
    cover: v.nullish(CoverSchema, null),
    projectId: v.nullish(uuid('That is not a project'), null),
    tagIds: v.optional(TagIdsSchema, () => []),
    texts: v.optional(
      v.object({
        de: v.optional(TextsSchema, emptyBlogTexts),
        en: v.optional(TextsSchema, emptyBlogTexts),
        ar: v.optional(TextsSchema, emptyBlogTexts),
      }),
      () => ({ de: emptyBlogTexts(), en: emptyBlogTexts(), ar: emptyBlogTexts() }),
    ),
  }),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return

    for (const message of blogDraftIssues(dataset.value as BlogDraftInput)) addIssue({ message })
  }),
) as unknown as v.GenericSchema<unknown, BlogDraftInput>

/** The body of `PATCH /owner/blog/posts/:id`: the revision guard and a patch. */
export const BlogPatchSchema = v.object({
  // The editor sends back what it was given; a stale value means a second tab
  // saved in between, and that is a 409 rather than a silent overwrite.
  draftRevision: RevisionField,
  slug: v.optional(SlugSchema),
  cover: v.optional(v.nullable(CoverSchema)),
  projectId: v.optional(v.nullable(uuid('That is not a project'))),
  tagIds: v.optional(TagIdsSchema),
  texts: v.optional(
    v.object({
      de: v.optional(TextsPatchSchema),
      en: v.optional(TextsPatchSchema),
      ar: v.optional(TextsPatchSchema),
    }),
  ),
})

export type BlogPatchBody = v.InferOutput<typeof BlogPatchSchema>

export const CreateBlogPostSchema = v.object({
  title: v.optional(TEXT_FIELDS.title, ''),
  /** Which language that title is written in. A draft may use only one. */
  language: v.optional(v.picklist(LANGUAGES, 'Choose de, en or ar'), 'en'),
})

export const BlogRevisionSchema = v.object({ draftRevision: RevisionField })

export const BlogDeleteSchema = v.object({
  confirm: v.string('Send the article id to confirm'),
})

/**
 * A schedule, as the owner chose it: a date and a time on the clock in Berlin.
 *
 * `snapshot: 'draft'` freezes the saved draft now, replacing any earlier
 * snapshot. `'keep'` moves an existing schedule to a new time and leaves its
 * frozen content exactly as it was — `docs/v2/blog.md`: "Later manual saves do
 * not alter what will publish."
 */
export const BlogScheduleSchema = v.object({
  draftRevision: RevisionField,
  date: v.pipe(
    v.string('Send the date'),
    v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Send the date as YYYY-MM-DD'),
  ),
  time: v.pipe(v.string('Send the time'), v.regex(/^\d{2}:\d{2}$/, 'Send the time as HH:MM')),
  snapshot: v.optional(v.picklist(['draft', 'keep'] as const, 'Choose draft or keep'), 'draft'),
})

export const BlogCommentsSettingSchema = v.object({
  enabled: v.boolean('Send enabled: true or false'),
})

/* ------------------------------------------------------------ the arithmetic */

const pick = <T>(next: T | undefined, current: T): T => (next === undefined ? current : next)

/**
 * A patch laid over the stored version.
 *
 * Pure, so the Dashboard can show the exact result of a save before sending
 * it, and so "what you did not send, you did not change" is one function with
 * its own tests rather than a property of some SQL.
 */
export const mergeBlogDraft = (current: BlogDraftInput, patch: BlogDraftPatch): BlogDraftInput => {
  const texts = { ...current.texts }

  for (const language of LANGUAGES) {
    const change = patch.texts?.[language]

    if (!change) continue

    const before = current.texts[language]

    texts[language] = {
      title: pick(change.title, before.title),
      summary: pick(change.summary, before.summary),
      body: pick(change.body, before.body),
      seoTitle: pick(change.seoTitle, before.seoTitle),
      seoDescription: pick(change.seoDescription, before.seoDescription),
    }
  }

  return {
    slug: pick(patch.slug, current.slug),
    cover: pick(patch.cover, current.cover),
    projectId: pick(patch.projectId, current.projectId),
    tagIds: pick(patch.tagIds, current.tagIds),
    texts,
  }
}

/**
 * JSON with its keys in one fixed order, all the way down.
 *
 * A body read back from PostgreSQL does not keep the key order it was written
 * in — `jsonb` sorts them — so two equal documents can stringify differently.
 * This is what makes "equal" mean equal. A missing key and an `undefined` one
 * are the same thing.
 */
export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>

    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value ?? null)
}

/**
 * The same version, as one comparable string.
 *
 * Two versions are equal exactly when these are. That is how a save that
 * changes nothing is recognised as nothing, and how undoing an edit on a live
 * article leaves it "Live" rather than "Live · edited".
 */
export const canonicalBlogDraft = (draft: BlogDraftInput): string =>
  stableStringify({
    slug: draft.slug,
    cover: draft.cover,
    projectId: draft.projectId,
    tagIds: draft.tagIds,
    texts: LANGUAGES.map((language) => [language, draft.texts[language]]),
  })

/**
 * What the article *says*: its titles, summaries, bodies and cover.
 *
 * `docs/v2/blog.md`: "Show a last-updated date after a real published update.
 * Do not bump the original date merely to appear fresh." A Publish update
 * whose substance equals what was live — a new tag, a better search
 * description, a corrected alternative text — is not an update a reader would
 * call one, so it leaves the date alone.
 */
export const blogSubstance = (draft: BlogDraftInput): string =>
  stableStringify({
    cover: draft.cover?.mediaId ?? null,
    texts: LANGUAGES.map((language) => [
      language,
      draft.texts[language].title,
      draft.texts[language].summary,
      draft.texts[language].body,
    ]),
  })

/** Every distinct library file one version uses: the cover, then each body's images. */
export const blogFileIds = (draft: BlogDraftInput): string[] => {
  const ids = new Set<string>()

  if (draft.cover) ids.add(draft.cover.mediaId)

  for (const language of LANGUAGES) {
    for (const id of blogMediaIds(draft.texts[language].body)) ids.add(id)
  }

  return [...ids]
}

/* ---------------------------------------------------- the publication rules */

export type BlogPublishIssue = {
  /** Where the editor should put the message: `slug`, `texts.ar.title`, `cover.alt.de`... */
  field: string
  message: string
}

/**
 * What must be true before a visitor reads it — for Publish, for Publish
 * update and for Schedule alike.
 *
 * `docs/v2/blog.md`: a complete title, short summary and non-empty body in all
 * three languages; when there is a cover, its alternative text in all three;
 * every inline image with alternative text in its own language. SEO overrides
 * and the cover itself are optional.
 *
 * Each issue names its field, so the editor can show a blocker next to what
 * it is about. Whether the address is *free* is not checked here — that needs
 * the database, and it is a 409, not a missing field.
 */
export const blogPublishIssues = (draft: BlogDraftInput): BlogPublishIssue[] => {
  const issues: BlogPublishIssue[] = []

  if (draft.slug === '') issues.push({ field: 'slug', message: 'The web address is empty' })
  else if (!isValidBlogSlug(draft.slug)) {
    issues.push({ field: 'slug', message: 'The web address is not valid' })
  }

  for (const language of LANGUAGES) {
    const label = LANGUAGE_LABEL[language]
    const texts = draft.texts[language]

    if (texts.title.trim() === '') {
      issues.push({ field: `texts.${language}.title`, message: `${label}: the title is empty` })
    }

    if (texts.summary.trim() === '') {
      issues.push({ field: `texts.${language}.summary`, message: `${label}: the summary is empty` })
    }

    if (isBlogBodyEmpty(texts.body)) {
      issues.push({ field: `texts.${language}.body`, message: `${label}: the article is empty` })
    }
  }

  if (draft.cover) {
    for (const language of LANGUAGES) {
      if (draft.cover.alt[language].trim() === '') {
        issues.push({
          field: `cover.alt.${language}`,
          message: `The cover image has no ${LANGUAGE_LABEL[language]} alternative text`,
        })
      }
    }
  }

  for (const language of LANGUAGES) {
    blogImageNodes(draft.texts[language].body).forEach((image, index) => {
      if (image.alt.trim() === '') {
        issues.push({
          field: `texts.${language}.body`,
          message: `${LANGUAGE_LABEL[language]}: image ${index + 1} in the article has no alternative text`,
        })
      }
    })
  }

  return issues
}

/** The same issues as sentences, for the checklist and the 422 details. */
export const publishBlockers = (draft: BlogDraftInput): string[] =>
  blogPublishIssues(draft).map((issue) => issue.message)

export const isValidBlogSlug = (slug: string): boolean =>
  slug.length > 0 && slug.length <= BLOG_LIMITS.slug && SLUG_PATTERN.test(slug)

/** A suggested address from a title. Arabic alone suggests nothing. */
export const suggestBlogSlug = (title: string): string => slugify(title)

/**
 * The title and description search engines and social cards get: the owner's
 * override, or the title and the summary.
 */
export const resolveBlogSeo = (
  texts: Pick<BlogTexts, 'title' | 'summary' | 'seoTitle' | 'seoDescription'>,
): { title: string; description: string } => ({
  title: texts.seoTitle.trim() || texts.title,
  description: texts.seoDescription.trim() || texts.summary,
})

/* ------------------------------------------------------- Berlin wall time */

export type BerlinWallTime = { date: string; time: string }

const berlinParts = (instant: Date) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BLOG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN)

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  }
}

const pad = (value: number): string => String(value).padStart(2, '0')

/** An instant, as the clock in Berlin shows it. */
export const instantToBerlinWallTime = (instant: Date): BerlinWallTime => {
  const parts = berlinParts(instant)

  return {
    date: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    time: `${pad(parts.hour)}:${pad(parts.minute)}`,
  }
}

/**
 * A date and time on the clock in Berlin, as an instant — or null when that
 * time does not exist there.
 *
 * Berlin is one or two hours ahead of UTC, so the two candidates are tried and
 * kept only if Berlin's clock really reads the time asked for at that instant.
 * On the last Sunday of March the clocks jump from 02:00 to 03:00, so 02:30
 * matches neither and is refused. On the last Sunday of October 02:30 happens
 * twice; the earlier one, still summer time, is chosen, so the answer is the
 * same every time it is asked.
 *
 * Here rather than on the server alone so the editor and the server read a
 * chosen time identically, whatever time zone the owner's laptop is set to.
 */
export const berlinWallTimeToInstant = (date: string, time: string): Date | null => {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time)

  if (!dateMatch || !timeMatch) return null

  const [year, month, day] = [Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3])]
  const [hour, minute] = [Number(timeMatch[1]), Number(timeMatch[2])]

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null

  const asIfUtc = Date.UTC(year, month - 1, day, hour, minute)

  // 31 February rolls over into March; refuse it rather than move it.
  if (new Date(asIfUtc).getUTCDate() !== day) return null

  for (const offsetMinutes of [120, 60]) {
    const candidate = new Date(asIfUtc - offsetMinutes * 60_000)
    const shown = berlinParts(candidate)

    if (
      shown.year === year &&
      shown.month === month &&
      shown.day === day &&
      shown.hour === hour &&
      shown.minute === minute
    ) {
      return candidate
    }
  }

  return null
}

/* ----------------------------------------------------------------- comments */

/**
 * Characters nobody types on purpose, removed before anything else looks at
 * the text: control characters other than a line break and a tab, the
 * byte-order mark, and the explicit bidirectional overrides that can make a
 * comment display in a different order than it was written. The joiners Arabic
 * and emoji rely on are kept.
 */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‪-‮⁦-⁩﻿]/g

/**
 * A comment as it will be stored: one kind of line break, no invisible
 * control characters, no trailing spaces on a line, never more than one blank
 * line in a row, and nothing around the edges.
 */
export const normalizeCommentText = (raw: string): string =>
  raw
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export const countCommentLinks = (text: string): number =>
  (text.match(/(?:https?:\/\/|www\.)\S+/gi) ?? []).length

/**
 * Markup that would *do* something if a browser ever interpreted it: a link,
 * a script, a frame, an event handler, a forum-style link.
 *
 * Deliberately narrow. A comment on a web-development blog may well say "put
 * it in a `<script>` tag" or mention `<img>`, and that is ordinary text — it
 * is shown escaped, like every comment. What is refused is the shape spam and
 * injection attempts take, which a person asking a question does not write.
 */
const MARKUP = [
  /<a\s[^<>]*\bhref\s*=/i,
  /<script\b[^<>]*>[\s\S]*?<\/script\s*>/i,
  /<script\b[^<>]*\bsrc\s*=/i,
  /<iframe\b[^<>]*\bsrc\s*=/i,
  /<[a-z][^<>]*\son[a-z]+\s*=[^<>]*>/i,
  /\[(?:url|link)[=\]]/i,
]

export type CommentProblem = 'empty' | 'too_long' | 'too_many_links' | 'markup'

/**
 * What is wrong with a comment, or null. The text must already be normalised.
 *
 * Only shape, never sentiment: `docs/v2/blog.md` is explicit that ordinary
 * disagreement or criticism must not be suppressed. The owner's own replies
 * are held to the length rule only.
 */
export const commentProblem = (
  normalized: string,
  author: 'visitor' | 'owner' = 'visitor',
): CommentProblem | null => {
  if (normalized === '') return 'empty'
  if (normalized.length > COMMENT_LIMITS.body) return 'too_long'
  if (author === 'owner') return null
  if (MARKUP.some((pattern) => pattern.test(normalized))) return 'markup'
  if (countCommentLinks(normalized) > COMMENT_LIMITS.links) return 'too_many_links'

  return null
}

/**
 * Why a comment was refused, as a stable word the website translates. The
 * English sentences are what the API itself says.
 */
export const COMMENT_REFUSALS = {
  empty: 'Write something before posting.',
  too_long: `A comment may be at most ${COMMENT_LIMITS.body.toLocaleString('en')} characters.`,
  too_many_links: `A comment may contain at most ${COMMENT_LIMITS.links} links.`,
  markup: 'Comments are plain text. Remove the HTML code and try again.',
  closed: 'Comments are closed for this article.',
  duplicate: 'This comment has already been posted.',
  too_fast: 'You are commenting very quickly. Wait a few minutes and try again.',
  too_deep: 'This conversation is too deep to continue here. Reply to an earlier comment instead.',
  gone: 'That comment is no longer there. Reload the comments and try again.',
  rejected: 'Your comment could not be posted.',
} as const

export type CommentRefusal = keyof typeof COMMENT_REFUSALS

export const CommentSubmitSchema = v.object({
  // Bounded before normalisation too, so an enormous body is refused without
  // being scanned.
  body: v.pipe(
    v.string('Write your comment as text'),
    v.maxLength(COMMENT_LIMITS.body * 2, COMMENT_REFUSALS.too_long),
  ),
  parentId: v.nullish(uuid('That is not a comment'), null),
  /**
   * A field the page hides from people. A person never fills it in; a script
   * that fills every field it finds does.
   */
  website: v.optional(v.pipe(v.string(), v.maxLength(500)), ''),
})

export const OwnerReplySchema = v.object({
  body: v.pipe(
    v.string('Write the reply as text'),
    v.maxLength(COMMENT_LIMITS.body * 2, COMMENT_REFUSALS.too_long),
  ),
})

/**
 * Which comments the owner has now seen: a list of ids, every new one on one
 * article, or every new one anywhere.
 */
export const MarkCommentsSeenSchema = v.object({
  ids: v.optional(v.pipe(v.array(uuid('That is not a comment')), v.maxLength(100)), () => []),
  postId: v.optional(uuid('That is not an article')),
  all: v.optional(v.boolean(), false),
})

export const LikeSchema = v.object({
  liked: v.boolean('Send liked: true or false'),
})

/* ---------------------------------------------------------------------- tags */

const TagNameSchema = v.pipe(
  v.string('A tag name must be text'),
  v.trim(),
  v.nonEmpty('Give the tag a name in every language'),
  v.maxLength(TAG_LIMITS.name, `A tag name is at most ${TAG_LIMITS.name} characters`),
)

const TagSlugSchema = v.pipe(
  v.string('The web address must be text'),
  v.trim(),
  v.maxLength(TAG_LIMITS.slug, 'That address is too long'),
  v.check(
    (value) => value === '' || SLUG_PATTERN.test(value),
    'A web address may use lowercase letters, numbers and single hyphens only',
  ),
)

/**
 * A new tag. All three names at once: a tag is a few words, and one that
 * lacks a language would be a chip missing from that language's filter.
 * An empty address is suggested from the English name, then the German.
 */
export const CreateTagSchema = v.object({
  slug: v.optional(TagSlugSchema, ''),
  names: v.object({ de: TagNameSchema, en: TagNameSchema, ar: TagNameSchema }),
})

export const PatchTagSchema = v.object({
  slug: v.optional(TagSlugSchema),
  names: v.optional(
    v.object({
      de: v.optional(TagNameSchema),
      en: v.optional(TagNameSchema),
      ar: v.optional(TagNameSchema),
    }),
  ),
})

/* -------------------------------------------------------------- the queries */

const IntFromQuery = (fallback: number, min: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(String(value).trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(min, 'That is below the smallest allowed value'),
    v.maxValue(max, 'That is above the largest allowed value'),
  )

const Search = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)), '')

export const BlogListQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(BLOG_PAGE_SIZE.default, BLOG_PAGE_SIZE.min, BLOG_PAGE_SIZE.max),
  search: Search,
  state: v.optional(v.picklist(BLOG_LIST_STATES), 'all'),
  /** A tag id, or every tag. */
  tag: v.optional(v.union([v.literal('all'), uuid('That is not a tag')]), 'all'),
  sort: v.optional(v.picklist(BLOG_LIST_SORTS), 'updated'),
  /** Which language's title each row shows. The Dashboard is English. */
  language: v.optional(v.picklist(LANGUAGES), 'en'),
})

export type BlogListQuery = v.InferOutput<typeof BlogListQuerySchema>

export const PublicBlogListQuerySchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'de'),
  offset: IntFromQuery(0, 0, PUBLIC_BLOG_BATCH.maxOffset),
  limit: IntFromQuery(PUBLIC_BLOG_BATCH.default, PUBLIC_BLOG_BATCH.min, PUBLIC_BLOG_BATCH.max),
  /** A tag's address, as `?tag=` carries it. Empty is every article. */
  tag: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(TAG_LIMITS.slug)), ''),
})

export const PublicBlogDetailQuerySchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'de'),
})

export const BlogPreviewQuerySchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'de'),
  /** The saved draft, the frozen schedule, or what is live. */
  version: v.optional(v.picklist(['draft', 'scheduled', 'published'] as const), 'draft'),
})

export const TagListQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(TAG_PAGE_SIZE.default, TAG_PAGE_SIZE.min, TAG_PAGE_SIZE.max),
  search: Search,
})

export const PublicTagQuerySchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'de'),
})

const Cursor = v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), '')

export const PublicCommentQuerySchema = v.object({
  cursor: Cursor,
  limit: IntFromQuery(PUBLIC_COMMENT_PAGE.default, PUBLIC_COMMENT_PAGE.min, PUBLIC_COMMENT_PAGE.max),
})

export const PublicReplyQuerySchema = v.object({
  cursor: Cursor,
  limit: IntFromQuery(PUBLIC_REPLY_PAGE.default, PUBLIC_REPLY_PAGE.min, PUBLIC_REPLY_PAGE.max),
})

export const OwnerCommentQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(OWNER_COMMENT_PAGE.default, OWNER_COMMENT_PAGE.min, OWNER_COMMENT_PAGE.max),
  postId: v.optional(uuid('That is not an article')),
  /**
   * Absent: every comment, newest first — the activity list. `root`: one
   * article's threads, newest first. A comment id: that comment's replies,
   * oldest first — the order a visitor reads them in.
   */
  parentId: v.optional(v.union([v.literal('root'), uuid('That is not a comment')])),
  status: v.optional(v.picklist(['all', 'new'] as const), 'all'),
  search: Search,
})

export type OwnerCommentQuery = v.InferOutput<typeof OwnerCommentQuerySchema>

/* --------------------------------------------- the shapes the Dashboard gets */

/**
 * What the owner API answers with. In the contract rather than beside the
 * mapper, because the contract is the only part of `src/backend2/` the
 * frontend may import.
 */
export type BlogImage = {
  mediaId: string
  /** Already a URL the dashboard can put in `src`; never a storage key. */
  url: string
  width: number | null
  height: number | null
  alt: Record<Language, string>
}

export type BlogTagRef = { id: string; slug: string; names: Record<Language, string> }

export type BlogProjectRef = {
  id: string
  /** The project's own name as the owner sees it in the Dashboard. */
  name: string
  /** Whether a visitor would see the link right now. */
  isLive: boolean
}

export type BlogVersionTexts = BlogTexts & { readingMinutes: number }

export type BlogVersionPayload = {
  slug: string
  cover: BlogImage | null
  projectId: string | null
  project: BlogProjectRef | null
  tagIds: string[]
  tags: BlogTagRef[]
  texts: Record<Language, BlogVersionTexts>
}

export type BlogSchedule = {
  publishAt: string
  publishAtBerlin: BerlinWallTime
  /** The draft revision the frozen snapshot was taken from. */
  draftRevision: number
  /** False once the draft was saved again after scheduling. */
  matchesDraft: boolean
}

/** A schedule that published later than it was due. */
export type BlogPublicationDelay = {
  scheduledFor: string
  publishedAt: string
  minutesLate: number
}

export type BlogCounts = {
  reads: number
  likes: number
  comments: number
  /** Comments the owner has not seen in the dashboard yet. */
  newComments: number
}

export type OwnerBlogPost = {
  id: string
  state: BlogState
  draftRevision: number
  createdAt: string
  updatedAt: string
  /** True once the address is fixed: scheduled or ever published. */
  slugLocked: boolean
  /** The claimed public address; null until the article is scheduled or published. */
  publicSlug: string | null
  firstPublishedAt: string | null
  publishedAt: string | null
  /** The "last updated" date a reader sees; null until a real update. */
  contentUpdatedAt: string | null
  hasPendingChanges: boolean
  schedule: BlogSchedule | null
  publicationDelay: BlogPublicationDelay | null
  commentsEnabled: boolean
  counts: BlogCounts
  /** What the owner is editing. */
  draft: BlogVersionPayload
  /** What a schedule will publish; null without one. */
  scheduled: BlogVersionPayload | null
  /** What visitors see right now; null while it is not live. */
  published: BlogVersionPayload | null
  /** Recomputed on every read, so the checklist is never stale. */
  publishBlockers: string[]
  publishIssues: BlogPublishIssue[]
  slugAvailable: boolean
}

export type OwnerBlogListItem = {
  id: string
  state: BlogState
  draftRevision: number
  /** The draft's address. */
  slug: string
  publicSlug: string | null
  displayTitle: string
  languagesComplete: Language[]
  coverUrl: string | null
  tags: Array<{ id: string; name: string }>
  schedule: { publishAt: string; publishAtBerlin: BerlinWallTime } | null
  publicationDelay: BlogPublicationDelay | null
  firstPublishedAt: string | null
  publishedAt: string | null
  contentUpdatedAt: string | null
  createdAt: string
  updatedAt: string
  hasPendingChanges: boolean
  commentsEnabled: boolean
  counts: BlogCounts
}

export type OwnerBlogTag = {
  id: string
  slug: string
  names: Record<Language, string>
  /** Articles that carry it anywhere — a draft, a schedule or live. */
  articleCount: number
  /** Articles a visitor can currently find under it. */
  liveArticleCount: number
  createdAt: string
  updatedAt: string
}

export type CommentAuthor = 'visitor' | 'owner'

export type OwnerComment = {
  id: string
  postId: string
  parentId: string | null
  /** 1 for a thread's first comment. */
  level: number
  author: CommentAuthor
  body: string
  createdAt: string
  isNew: boolean
  replyCount: number
  post: {
    id: string
    title: string
    state: BlogState
    publicSlug: string | null
    commentsEnabled: boolean
  }
  /** The comment this answers, shortened, for context in a flat list. */
  parent: { id: string; author: CommentAuthor; excerpt: string } | null
}

export type OwnerCommentPage = {
  items: OwnerComment[]
  page: number
  pageSize: number
  total: number
  pageCount: number
  hasMore: boolean
  /** Every comment the owner has not seen yet, anywhere. */
  newTotal: number
}

/** One comment with the conversation above it and the size of what hangs below. */
export type OwnerCommentThread = {
  comment: OwnerComment
  /** From the thread's first comment down to the direct parent. */
  ancestors: Array<{ id: string; author: CommentAuthor; body: string; createdAt: string; level: number }>
  /** Every reply beneath it at any depth: what deleting it would also delete. */
  descendantCount: number
}

/* --------------------------------------------- the shapes visitors get */

export type PublicBlogImage = {
  url: string
  width: number | null
  height: number | null
  alt: string
}

export type PublicBlogTag = { slug: string; name: string }

/**
 * The body as a visitor receives it. Identical to the stored tree except that
 * an image carries a `src` a browser can fetch instead of the library id the
 * database keeps, and a video carries only its id, start and title.
 */
export type PublicBlogNode = PublicRichTextNode | YoutubeNode

export type PublicBlogDoc = { type: 'doc'; content: PublicBlogNode[] }

export type PublicBlogCard = {
  slug: string
  title: string
  summary: string
  /** The original publication date. An update never moves it. */
  publishedAt: string
  /** Set only by a real published update. */
  updatedAt: string | null
  readingMinutes: number
  cover: PublicBlogImage | null
  tags: PublicBlogTag[]
  /** Approximate by design: times read and likes, never people. */
  readCount: number
  likeCount: number
}

export type PublicBlogPost = PublicBlogCard & {
  body: PublicBlogDoc
  /** The linked portfolio project, while it is live itself. */
  project: { slug: string; name: string } | null
  author: { name: string }
  /** Already resolved: the owner's override, or the title and summary. */
  seo: { title: string; description: string }
  /** Every language this article is published in — for `hreflang`. */
  languages: Language[]
  commentsEnabled: boolean
  /** Every comment at every depth; zero while comments are switched off. */
  commentCount: number
}

export type PublicBlogBatch = {
  items: PublicBlogCard[]
  offset: number
  limit: number
  total: number
  hasMore: boolean
}

export type PublicComment = {
  id: string
  parentId: string | null
  /** 1 for a thread's first comment. */
  level: number
  author: CommentAuthor
  body: string
  createdAt: string
  replyCount: number
}

export type PublicCommentPage = {
  /** False while the owner has comments switched off: no comments, no form. */
  enabled: boolean
  /** Every comment on the article, at every depth. */
  total: number
  items: PublicComment[]
  /** Pass back as `cursor` for the next page; null at the end. */
  nextCursor: string | null
}

export type PublicEngagement = { readCount: number; likeCount: number }

/* ------------------------------------------------------------ the wording */

/**
 * The Dashboard's words, next to the values they describe so the list and the
 * editor cannot disagree. English, because Dashboard V2 is English.
 */
export const BLOG_STATE_WORDS: Record<BlogState, { label: string; meaning: string }> = {
  draft: { label: 'Draft', meaning: 'Only you can see this. It has never been published.' },
  scheduled: {
    label: 'Scheduled',
    meaning: 'Frozen and waiting. It goes live by itself at the time you chose.',
  },
  published: { label: 'Live', meaning: 'Visitors see exactly what you have saved.' },
  published_with_pending_changes: {
    label: 'Live · edited',
    meaning: 'Visitors still see the older version. Your changes are saved but not published.',
  },
  unpublished: {
    label: 'Taken down',
    meaning: 'You published this before and took it down. Its comments and counts are kept.',
  },
}

/**
 * Which languages are complete enough to publish: a title, a summary and an
 * article — the three things publication demands of every language.
 */
export const completeBlogLanguages = (
  texts: Record<Language, { title: string; summary: string; bodyEmpty: boolean }>,
): Language[] =>
  LANGUAGES.filter(
    (language) =>
      texts[language].title.trim() !== '' &&
      texts[language].summary.trim() !== '' &&
      !texts[language].bodyEmpty,
  )

/**
 * The title to show when the requested language has none: English, then
 * German, then Arabic. An article with no title anywhere is "Untitled" rather
 * than a blank row the owner cannot click.
 */
export const blogDisplayTitle = (
  texts: Record<Language, Pick<BlogTexts, 'title'>>,
  preferred: Language,
): string => {
  for (const language of [preferred, 'en', 'de', 'ar'] as const) {
    const title = texts[language]?.title.trim()

    if (title) return title
  }

  return 'Untitled article'
}
