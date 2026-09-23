import {
  BLOG_LIMITS,
  type BlogCover,
  type BlogDoc,
  type BlogDraftInput,
  type BlogDraftPatch,
  type BlogPublishIssue,
  type BlogTexts,
  type BlogVersionPayload,
  LANGUAGES,
  type Language,
  TAG_LIMITS,
  blogDraftIssues,
  blogPlainText,
  completeBlogLanguages,
  emptyBlogDoc,
  isBlogBodyEmpty,
  isValidBlogSlug,
  stableStringify,
  suggestBlogSlug,
} from '#/backend2/contracts/blog.contract'
import { SLUG_PATTERN } from '#/backend2/contracts/project.contract'

/**
 * The article editor's values, and the way back to a draft.
 *
 * The three bodies are kept beside the form rather than in it, as the
 * Projects editor keeps its case studies: a rich-text document is a recursive
 * tree, and a form library that types every path through its values has no
 * business walking one. Everything else is the draft's own shape, with the
 * project as the text a `<select>` holds.
 */

export type BlogTextFields = Pick<BlogTexts, 'title' | 'summary' | 'seoTitle' | 'seoDescription'>

export type BlogFormValues = {
  slug: string
  cover: BlogCover | null
  /** A project id, or '' for none. */
  projectId: string
  tagIds: string[]
  texts: Record<Language, BlogTextFields>
}

export type BlogBodies = Record<Language, BlogDoc>

const blankTexts = (): BlogTextFields => ({ title: '', summary: '', seoTitle: '', seoDescription: '' })

export const emptyFormValues = (): BlogFormValues => ({
  slug: '',
  cover: null,
  projectId: '',
  tagIds: [],
  texts: { de: blankTexts(), en: blankTexts(), ar: blankTexts() },
})

export const emptyBodies = (): BlogBodies => ({ de: emptyBlogDoc(), en: emptyBlogDoc(), ar: emptyBlogDoc() })

const copyCover = (cover: { mediaId: string; alt: Record<Language, string> } | null): BlogCover | null =>
  cover ? { mediaId: cover.mediaId, alt: { de: cover.alt.de, en: cover.alt.en, ar: cover.alt.ar } } : null

export const toFormValues = (version: BlogVersionPayload): BlogFormValues => {
  const texts = {} as Record<Language, BlogTextFields>

  for (const language of LANGUAGES) {
    const t = version.texts[language]

    texts[language] = { title: t.title, summary: t.summary, seoTitle: t.seoTitle, seoDescription: t.seoDescription }
  }

  return {
    slug: version.slug,
    cover: copyCover(version.cover),
    projectId: version.projectId ?? '',
    tagIds: [...version.tagIds],
    texts,
  }
}

export const toBodies = (version: BlogVersionPayload): BlogBodies => ({
  de: structuredClone(version.texts.de.body),
  en: structuredClone(version.texts.en.body),
  ar: structuredClone(version.texts.ar.body),
})

/** A stored version as the draft it is, for comparing with what is on screen. */
export const payloadToDraft = (version: BlogVersionPayload): BlogDraftInput => {
  const texts = {} as Record<Language, BlogTexts>

  for (const language of LANGUAGES) {
    const t = version.texts[language]

    texts[language] = {
      title: t.title,
      summary: t.summary,
      body: t.body,
      seoTitle: t.seoTitle,
      seoDescription: t.seoDescription,
    }
  }

  return {
    slug: version.slug,
    cover: copyCover(version.cover),
    projectId: version.projectId,
    tagIds: [...version.tagIds],
    texts,
  }
}

/** One kind of line break, nothing around the edges — as the server stores it. */
const lines = (value: string): string => value.replace(/\r\n?/g, '\n').trim()

/** The values as the draft the server will store — trimmed the same way. */
export const toDraft = (values: BlogFormValues, bodies: BlogBodies): BlogDraftInput => {
  const texts = {} as Record<Language, BlogTexts>

  for (const language of LANGUAGES) {
    const t = values.texts[language]

    texts[language] = {
      title: t.title.trim(),
      summary: lines(t.summary),
      body: bodies[language],
      seoTitle: t.seoTitle.trim(),
      seoDescription: lines(t.seoDescription),
    }
  }

  return {
    slug: values.slug.trim(),
    cover: values.cover
      ? {
          mediaId: values.cover.mediaId,
          alt: { de: values.cover.alt.de.trim(), en: values.cover.alt.en.trim(), ar: values.cover.alt.ar.trim() },
        }
      : null,
    projectId: values.projectId === '' ? null : values.projectId,
    tagIds: [...values.tagIds],
    texts,
  }
}

const same = (a: unknown, b: unknown): boolean => stableStringify(a) === stableStringify(b)

/**
 * Only what changed, down to one field in one language. The server leaves
 * everything else exactly as it was, so a save sends a sentence rather than
 * three whole articles.
 */
export const draftPatch = (current: BlogDraftInput, next: BlogDraftInput): BlogDraftPatch => {
  const patch: BlogDraftPatch = {}

  if (next.slug !== current.slug) patch.slug = next.slug
  if (!same(next.cover, current.cover)) patch.cover = next.cover
  if (next.projectId !== current.projectId) patch.projectId = next.projectId
  if (!same(next.tagIds, current.tagIds)) patch.tagIds = next.tagIds

  for (const language of LANGUAGES) {
    const before = current.texts[language]
    const after = next.texts[language]
    const change: Partial<BlogTexts> = {}

    for (const key of ['title', 'summary', 'seoTitle', 'seoDescription'] as const) {
      if (after[key] !== before[key]) change[key] = after[key]
    }

    if (!same(after.body, before.body)) change.body = after.body

    if (Object.keys(change).length > 0) {
      patch.texts = { ...patch.texts, [language]: change }
    }
  }

  return patch
}

/* ----------------------------------------------------------- save checks */

/**
 * Shape and limits, keyed by the form's own field paths. Completeness is the
 * checklist's job, so an unfinished draft still saves — the approved rule
 * that saving and publishing are checked differently.
 */
export const fieldErrors = (values: BlogFormValues): Record<string, string> => {
  const errors: Record<string, string> = {}
  const slug = values.slug.trim()

  if (slug.length > BLOG_LIMITS.slug) errors.slug = `At most ${BLOG_LIMITS.slug} characters`
  else if (slug !== '' && !isValidBlogSlug(slug)) {
    errors.slug = 'Use lowercase letters, numbers and single hyphens only'
  }

  for (const language of LANGUAGES) {
    const t = values.texts[language]

    if (t.title.trim().length > BLOG_LIMITS.title) {
      errors[`texts.${language}.title`] = `A title is at most ${BLOG_LIMITS.title} characters`
    }
    if (lines(t.summary).length > BLOG_LIMITS.summary) {
      errors[`texts.${language}.summary`] = `A summary is at most ${BLOG_LIMITS.summary} characters`
    }
    if (t.seoTitle.trim().length > BLOG_LIMITS.seoTitle) {
      errors[`texts.${language}.seoTitle`] = `A search title is at most ${BLOG_LIMITS.seoTitle} characters`
    }
    if (lines(t.seoDescription).length > BLOG_LIMITS.seoDescription) {
      errors[`texts.${language}.seoDescription`] =
        `A search description is at most ${BLOG_LIMITS.seoDescription} characters`
    }
    if (values.cover && values.cover.alt[language].trim().length > BLOG_LIMITS.altText) {
      errors[`cover.alt.${language}`] = `At most ${BLOG_LIMITS.altText} characters`
    }
  }

  return errors
}

/**
 * The limits a body can break: too many pictures or videos, or too much text.
 * Keyed by language; the one limit across the whole article — files from
 * Media — is under `article`.
 */
export const bodyErrors = (draft: BlogDraftInput): Partial<Record<Language | 'article', string>> => {
  const errors: Partial<Record<Language | 'article', string>> = {}

  for (const issue of blogDraftIssues(draft)) {
    const language = /^(DE|EN|AR): /.exec(issue)?.[1]?.toLowerCase() as Language | undefined

    errors[language ?? 'article'] ??= language ? capitalise(issue.slice(4)) : issue
  }

  for (const language of LANGUAGES) {
    if (blogPlainText(draft.texts[language].body).length > BLOG_LIMITS.bodyCharacters) {
      errors[language] ??=
        `One language of an article may hold at most ${BLOG_LIMITS.bodyCharacters.toLocaleString('en')} characters`
    }
  }

  return errors
}

/* -------------------------------------------------------- publish checks */

const capitalise = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

const PARTS = ['title', 'summary', 'body', 'seoTitle', 'seoDescription'] as const

/** Where a field sits on the page, top to bottom: address, cover, then each language. */
const fieldRank = (field: string): number => {
  if (field === 'slug') return 0

  const cover = /^cover\.alt\.(de|en|ar)$/.exec(field)

  if (cover) return 10 + LANGUAGES.indexOf(cover[1] as Language)

  const text = /^texts\.(de|en|ar)\.(title|summary|body|seoTitle|seoDescription)$/.exec(field)

  if (text) {
    return 20 + LANGUAGES.indexOf(text[1] as Language) * 10 + PARTS.indexOf(text[2] as (typeof PARTS)[number])
  }

  return 100
}

/** The first of these fields a reader of the page meets, scrolling down. */
export const firstField = (fields: string[]): string | undefined =>
  [...fields].sort((a, b) => fieldRank(a) - fieldRank(b))[0]

/**
 * The publication issues in the order the page shows their fields, so the
 * checklist reads top to bottom and "the first invalid field" is the first one
 * the owner would meet scrolling down. Pictures in one body keep their order.
 */
export const orderedIssues = (issues: BlogPublishIssue[]): BlogPublishIssue[] =>
  issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => fieldRank(a.issue.field) - fieldRank(b.issue.field) || a.index - b.index)
    .map(({ issue }) => issue)

/**
 * The first issue for each field, worded for the field itself: "DE: the title
 * is empty" becomes "The title is empty" under the German title.
 */
export const issuesByField = (issues: BlogPublishIssue[]): Record<string, string> => {
  const byField: Record<string, string> = {}

  for (const issue of issues) {
    byField[issue.field] ??= capitalise(issue.message.replace(/^(DE|EN|AR): /, ''))
  }

  return byField
}

export type FieldTarget = { id: string; language?: Language }

/** The element a field path is drawn as, so a checklist line or an error can go there. */
export const fieldTarget = (field: string): FieldTarget | null => {
  if (field === 'slug') return { id: 'blog-slug' }

  const cover = /^cover\.alt\.(de|en|ar)$/.exec(field)

  if (cover) return { id: `blog-cover-alt-${cover[1]}` }

  const text = /^texts\.(de|en|ar)\.(title|summary|body|seoTitle|seoDescription)$/.exec(field)

  if (!text) return null

  const language = text[1] as Language
  const part = { title: 'title', summary: 'summary', body: 'body', seoTitle: 'seo-title', seoDescription: 'seo-description' }[
    text[2] as 'title'
  ]

  return { id: `blog-${language}-${part}`, language }
}

/** Does anything in this language need the owner's attention? */
export const languageNeedsAttention = (language: Language, errors: Record<string, string>): boolean =>
  Object.keys(errors).some((key) => key.startsWith(`texts.${language}.`))

/** The languages with a title, a summary and an article — the three things publishing asks of each. */
export const completeLanguages = (draft: BlogDraftInput): Language[] =>
  completeBlogLanguages({
    de: { ...draft.texts.de, bodyEmpty: isBlogBodyEmpty(draft.texts.de.body) },
    en: { ...draft.texts.en, bodyEmpty: isBlogBodyEmpty(draft.texts.en.body) },
    ar: { ...draft.texts.ar, bodyEmpty: isBlogBodyEmpty(draft.texts.ar.body) },
  })

/** A suggested address, from the English title and then the German one. Arabic alone suggests nothing. */
export const slugSuggestion = (values: BlogFormValues): string => {
  const slug = suggestBlogSlug(values.texts.en.title.trim() || values.texts.de.title.trim())

  return slug.slice(0, BLOG_LIMITS.slug).replace(/-+$/, '')
}

/* --------------------------------------------------------------- tags */

export type TagFormValues = { names: Record<Language, string>; slug: string }

/** A tag's filter address, from the English name and then the German one — the server's rule. */
export const tagSlugSuggestion = (names: Record<Language, string>): string =>
  suggestBlogSlug(names.en.trim() || names.de.trim()).slice(0, TAG_LIMITS.slug).replace(/-+$/, '')

export const TAG_LANGUAGE_WORDS: Record<Language, string> = { de: 'German', en: 'English', ar: 'Arabic' }

export const tagErrors = (values: TagFormValues): Record<string, string> => {
  const errors: Record<string, string> = {}

  for (const language of LANGUAGES) {
    const name = values.names[language].trim()

    if (name === '') {
      errors[`names.${language}`] =
        `Needed in ${TAG_LANGUAGE_WORDS[language]} — a tag missing a language is missing from that language's filter`
    } else if (name.length > TAG_LIMITS.name) {
      errors[`names.${language}`] = `At most ${TAG_LIMITS.name} characters`
    }
  }

  const slug = values.slug.trim() || tagSlugSuggestion(values.names)
  const named = LANGUAGES.some((language) => values.names[language].trim() !== '')

  // With no name at all, the names' own messages say everything; the address follows them.
  if (slug === '') {
    if (named) errors.slug = 'Choose a filter address — an Arabic name alone suggests none'
  } else if (slug.length > TAG_LIMITS.slug) errors.slug = `At most ${TAG_LIMITS.slug} characters`
  else if (!SLUG_PATTERN.test(slug)) errors.slug = 'Use lowercase letters, numbers and single hyphens only'

  return errors
}
