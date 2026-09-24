import type { Language } from '#/frontend/i18n/language'
import { ar } from './ar'
import { de } from './de'
import { en } from './en'
import type { SiteContent } from './types'

/**
 * The copy exactly as the repository ships it, before anything the owner has
 * written in the Dashboard. This is the fallback for every key, and what
 * "restore the original" restores.
 */
export const content: Record<Language, SiteContent> = { de, en, ar }
