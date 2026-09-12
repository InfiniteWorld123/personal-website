import type { AdminProjectDetail } from '#/shared/types/project.types'
import {
  PROJECT_LANGUAGES,
  type ProjectLanguage,
  type ProjectStatus,
  type ProjectTranslationInput,
  type ProjectWriteInput,
} from '#/shared/validation/project.validation'

export type ProjectImageFormValue = {
  src: string
  width: number
  height: number
  isCover: boolean
  /** Every language is present in the form, empty where nothing is written. */
  alt: Record<ProjectLanguage, string>
}

/**
 * The form always holds all three languages, even the untouched ones. A tab
 * that renders `undefined` cannot be typed into, and the alternative — adding
 * a language before writing it — is a step nobody should have to take.
 */
export type ProjectFormValues = {
  slug: string
  status: ProjectStatus
  websiteUrl: string
  sourceUrl: string
  isPublished: boolean
  tech: string[]
  images: ProjectImageFormValue[]
  translations: Record<ProjectLanguage, ProjectTranslationInput>
}

const emptyTranslation = (): ProjectTranslationInput => ({
  name: '',
  kind: '',
  summary: '',
  problem: '',
  approach: '',
  shows: '',
  features: [],
})

const emptyAlt = (): Record<ProjectLanguage, string> => ({ de: '', en: '', ar: '' })

const emptyTranslations = (): Record<ProjectLanguage, ProjectTranslationInput> => ({
  de: emptyTranslation(),
  en: emptyTranslation(),
  ar: emptyTranslation(),
})

export const emptyProjectForm = (): ProjectFormValues => ({
  slug: '',
  status: 'building',
  websiteUrl: '',
  sourceUrl: '',
  isPublished: false,
  tech: [],
  images: [],
  translations: emptyTranslations(),
})

export const toFormValues = (detail: AdminProjectDetail): ProjectFormValues => {
  const translations = emptyTranslations()

  for (const language of PROJECT_LANGUAGES) {
    const saved = detail.translations[language]
    if (saved) translations[language] = { ...emptyTranslation(), ...saved }
  }

  return {
    slug: detail.slug,
    status: detail.status,
    // A missing link is an empty field, not the string "null".
    websiteUrl: detail.websiteUrl ?? '',
    sourceUrl: detail.sourceUrl ?? '',
    isPublished: detail.isPublished,
    tech: detail.tech,
    images: detail.images.map((image) => ({
      src: image.src,
      width: image.width,
      height: image.height,
      isCover: image.isCover,
      alt: { ...emptyAlt(), ...image.alt },
    })),
    translations,
  }
}

/**
 * A language the owner has not started is left out of the payload rather than
 * saved as a row of empty strings, so "written in two languages" stays a fact
 * the database can answer.
 */
export const toWriteInput = (values: ProjectFormValues): ProjectWriteInput => {
  const translations: ProjectWriteInput['translations'] = {}

  for (const language of PROJECT_LANGUAGES) {
    const copy = values.translations[language]

    if (copy.name.trim() === '') continue

    translations[language] = {
      ...copy,
      features: copy.features.map((feature) => feature.trim()).filter(Boolean),
    }
  }

  return {
    slug: values.slug.trim(),
    status: values.status,
    websiteUrl: values.websiteUrl.trim() === '' ? null : values.websiteUrl.trim(),
    sourceUrl: values.sourceUrl.trim() === '' ? null : values.sourceUrl.trim(),
    isPublished: values.isPublished,
    tech: values.tech.map((name) => name.trim()).filter(Boolean),
    images: values.images.map((image) => ({
      src: image.src.trim(),
      width: image.width,
      height: image.height,
      isCover: image.isCover,
      alt: Object.fromEntries(
        PROJECT_LANGUAGES.map((language) => [language, image.alt[language].trim()]).filter(
          ([, alt]) => alt !== '',
        ),
      ),
    })),
    translations,
  }
}

/** Which of the three languages the owner has actually started writing. */
export const writtenLanguages = (values: ProjectFormValues): ProjectLanguage[] =>
  PROJECT_LANGUAGES.filter((language) => values.translations[language].name.trim() !== '')
