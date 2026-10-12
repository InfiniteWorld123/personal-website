import { describe, expect, it } from 'vitest'
import { emptyServicePrice, publicPriceOf } from '#/backend2/contracts/service.contract'
import { Route as contactRoute } from '#/frontend/routes/$lang.contact'
import { Route as servicesRoute } from '#/frontend/routes/$lang.services.index'

/**
 * `/services?plan=` as the router sees it: how the address is read, that every
 * `?plan=` variant names the bare `/services` as its canonical, and that the
 * packages' prices reach the structured data. No new URL is announced.
 */

type Search = Record<string, unknown>
type Head = {
  meta?: Array<Record<string, unknown> | undefined>
  links?: Array<Record<string, string>>
  scripts?: Array<{ children?: string }>
}

const searchOf = (route: { options: { validateSearch?: unknown } }, input: Search) =>
  (route.options.validateSearch as (search: Search) => Search)(input)

const headOf = async (language: string, loaderData?: unknown): Promise<Head> =>
  (await (servicesRoute.options.head as (context: object) => Head | Promise<Head>)({
    params: { lang: language },
    loaderData,
  })) ?? {}

const package_ = (slug: string, name: string, amountCents: number, rentCents: number | null) => ({
  slug,
  name,
  summary: `Über ${name}`,
  included: ['Website'],
  price: publicPriceOf(
    {
      ...emptyServicePrice(),
      mode: 'fixed',
      amountCents,
      period: 'one_time',
      rent: { monthlyCents: rentCents, minTermMonths: 12 },
    },
    '',
  ),
  publishedAt: null,
})

describe('?plan= on /services', () => {
  it('reads kaufen, raten and mieten', () => {
    expect(searchOf(servicesRoute, { plan: 'mieten' })).toEqual({ page: undefined, plan: 'mieten' })
    expect(searchOf(servicesRoute, { plan: 'raten' })).toEqual({ page: undefined, plan: 'raten' })
  })

  it('does not write the default back into the address', () => {
    expect(searchOf(servicesRoute, { plan: 'kaufen' })).toEqual({ page: undefined, plan: undefined })
    expect(searchOf(servicesRoute, {})).toEqual({ page: undefined, plan: undefined })
  })

  it('treats anything else as the default instead of an error', () => {
    for (const plan of ['rent', 'MIETEN', '', 7, ['mieten'], null]) {
      expect(searchOf(servicesRoute, { plan }), String(plan)).toEqual({ page: undefined, plan: undefined })
    }
  })

  it('keeps the page and the plan apart', () => {
    expect(searchOf(servicesRoute, { page: '3', plan: 'raten' })).toEqual({ page: 3, plan: 'raten' })
    expect(searchOf(servicesRoute, { page: 1, plan: 'mieten' })).toEqual({ page: undefined, plan: 'mieten' })
  })
})

describe('the head of /services', () => {
  const loaderData = {
    data: {
      source: 'v2',
      status: 'ok',
      total: 3,
      items: [
        package_('gefunden-werden', 'Gefunden werden', 99_900, 3_499),
        package_('vertrauen-gewinnen', 'Vertrauen gewinnen', 149_900, 4_999),
        { ...package_('software', 'Software', 0, null), price: { mode: 'quote' } },
      ],
    },
  }

  it.each(['de', 'en', 'ar'])('names the bare /services as the canonical address in %s', async (language) => {
    // The head is built from the path alone: no search ever reaches it, so
    // `?plan=mieten` and `?page=2` variants cannot become their own pages.
    const head = await headOf(language, loaderData)
    const canonical = head.links!.find((link) => link.rel === 'canonical')!.href
    const alternates = head.links!.filter((link) => link.rel === 'alternate').map((link) => link.href)

    expect(canonical).toBe(`https://yamanwarda.de/${language}/services`)
    expect(canonical).not.toContain('?')
    for (const href of alternates) expect(href).not.toContain('?')
    expect(head.meta!.find((tag) => tag?.property === 'og:url')!.content).toBe(canonical)
  })

  it('adds the rent as a monthly price specification and keeps buying as the main Offer price', async () => {
    const head = await headOf('de', loaderData)
    const graph = JSON.parse(head.scripts![0]!.children!)['@graph'] as Array<Record<string, any>>
    const offers = graph.find((node) => node['@type'] === 'ProfessionalService')!.makesOffer as Array<Record<string, any>>

    expect(offers.find((offer) => offer.name === 'Gefunden werden')).toMatchObject({ price: 999, priceCurrency: 'EUR' })
    expect(offers.find((offer) => offer.name === 'Gefunden werden (Mieten)')).toMatchObject({
      priceSpecification: { '@type': 'UnitPriceSpecification', price: 34.99, unitCode: 'MON', priceCurrency: 'EUR' },
    })
    expect(offers.find((offer) => offer.name === 'Vertrauen gewinnen (Mieten)')).toMatchObject({
      priceSpecification: { price: 49.99, unitCode: 'MON' },
    })
    // A price on request has no number to state.
    expect(offers.map((offer) => offer.name)).not.toContain('Software')
  })

  it('still builds the head when the list could not be read', async () => {
    const head = await headOf('de', { data: { source: 'v2', status: 'error' } })

    expect(head.links!.find((link) => link.rel === 'canonical')!.href).toBe('https://yamanwarda.de/de/services')
  })

  it('still builds the head before the loader has produced anything', async () => {
    const head = await headOf('en', undefined)

    expect(head.links!.find((link) => link.rel === 'canonical')!.href).toBe('https://yamanwarda.de/en/services')
  })
})

describe('?package= and ?plan= on /contact', () => {
  it('keeps a package address and a plan', () => {
    expect(searchOf(contactRoute, { package: 'gefunden-werden', plan: 'mieten' })).toEqual({
      package: 'gefunden-werden',
      plan: 'mieten',
    })
  })

  it('drops what is not a package address or a plan, rather than rejecting the page', () => {
    expect(searchOf(contactRoute, { package: '<script>', plan: 'bitcoin' })).toEqual({ package: undefined, plan: 'kaufen' })
    expect(searchOf(contactRoute, { package: 'x'.repeat(81) })).toEqual({ package: undefined, plan: undefined })
    expect(searchOf(contactRoute, { package: ['a'] })).toEqual({ package: undefined, plan: undefined })
    expect(searchOf(contactRoute, {})).toEqual({ package: undefined, plan: undefined })
  })
})
