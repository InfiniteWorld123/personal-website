import { createFileRoute } from '@tanstack/react-router'
import { projectOrder, site } from '#/frontend/content/site'
import { languages } from '#/frontend/i18n/language'
import { publicPath } from '#/frontend/lib/seo'

const paths = ['/', '/services', '/work', '/about', '/faq', '/stack', '/contact', '/impressum', '/datenschutz', ...projectOrder.map((slug) => `/work/${slug}`)]

const escapeXml = (value: string) => value.replaceAll('&', '&amp;')

/** One entry per page per language, each listing its siblings as alternates. */
const buildSitemap = () => {
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
      GET: () =>
        new Response(buildSitemap(), {
          headers: { 'Content-Type': 'application/xml; charset=utf-8' },
        }),
    },
  },
})
