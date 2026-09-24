import { getContent } from '#/frontend/content'
import { site } from '#/frontend/content/site'
import { type Language, localeFor } from '#/frontend/i18n/language'
import { publicPath } from '#/frontend/lib/seo'
import { readsFromV2 } from '#/backend2/public-source'
import { fetchPublishedPosts } from './published-posts'
import { readV2Posts } from './v2-reader'

/**
 * One feed per language, at `/rss/de.xml`, `/rss/en.xml`, `/rss/ar.xml`.
 * A single mixed feed would hand a German reader Arabic articles, which is
 * exactly what the per-language archive exists to avoid.
 *
 * Three routes rather than one with a parameter: the router reads `$lang.xml`
 * as a single parameter named `lang.xml`, so the language and the extension
 * would arrive stuck together.
 */

/** `&` first, or it would escape the ampersands the other entities introduce. */
const escapeXml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')

/**
 * How many of the newest articles a Backend2 feed lists. Legacy lists every
 * published post; Backend2 reads bounded pages (`docs/v2/blog.md`), and a feed
 * reader only ever needs the recent ones.
 */
const V2_FEED_ITEMS = 36

/** RFC 822, which is what RSS 2.0 asks for. */
const toRfc822 = (day: string) => new Date(`${day}T00:00:00.000Z`).toUTCString()

export async function buildFeedResponse(language: Language): Promise<Response> {
  const { blog } = getContent(language)
  // `docs/v2/public-cutover.md` step 4: live Backend2 articles only when the
  // switch lists `blog`; the feed's shape and address stay the same.
  const posts = readsFromV2('blog')
    ? await readV2Posts({ language, limit: V2_FEED_ITEMS })
    : await fetchPublishedPosts({ data: { language } })
  const feedUrl = `${site.url}/rss/${language}.xml`
  const archiveUrl = site.url + publicPath(language, '/blog')

  const items = posts
    .map((post) => {
      const url = site.url + publicPath(language, `/blog/${post.slug}`)
      const categories = post.tags
        .map((tag) => `<category>${escapeXml(tag.name)}</category>`)
        .join('')

      return `<item><title>${escapeXml(post.title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid><pubDate>${toRfc822(post.publishedOn)}</pubDate><description>${escapeXml(post.excerpt)}</description>${categories}</item>`
    })
    .join('')

  const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${escapeXml(`${site.name} — ${blog.eyebrow}`)}</title><link>${escapeXml(archiveUrl)}</link><description>${escapeXml(blog.meta.description)}</description><language>${localeFor(language)}</language><atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>${items}</channel></rss>`

  return new Response(body, {
    // Feed readers poll; a quarter of an hour spares the database.
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
  })
}
