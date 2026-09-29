import { createFileRoute } from '@tanstack/react-router'
import { site } from '#/frontend/content/site'
import { fetchPublishedPostSlugs } from '#/frontend/features/blog/server/published-posts'
import { fetchPublishedServiceSlugs } from '#/frontend/features/services-public/server/published-services'
import { fetchPublishedProjectSlugs } from '#/frontend/features/work/server/published-projects'
import { INDUSTRY_LANGUAGES, industryPaths } from '#/frontend/features/industries/industries'
import { type Language, defaultLanguage, languages } from '#/frontend/i18n/language'
import { publicPath } from '#/frontend/lib/seo'

// `/booking` is the page the whole site points at, and it was the only public
// page the sitemap did not declare — found late and re-crawled least often,
// which is the opposite of what a page meant to fill a calendar needs.
const staticPaths = ['/', '/services', '/work', '/blog', '/about', '/faq', '/stack', '/booking', '/contact', '/impressum', '/datenschutz']

const escapeXml = (value: string) => value.replaceAll('&', '&amp;')

export type SitemapPage = { path: string; languages: readonly Language[] }

/**
 * One entry per page per published language, each listing its published
 * siblings as alternates. A page still being translated is listed only in the
 * languages it is published in.
 */
export const buildSitemap = (pages: SitemapPage[]) => {
  const entries = pages.flatMap(({ path, languages: published }) =>
    published.map((language) => {
      const xDefault = published.includes(defaultLanguage) ? defaultLanguage : published[0]
      const alternates = [
        ...published.map(
          (alternate) =>
            `<xhtml:link rel="alternate" hreflang="${alternate}" href="${escapeXml(site.url + publicPath(alternate, path))}"/>`,
        ),
        `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(site.url + publicPath(xDefault, path))}"/>`,
      ].join('')

      return `<url><loc>${escapeXml(site.url + publicPath(language, path))}</loc>${alternates}</url>`
    }),
  )

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join('')}</urlset>`
}

/**
 * Every page in every language, plus the industry pages in the languages they
 * are translated into.
 */
export const sitemapPages = (paths: string[]): SitemapPage[] => [
  ...paths.map((path) => ({ path, languages })),
  ...industryPaths().map((path) => ({ path, languages: INDUSTRY_LANGUAGES })),
]

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async () => {
        // Only published work is listed: an unpublished project or post
        // answers 404, and a sitemap that points at 404s is worse than a
        // shorter sitemap.
        const [projectSlugs, postSlugs, serviceSlugs] = await Promise.all([
          fetchPublishedProjectSlugs(),
          fetchPublishedPostSlugs(),
          fetchPublishedServiceSlugs(),
        ])

        const paths = [
          ...staticPaths,
          ...serviceSlugs.map((slug) => `/services/${slug}`),
          ...projectSlugs.map((slug) => `/work/${slug}`),
          ...postSlugs.map((slug) => `/blog/${slug}`),
        ]

        return new Response(buildSitemap(sitemapPages(paths)), {
          // Crawlers fetch this often; a quarter of an hour spares the
          // database without keeping a newly published page out for long.
          headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
        })
      },
    },
  },
})
