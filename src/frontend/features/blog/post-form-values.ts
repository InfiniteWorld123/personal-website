import type { AdminPostDetail } from '#/shared/types/post.types'
import {
  POST_LANGUAGES,
  type PostLanguage,
  type PostTranslationInput,
  type PostWriteInput,
} from '#/shared/validation/post.validation'
import { type RichTextDoc, emptyRichTextDoc } from '#/shared/validation/rich-text'

/**
 * The short fields of one language. The article body is deliberately not part
 * of this: a rich-text document is a deeply recursive type, and the form
 * library walks its value type to build every field path it accepts, which
 * made the type checker give up with "instantiation is excessively deep".
 * The three bodies are held beside the form instead — see `PostBodies`.
 */
export type PostTranslationText = Omit<PostTranslationInput, 'body'>

/** One article per language, kept outside the form for the reason above. */
export type PostBodies = Record<PostLanguage, RichTextDoc>

/**
 * The form always holds all three languages, even the untouched ones: a tab
 * that renders `undefined` cannot be typed into. The cover is three flat
 * fields rather than a nullable object for the same reason — an empty path
 * means there is no cover.
 */
export type PostFormValues = {
  slug: string
  /** Empty string means the article is not about a case study. */
  projectId: string
  coverSrc: string
  coverWidth: number
  coverHeight: number
  isPublished: boolean
  publishedOn: string
  tagIds: string[]
  translations: Record<PostLanguage, PostTranslationText>
}

const emptyTranslation = (): PostTranslationText => ({
  title: '',
  excerpt: '',
  coverAlt: '',
})

const emptyTranslations = (): Record<PostLanguage, PostTranslationText> => ({
  de: emptyTranslation(),
  en: emptyTranslation(),
  ar: emptyTranslation(),
})

export const emptyPostForm = (): PostFormValues => ({
  slug: '',
  projectId: '',
  coverSrc: '',
  coverWidth: 1600,
  coverHeight: 900,
  isPublished: false,
  publishedOn: '',
  tagIds: [],
  translations: emptyTranslations(),
})

export const emptyPostBodies = (): PostBodies => ({
  de: emptyRichTextDoc(),
  en: emptyRichTextDoc(),
  ar: emptyRichTextDoc(),
})

export const toPostBodies = (detail: AdminPostDetail): PostBodies => {
  const bodies = emptyPostBodies()

  for (const language of POST_LANGUAGES) {
    const saved = detail.translations[language]
    if (saved) bodies[language] = saved.body
  }

  return bodies
}

export const toFormValues = (detail: AdminPostDetail): PostFormValues => {
  const translations = emptyTranslations()

  for (const language of POST_LANGUAGES) {
    const saved = detail.translations[language]

    if (saved) {
      translations[language] = {
        title: saved.title,
        excerpt: saved.excerpt,
        coverAlt: saved.coverAlt,
      }
    }
  }

  return {
    slug: detail.slug,
    projectId: detail.projectId ?? '',
    coverSrc: detail.cover?.src ?? '',
    coverWidth: detail.cover?.width ?? 1600,
    coverHeight: detail.cover?.height ?? 900,
    isPublished: detail.isPublished,
    publishedOn: detail.publishedOn ?? '',
    tagIds: detail.tagIds,
    translations,
  }
}

/** The cover as the API expects it: three fields together, or nothing at all. */
export const toCoverInput = (values: PostFormValues): PostWriteInput['cover'] =>
  values.coverSrc.trim() === ''
    ? null
    : { src: values.coverSrc.trim(), width: values.coverWidth, height: values.coverHeight }

/**
 * A language the owner has not started is left out of the payload rather than
 * saved as a row of empty strings, so "written in two languages" stays a fact
 * the database can answer.
 */
export const toWriteInput = (values: PostFormValues, bodies: PostBodies): PostWriteInput => {
  const translations: PostWriteInput['translations'] = {}

  for (const language of POST_LANGUAGES) {
    const copy = values.translations[language]

    if (copy.title.trim() === '') continue

    translations[language] = { ...copy, body: bodies[language] }
  }

  return {
    slug: values.slug.trim(),
    projectId: values.projectId === '' ? null : values.projectId,
    cover: toCoverInput(values),
    isPublished: values.isPublished,
    publishedOn: values.publishedOn.trim() === '' ? null : values.publishedOn.trim(),
    tagIds: values.tagIds,
    translations,
  }
}

/** Which of the three languages the owner has actually started writing. */
export const writtenLanguages = (values: PostFormValues): PostLanguage[] =>
  POST_LANGUAGES.filter((language) => values.translations[language].title.trim() !== '')

/**
 * A title becomes a slug: lowercase, Latin letters and digits only, joined by
 * hyphens. The German replacements run before the accents are stripped: the
 * other order decomposes ü into u plus a diaeresis and then drops the
 * diaeresis, so "Über" comes out "uber" rather than "ueber".
 *
 * An Arabic title leaves nothing behind at all, which is why this only ever
 * fills an empty field and never overwrites what was typed.
 */
export const slugify = (title: string): string =>
  title
    .toLowerCase()
    .replaceAll('\u00e4', 'ae')
    .replaceAll('\u00f6', 'oe')
    .replaceAll('\u00fc', 'ue')
    .replaceAll('\u00df', 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
