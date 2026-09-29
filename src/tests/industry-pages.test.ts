import { afterEach, describe, expect, it } from 'vitest'
import { content } from '#/frontend/content/base'
import { applyContentOverrides, emptyOverrides } from '#/frontend/content/overrides'
import { INDUSTRY_SLUGS, industryBySlug, industryOrder } from '#/frontend/features/industries/industries'
import { Route as industryRoute } from '#/frontend/routes/$lang.webdesign-erfurt.$industry'
import { Route as hubRoute } from '#/frontend/routes/$lang.webdesign-erfurt.index'
import { buildSitemap, sitemapPages } from '#/frontend/routes/sitemap[.]xml'

type Tag = Record<string, unknown> | undefined
type Head = { meta?: Tag[]; links?: Tag[]; scripts?: Array<{ children?: string } | undefined> }

const runHead = (route: { options: { head?: unknown } }, context: object): Head => {
  const head = route.options.head as ((context: object) => Head) | undefined
  return head?.(context) ?? {}
}

const runLoader = (params: { lang: string; industry: string }) => {
  const loader = industryRoute.options.loader as unknown as (context: { params: typeof params }) => { id: string }
  return loader({ params })
}

const titleOf = (head: Head) => head.meta?.find((tag) => tag && 'title' in tag)?.title
const robotsOf = (head: Head) => head.meta?.find((tag) => tag?.name === 'robots')?.content
const hreflangs = (head: Head) =>
  (head.links ?? []).filter((link) => link?.rel === 'alternate' && link.hrefLang).map((link) => link?.hrefLang)
const graphOf = (head: Head) => JSON.parse(head.scripts?.[0]?.children ?? '{}')['@graph'] as Array<Record<string, unknown>>

const industryHead = (lang: string, industry: string) =>
  runHead(industryRoute, { params: { lang, industry }, loaderData: runLoader({ lang, industry }) })

afterEach(() => applyContentOverrides(emptyOverrides()))

describe('the /webdesign-erfurt pages', () => {
  it('knows exactly the four industry slugs and 404s any other', () => {
    expect(industryOrder.map((id) => INDUSTRY_SLUGS[id])).toEqual(['cafes-restaurants', 'friseure', 'praxen', 'handwerk'])
    for (const id of industryOrder) expect(industryBySlug(INDUSTRY_SLUGS[id])).toBe(id)

    expect(() => runLoader({ lang: 'de', industry: 'baecker' })).toThrow()
  })

  it('uses the owner’s German titles, is indexed in German and names only German as hreflang', () => {
    const hub = runHead(hubRoute, { params: { lang: 'de' } })
    expect(titleOf(hub)).toBe('Webdesign Erfurt · Websites für lokale Betriebe | Yaman Warda')
    expect(robotsOf(hub)).toBe('index, follow')
    expect(hreflangs(hub)).toEqual(['de', 'x-default'])

    const cafes = industryHead('de', 'cafes-restaurants')
    expect(titleOf(cafes)).toBe('Website für Cafés & Restaurants in Erfurt | Yaman Warda')
    expect(robotsOf(cafes)).toBe('index, follow')
    expect(titleOf(industryHead('de', 'handwerk'))).toBe('Website für Handwerker in Erfurt & Thüringen | Yaman Warda')
  })

  it('keeps English and Arabic out of search until they are translated', () => {
    for (const lang of ['en', 'ar']) {
      expect(robotsOf(runHead(hubRoute, { params: { lang } })), lang).toBe('noindex, nofollow')
      expect(robotsOf(industryHead(lang, 'praxen')), lang).toBe('noindex, nofollow')
    }
  })

  it('describes an industry page as an FAQ with a local Service, and the hub without questions', () => {
    const graph = graphOf(industryHead('de', 'friseure'))
    const page = graph.find((node) => node['@type'] === 'FAQPage')
    expect(page).toBeDefined()
    expect(page?.mainEntity).toHaveLength(content.de.industries.pages.hairdressers.faq.length)
    expect((page?.mainEntity as Array<{ name: string }>)[0].name).toBe('Ich habe schon ein Buchungstool – geht das?')

    const service = graph.find((node) => node['@type'] === 'Service')
    expect(service?.areaServed).toEqual([
      { '@type': 'City', name: 'Erfurt' },
      { '@type': 'State', name: 'Thüringen' },
    ])
    expect(service?.provider).toEqual({ '@id': 'https://yamanwarda.de/#business' })

    const crumbs = graph.find((node) => node['@type'] === 'BreadcrumbList')?.itemListElement as Array<{ name: string }>
    expect(crumbs.map((crumb) => crumb.name)).toEqual(['Yaman Warda', 'Webdesign Erfurt', 'Friseure & Barbershops'])

    const hub = graphOf(runHead(hubRoute, { params: { lang: 'de' } }))
    expect(hub.some((node) => node['@type'] === 'FAQPage')).toBe(false)
    expect(hub.some((node) => node['@type'] === 'Service')).toBe(true)
  })

  it('lists the five pages in the sitemap in German only', () => {
    const xml = buildSitemap(sitemapPages(['/']))
    for (const path of ['', '/cafes-restaurants', '/friseure', '/praxen', '/handwerk']) {
      expect(xml).toContain(`<loc>https://yamanwarda.de/de/webdesign-erfurt${path}</loc>`)
      expect(xml).not.toContain(`<loc>https://yamanwarda.de/en/webdesign-erfurt${path}</loc>`)
      expect(xml).not.toContain(`https://yamanwarda.de/ar/webdesign-erfurt${path}"`)
    }
    // Other pages keep all three languages.
    expect(xml).toContain('<loc>https://yamanwarda.de/en</loc>')
  })

  it('links the hub from the footer in every language and from the services page', () => {
    for (const language of ['de', 'en', 'ar'] as const) {
      expect(content[language].shell.footer.more.map((link) => link.to), language).toContain('/$lang/webdesign-erfurt')
      expect(content[language].services.shared.industriesLink.length, language).toBeGreaterThan(0)
    }
    expect(content.de.shell.footer.more.find((link) => link.to === '/$lang/webdesign-erfurt')?.label).toBe('Webdesign Erfurt')
  })

  it('gives every industry the same shape in every language, so the editor can reach each field', () => {
    for (const language of ['de', 'en', 'ar'] as const) {
      for (const id of industryOrder) {
        const page = content[language].industries.pages[id]
        expect(page.needs.items.length, `${language} ${id}`).toBeGreaterThan(0)
        expect(page.faq.length, `${language} ${id}`).toBeGreaterThan(0)
      }
    }
  })
})
