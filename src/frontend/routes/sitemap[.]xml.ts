import { createFileRoute } from '@tanstack/react-router'
import { site } from '#/frontend/content/site'
import { fetchPublishedPostSlugs } from '#/frontend/features/blog/server/published-posts'
import { fetchPublishedServiceSlugs } from '#/frontend/features/services-public/server/published-services'
import { fetchPublishedProjectSlugs } from '#/frontend/features/work/server/published-projects'
import { languages } from '#/frontend/i18n/language'
import { publicPath } from '#/frontend/lib/seo'

// `/booking` is the page the whole site points at, and it was the only public
// page the sitemap did not declare — found late and re-crawled least often,
// which is the opposite of what a page meant to fill a calendar needs.
const staticPaths = ['/', '/services', '/work', '/blog', '/about', '/faq', '/stack', '/booking', '/contact', '/impressum', '/datenschutz']

const escapeXml = (value: string) => value.replaceAll('&', '&amp;')

/** One entry per page per language, each listing its siblings as alternates. */
const buildSitemap = (paths: string[]) => {
  const entries = paths.flatMap((path) =>
    languages.map((language) => {
      const alternates = [
        ...languages.map(
          (alternate) =>
            `<xhtml:link rel="alternate" hreflang="${alternate}" href="${escapeXml(site.url + publicPath(alternate, path))}"/>`,
        ),
        `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(site.url + publicPath('en', path))}"/>`,
      ].join('')

      return `<url><loc>${escapeXml(site.url + publicPath(language, path))}</loc>${alternates}</url>`
    }),
  )

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join('')}</urlset>`
}

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

        return new Response(buildSitemap(paths), {
          // Crawlers fetch this often; a quarter of an hour spares the
          // database without keeping a newly published page out for long.
          headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=900' },
        })
      },
    },
  },
})
