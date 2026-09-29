import type { IndustryId } from '#/frontend/content'
import type { Language } from '#/frontend/i18n/language'

/** The hub's path, without the language segment. */
export const INDUSTRIES_PATH = '/webdesign-erfurt'

/**
 * Each industry's address. The words are German on purpose: they are what
 * people in Erfurt type, and they stay the same in every language so the
 * three versions of a page are siblings for `hreflang`.
 */
export const INDUSTRY_SLUGS: Record<IndustryId, string> = {
  cafes: 'cafes-restaurants',
  hairdressers: 'friseure',
  practices: 'praxen',
  trades: 'handwerk',
}

/** The order the hub lists them in. */
export const industryOrder: readonly IndustryId[] = ['cafes', 'hairdressers', 'practices', 'trades']

export const industryBySlug = (slug: string): IndustryId | undefined =>
  industryOrder.find((id) => INDUSTRY_SLUGS[id] === slug)

export const industryPath = (id: IndustryId) => `${INDUSTRIES_PATH}/${INDUSTRY_SLUGS[id]}`

/**
 * The languages these pages are translated into. The others render the German
 * text as a placeholder, carry `noindex`, and are left out of the sitemap and
 * of `hreflang`. Add a language here once its text is translated in the
 * Dashboard.
 */
export const INDUSTRY_LANGUAGES: readonly Language[] = ['de']

export const isIndustryLanguagePublished = (language: Language) => INDUSTRY_LANGUAGES.includes(language)

/** Every path in the section, hub first. */
export const industryPaths = (): string[] => [INDUSTRIES_PATH, ...industryOrder.map(industryPath)]
