// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PublicServiceCard } from '#/backend2/contracts/service.contract'

/**
 * The approved public services screens (Design Lab 22 Sep 2026, choices 1A–4A)
 * drawn from Backend2 data: the homepage grid and its hiding rule, the
 * `/services` list with its empty, error and "Load more" states, and the price
 * words in place. The router is replaced by plain links so each address can be
 * read off the page.
 */
const router = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(async () => {}) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, hash, children, ...rest }: Record<string, any>) => {
    let href = String(to)

    for (const [key, value] of Object.entries(params ?? {})) href = href.replace(`$${key}`, String(value))

    return (
      <a href={hash ? `${href}#${hash}` : href} {...rest}>
        {children}
      </a>
    )
  },
  useNavigate: () => router.navigate,
  useRouter: () => ({ invalidate: router.invalidate }),
}))

const server = vi.hoisted(() => ({ fetchServicesBatch: vi.fn() }))

// The server function is replaced: these tests draw the page, they do not read a database.
vi.mock('#/frontend/features/services-public/server/published-services', () => server)

const { HomeServicesV2, homeServicesView } = await import('#/frontend/features/services-public/HomeServicesV2')
const { ServicesListV2 } = await import('#/frontend/features/services-public/ServicesListV2')
const { PriceCard } = await import('#/frontend/features/services-public/ServicePrice')
const { getContent } = await import('#/frontend/content')

afterEach(() => {
  cleanup()
  server.fetchServicesBatch.mockReset()
  router.navigate.mockClear()
  router.invalidate.mockClear()
})

const card = (slug: string, over: Partial<PublicServiceCard> = {}): PublicServiceCard => ({
  slug,
  name: `${slug[0]!.toUpperCase()}${slug.slice(1)}`,
  summary: `About ${slug}`,
  included: [`${slug} one`, `${slug} two`],
  price: { mode: 'from', currency: 'EUR', amountCents: 99_000, period: 'one_time', promotion: null },
  publishedAt: null,
  ...over,
})

describe('the homepage services section', () => {
  it('hides the section when nothing is starred', () => {
    expect(homeServicesView({ source: 'v2', items: [] })).toBe('hidden')
    expect(homeServicesView({ source: 'v2', items: [card('websites')] })).toBe('v2')
  })

  it('draws each starred service with its letter, its summary and a link to its page', () => {
    render(
      <HomeServicesV2
        copy={getContent('en').home.services}
        items={[card('websites'), card('shopify')]}
        language="en"
      />,
    )

    expect(screen.getByText('W')).toBeTruthy()
    expect(screen.getByText('About shopify')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: /See details/ }).map((link) => link.getAttribute('href'))).toEqual([
      '/en/services/websites',
      '/en/services/shopify',
    ])
    expect(screen.getByRole('link', { name: /All services/ }).getAttribute('href')).toBe('/en/services')
  })

  it('lays out one, two, three and four cards the approved way', () => {
    const basisFor = (count: number) => {
      cleanup()
      const items = Array.from({ length: count }, (_, index) => card(`service${index}`))
      const { container } = render(<HomeServicesV2 copy={getContent('de').home.services} items={items} language="de" />)

      return container.querySelector('[data-count] > *')!.className
    }

    expect(basisFor(1)).toContain('md:basis-[min(100%,26rem)]')
    expect(basisFor(2)).toContain('md:basis-[calc((100%-1.25rem)/2)]')
    expect(basisFor(3)).toContain('md:basis-[calc((100%-2.5rem)/3)]')
    expect(basisFor(4)).toContain('md:basis-[calc((100%-1.25rem)/2)]')
    expect(basisFor(6)).toContain('md:basis-[calc((100%-2.5rem)/3)]')
  })

  it('speaks Arabic in Arabic', () => {
    render(<HomeServicesV2 copy={getContent('ar').home.services} items={[card('websites', { name: 'مواقع' })]} language="ar" />)

    expect(screen.getByText('م')).toBeTruthy()
    expect(screen.getByRole('link', { name: /كل الخدمات/ }).getAttribute('href')).toBe('/ar/services')
    expect(screen.getByRole('link', { name: /التفاصيل/ }).getAttribute('href')).toBe('/ar/services/websites')
  })
})

describe('the /services list', () => {
  it('shows each service with its price line, what is included and "See details"', () => {
    render(
      <ServicesListV2
        data={{ source: 'v2', status: 'ok', items: [card('websites'), card('care', {
          price: { mode: 'fixed', currency: 'EUR', amountCents: 4_990, period: 'monthly', promotion: { amountCents: 3_990, label: 'Angebot' } },
        })], total: 2 }}
        page={1}
        language="de"
      />,
    )

    // "einmalig" belongs to the service page only (choice 4A).
    expect(screen.getByText(/ab/).textContent).toBe('ab 990 €')
    expect(screen.queryByText(/einmalig/)).toBeNull()
    expect(screen.getByText('Angebot')).toBeTruthy()
    expect(screen.getByText('/ Monat')).toBeTruthy()
    expect(screen.getAllByText('Das kann dazugehören')).toHaveLength(2)
    expect(screen.getAllByRole('link', { name: /Details ansehen/ })[1]!.getAttribute('href')).toBe('/de/services/care')
    // The address doubles as the anchor the hero pills link to.
    expect(document.getElementById('websites')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Mehr Leistungen laden/ })).toBeNull()
  })

  it('offers "Load more" while more exist, and asks for the next page', () => {
    const items = Array.from({ length: 6 }, (_, index) => card(`service${index}`))

    render(<ServicesListV2 data={{ source: 'v2', status: 'ok', items, total: 8 }} page={1} language="en" />)
    fireEvent.click(screen.getByRole('button', { name: 'Load more services' }))

    expect(router.navigate).toHaveBeenCalledWith(expect.objectContaining({ search: { page: 2 }, resetScroll: false }))
  })

  it('fetches only the missing batch when the page grows, and keeps what is shown', async () => {
    const first = Array.from({ length: 6 }, (_, index) => card(`service${index}`))
    server.fetchServicesBatch.mockResolvedValue({ items: [card('service6'), card('service7')], total: 8 })

    const { rerender } = render(<ServicesListV2 data={{ source: 'v2', status: 'ok', items: first, total: 8 }} page={1} language="en" />)
    expect(server.fetchServicesBatch).not.toHaveBeenCalled()

    rerender(<ServicesListV2 data={{ source: 'v2', status: 'ok', items: first, total: 8 }} page={2} language="en" />)

    expect(await screen.findByText('Service7')).toBeTruthy()
    expect(server.fetchServicesBatch).toHaveBeenCalledWith({ data: { language: 'en', offset: 6, limit: 2 } })
    expect(screen.getByText('Service0')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Load more services' })).toBeNull()
  })

  it('says so when nothing is published, and points to contact', () => {
    render(<ServicesListV2 data={{ source: 'v2', status: 'ok', items: [], total: 0 }} page={1} language="en" />)

    expect(screen.getByText(/The services are being updated/)).toBeTruthy()
    expect(screen.getByRole('link', { name: /Request a call/ }).getAttribute('href')).toBe('/en/contact')
  })

  it('explains a failed load and retries it', () => {
    render(<ServicesListV2 data={{ source: 'v2', status: 'error' }} page={1} language="ar" />)

    expect(screen.getByRole('alert').textContent).toContain('تعذّر تحميل الخدمات الآن.')
    fireEvent.click(screen.getByRole('button', { name: 'حاول مرة أخرى' }))
    expect(router.invalidate).toHaveBeenCalledTimes(1)
  })
})

describe('the price card on a service page', () => {
  it('says "one-time" under a one-time price and leads to contact', () => {
    render(<PriceCard price={card('websites').price!} language="en" />)

    expect(screen.getByText('one-time')).toBeTruthy()
    expect(screen.getByText('€990')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Request a call/ }).getAttribute('href')).toBe('/en/contact')
  })

  it('strikes the regular price through while an offer is on, with words for a screen reader', () => {
    render(
      <PriceCard
        price={{ mode: 'fixed', currency: 'EUR', amountCents: 4_990, period: 'monthly', promotion: { amountCents: 3_990, label: 'عرض' } }}
        language="ar"
      />,
    )

    expect(document.querySelector('del')?.textContent).toBe('السعر العادي 49,90 €')
    expect(screen.getByText('شهرياً')).toBeTruthy()
    expect(screen.getByText('عرض')).toBeTruthy()
  })

  it('shows a quote as its own words, with no number', () => {
    render(<PriceCard price={{ mode: 'quote' }} language="de" />)

    expect(screen.getByText('Preis auf Anfrage')).toBeTruthy()
    expect(document.querySelector('del')).toBeNull()
  })
})
