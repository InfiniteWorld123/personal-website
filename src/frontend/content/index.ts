import type { Language } from '#/frontend/i18n/language'
import { ar } from './ar'
import { de } from './de'
import { en } from './en'
import type { SiteContent } from './types'

export const content: Record<Language, SiteContent> = { de, en, ar }

export const getContent = (language: Language): SiteContent => content[language]

export * from './site'
export type * from './types'
