import { site } from '#/frontend/content/site'
import { type Language, languages, localeFor } from '#/frontend/i18n/language'

type HeadInput = {
  language: Language
  /** Path without the language segment, e.g. `/services`. `/` for the home page. */
  path: string
  title: string
  description: string
  image?: string
  noIndex?: boolean
}

const absolute = (pathname: string) => `${site.url}${pathname}`

export const publicPath = (language: Language, path: string) =>
  `/${language}${path === '/' ? '' : path}`

/**
 * Head tags for a public page: title, description, canonical, one hreflang
 * per language plus x-default, and Open Graph / Twitter cards.
 */
export function buildHead({ language, path, title, description, image, noIndex }: HeadInput) {
  const canonical = absolute(publicPath(language, path))
  const ogImage = absolute(image ?? site.ogImage)

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { name: 'robots', content: noIndex ? 'noindex, nofollow' : 'index, follow' },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: site.name },
      { property: 'og:locale', content: localeFor(language).replace('-', '_') },
      { property: 'og:url', content: canonical },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: ogImage },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: ogImage },
    ],
    links: [
      { rel: 'canonical', href: canonical },
      ...languages.map((alternate) => ({
        rel: 'alternate',
        hrefLang: alternate,
        href: absolute(publicPath(alternate, path)),
      })),
      { rel: 'alternate', hrefLang: 'x-default', href: absolute(publicPath('de', path)) },
    ],
  }
}
