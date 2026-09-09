import { getContent, site } from '#/frontend/content'
import { type Language, languages, localeFor } from '#/frontend/i18n/language'
import { buildStructuredData } from './structured-data'
import { SOCIAL_CARD_SIZE, absolute, pageUrl, publicPath, socialCard } from './url'

export { publicPath }

type HeadInput = {
  language: Language
  /** Path without the language segment, e.g. `/services`. `/` for the home page. */
  path: string
  title: string
  description: string
  image?: string
  noIndex?: boolean
}

/**
 * Head tags for a public page: title, description, canonical, one hreflang
 * per language plus x-default, Open Graph / Twitter cards, and the page's
 * JSON-LD graph.
 */
export function buildHead({ language, path, title, description, image, noIndex }: HeadInput) {
  const canonical = pageUrl(language, path)
  const card = absolute(image ?? socialCard(language))
  const cardAlt = `${site.name} — ${getContent(language).shell.footer.tagline}`

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { name: 'robots', content: noIndex ? 'noindex, nofollow' : 'index, follow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: site.name },
      { property: 'og:locale', content: localeFor(language).replace('-', '_') },
      // No `og:locale:alternate`: the head manager keeps one tag per property,
      // so only the last of the two would survive. The hreflang links below
      // are what search engines read anyway.
      { property: 'og:url', content: canonical },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: card },
      { property: 'og:image:type', content: 'image/jpeg' },
      { property: 'og:image:width', content: String(SOCIAL_CARD_SIZE.width) },
      { property: 'og:image:height', content: String(SOCIAL_CARD_SIZE.height) },
      { property: 'og:image:alt', content: cardAlt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: card },
      { name: 'twitter:image:alt', content: cardAlt },
    ],
    links: [
      { rel: 'canonical', href: canonical },
      ...languages.map((alternate) => ({
        rel: 'alternate',
        hrefLang: alternate,
        href: pageUrl(alternate, path),
      })),
      { rel: 'alternate', hrefLang: 'x-default', href: pageUrl('de', path) },
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: JSON.stringify(
          buildStructuredData({ language, path, title, description, canonical, image: card }),
        ),
      },
    ],
  }
}
