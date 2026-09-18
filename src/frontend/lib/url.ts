import { site } from '#/frontend/content/site'
import type { Language } from '#/frontend/i18n/language'

/** Absolute URL for a site-relative path that already starts with `/`. */
export const absolute = (path: string) => `${site.url}${path}`

/** Public path for a page, e.g. `('de', '/services')` → `/de/services`. */
export const publicPath = (language: Language, path: string) =>
  `/${language}${path === '/' ? '' : path}`

/** Absolute URL of a public page in one language. */
export const pageUrl = (language: Language, path: string) => absolute(publicPath(language, path))

/**
 * Bumped by hand whenever the cards in `public/og` are regenerated.
 *
 * Every platform that shows a link preview — WhatsApp, LinkedIn, Slack, X —
 * caches the image against its URL, for days or indefinitely. The generator
 * writes the three files back to the same three paths, so without something in
 * the URL that changes, a corrected card never reaches anyone who has already
 * shared the link: they keep serving the old picture, and nothing in the
 * repository says anything is wrong.
 *
 * The bare path still resolves, so links shared before this stay intact.
 */
export const OG_CARD_VERSION = '2026-09-10'

/** Social preview card for a language. 1200×630, generated into `public/og`. */
export const socialCard = (language: Language) => `/og/${language}.jpg?v=${OG_CARD_VERSION}`

export const SOCIAL_CARD_SIZE = { width: 1200, height: 630 } as const
