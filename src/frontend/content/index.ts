import type { Language } from '#/frontend/i18n/language'
import { resolveContent } from './overrides'
import type { SiteContent } from './types'

export { content } from './base'

/**
 * The site's copy in one language: what the repository ships, with anything
 * the owner has published from `/admin/content` written over it (B6). A key
 * that has never been edited falls through to the code, so new copy appears
 * with the release that adds it.
 */
export const getContent = (language: Language): SiteContent => resolveContent(language)

export * from './site'
export { getServicePrices, getSite } from './overrides'
export type * from './types'
