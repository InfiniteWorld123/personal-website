import { getContent, site } from '#/frontend/content'
import { type Language, languages, localeFor } from '#/frontend/i18n/language'
import { buildStructuredData, type StructuredArticle, type StructuredProject } from './structured-data'
import { SOCIAL_CARD_SIZE, absolute, pageUrl, publicPath, socialCard } from './url'

export { publicPath }

/**
 * The generated social cards are JPEG, but an article's cover is whatever was
 * uploaded, and a wrong `og:image:type` makes some scrapers skip the image.
 */
const mediaTypeFor = (url: string): string => {
  const extension = url.split('?')[0]?.split('.').pop()?.toLowerCase()

  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'avif') return 'image/avif'

  return 'image/jpeg'
}

type HeadInput = {
  language: Language
  /** Path without the language segment, e.g. `/services`. `/` for the home page. */
  path: string
  title: string
  description: string
  image?: string
  /** Real pixel size of `image`, when it is not the standard social card. */
  imageSize?: { width: number; height: number }
  noIndex?: boolean
  /** Passed straight to the JSON-LD graph; see `structured-data.ts`. */
  projects?: StructuredProject[]
  /** Set on a blog post, which is an article rather than a website page. */
  article?: StructuredArticle
}

/**
 * Head tags for a public page: title, description, canonical, one hreflang
 * per language plus x-default, Open Graph / Twitter cards, and the page's
 * JSON-LD graph.
 */
/**
 * The graph, ready to be written inside a `<script>` block.
 *
 * The router puts this string into the document as raw HTML, and
 * `JSON.stringify` leaves `</script>` exactly as it found it — so a value
 * carrying that sequence would close the block and everything after it would
 * be parsed as markup. Every value here is written by the owner today, which
 * is the only reason this was never an open door; it stops being true the
 * first time a visitor's words reach a page's description.
 *
 * The three escapes are valid JSON and parse back to the same characters.
 */
export const toJsonLd = (graph: unknown): string =>
  JSON.stringify(graph)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')

export function buildHead({
  language,
  path,
  title,
  description,
  image,
  imageSize,
  noIndex,
  projects,
  article,
}: HeadInput) {
  const canonical = pageUrl(language, path)
  const card = absolute(image ?? socialCard(language))
  // A page that brings its own image states that image's size; the generated
  // social cards are all the same shape, so they state the shared constant.
  const cardSize = image && imageSize ? imageSize : SOCIAL_CARD_SIZE
  const cardAlt = `${site.name} — ${getContent(language).shell.footer.tagline}`

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { name: 'robots', content: noIndex ? 'noindex, nofollow' : 'index, follow' },
      { property: 'og:type', content: article ? 'article' : 'website' },
      { property: 'og:site_name', content: site.name },
      { property: 'og:locale', content: localeFor(language).replace('-', '_') },
      // No `og:locale:alternate`: the head manager keeps one tag per property,
      // so only the last of the two would survive. The hreflang links below
      // are what search engines read anyway.
      { property: 'og:url', content: canonical },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: card },
      { property: 'og:image:type', content: mediaTypeFor(card) },
      { property: 'og:image:width', content: String(cardSize.width) },
      { property: 'og:image:height', content: String(cardSize.height) },
      { property: 'og:image:alt', content: cardAlt },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: card },
      { name: 'twitter:image:alt', content: cardAlt },
      // Open Graph dates an article; a website page has no publication date
      // to state, so the tag is left off rather than filled with the build time.
      ...(article
        ? [
            { property: 'article:published_time', content: `${article.publishedOn}T00:00:00.000Z` },
            { property: 'article:author', content: site.name },
          ]
        : []),
    ],
    links: [
      { rel: 'canonical', href: canonical },
      ...languages.map((alternate) => ({
        rel: 'alternate',
        hrefLang: alternate,
        href: pageUrl(alternate, path),
      })),
      // x-default is the page for a visitor whose language we do not publish;
      // English serves them better than German now that clients are worldwide.
      { rel: 'alternate', hrefLang: 'x-default', href: pageUrl('en', path) },
      // Feed discovery, on the blog pages only: one feed per language, so the
      // reader who subscribes from the Arabic archive gets Arabic articles.
      ...(path.startsWith('/blog')
        ? [
            {
              rel: 'alternate',
              type: 'application/rss+xml',
              title: `${site.name} — ${getContent(language).blog.eyebrow}`,
              href: absolute(`/rss/${language}.xml`),
            },
          ]
        : []),
    ],
    scripts: [
      {
        type: 'application/ld+json',
        children: toJsonLd(
          buildStructuredData({
            language,
            path,
            title,
            description,
            canonical,
            image: card,
            projects,
            article,
          }),
        ),
      },
    ],
  }
}
