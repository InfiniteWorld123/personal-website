import { site } from '#/frontend/content/site'
import type { Language } from '#/frontend/i18n/language'

/** Absolute URL for a site-relative path that already starts with `/`. */
export const absolute = (path: string) => `${site.url}${path}`

/** Public path for a page, e.g. `('de', '/services')` → `/de/services`. */
export const publicPath = (language: Language, path: string) =>
  `/${language}${path === '/' ? '' : path}`

/** Absolute URL of a public page in one language. */
export const pageUrl = (language: Language, path: string) => absolute(publicPath(language, path))

/** Social preview card for a language. 1200×630, generated into `public/og`. */
export const socialCard = (language: Language) => `/og/${language}.jpg`

export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 } as const
