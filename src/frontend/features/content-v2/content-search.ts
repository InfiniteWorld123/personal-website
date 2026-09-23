import type { ContentLanguage, ContentSlot } from '#/backend2/contracts/content.contract'
import { PAGE_NAME } from './content-words'

/**
 * The `/dashboard/content` address: page, language and view.
 *
 * Kept apart from `ContentPage` on purpose. A route's `validateSearch` stays in
 * the route tree every page loads, so importing it from the editor module
 * pulled the whole editor (and TanStack Form) into the public site's bundle.
 */

/* Spelled out for the same reason; `route-search-constants.test.ts` checks it. */
export const CONTENT_SEARCH_LANGUAGES = ['de', 'en', 'ar'] as const satisfies readonly ContentLanguage[]

export type ContentSearch = {
  view?: 'history'
  lang?: ContentLanguage
  page?: string
  hpage?: number
  hlang?: ContentSlot
}

export const parseContentSearch = (raw: Record<string, unknown>): ContentSearch => {
  const out: ContentSearch = {}

  if (raw.view === 'history') out.view = 'history'
  if (typeof raw.lang === 'string' && (CONTENT_SEARCH_LANGUAGES as readonly string[]).includes(raw.lang)) out.lang = raw.lang as ContentLanguage
  if (typeof raw.page === 'string' && raw.page in PAGE_NAME) out.page = raw.page
  const hpage = Number(raw.hpage)
  if (Number.isInteger(hpage) && hpage > 1 && hpage < 100_000) out.hpage = hpage
  if (typeof raw.hlang === 'string' && ['de', 'en', 'ar', 'shared'].includes(raw.hlang)) out.hlang = raw.hlang as ContentSlot

  return out
}
