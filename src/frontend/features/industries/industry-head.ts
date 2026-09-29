import { getContent, type IndustryId, type PageMeta } from '#/frontend/content'
import type { Language } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { INDUSTRIES_PATH, INDUSTRY_LANGUAGES, industryPath, isIndustryLanguagePublished } from './industries'

/**
 * Head tags for the hub (`id` undefined) or one industry page: the owner's
 * title and description, `noindex` in a language not yet translated, only the
 * published languages as `hreflang`, and the page's FAQ and local Service in
 * the JSON-LD graph.
 */
export const industryHead = (language: Language, meta: PageMeta, id: IndustryId | undefined) => {
  const { industries } = getContent(language)
  const page = id ? industries.pages[id] : undefined

  return buildHead({
    language,
    path: id ? industryPath(id) : INDUSTRIES_PATH,
    title: meta.title,
    description: meta.description,
    noIndex: !isIndustryLanguagePublished(language),
    alternates: INDUSTRY_LANGUAGES,
    landing: {
      section: industries.hub.eyebrow,
      leaf: page?.card.title,
      service: page
        ? { name: page.title, description: meta.description }
        : { name: industries.hub.title, description: meta.description },
      faq: page?.faq ?? [],
    },
  })
}
