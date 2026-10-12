// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import {
  type PublicServiceCard,
  emptyServicePrice,
  publicPriceOf,
} from '#/backend2/contracts/service.contract'
import { applyContentOverrides, emptyOverrides } from '#/frontend/content/overrides'

/**
 * The Buy / Instalments / Rent tabs on `/services`: the tab control, what each
 * package shows under each tab, the teaser, the notes under the cards and the
 * links to ask. The router is replaced by plain links so each address can be
 * read off the page, and `navigate` records what a tab asks for.
 */
const router = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(async () => {}) }))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, params, hash, search, children, ...rest }: Record<string, any>) => {
    let href = String(to)

    for (const [key, value] of Object.entries(params ?? {})) href = href.replace(`$${key}`, String(value))

    const query = new URLSearchParams(
      Object.entries(search ?? {}).filter(([, value]) => value !== undefined) as Array<[string, string]>,
    ).toString()

    return (
      <a href={`${href}${query ? `?${query}` : ''}${hash ? `#${hash}` : ''}`} {...rest}>
        {children}
      </a>
    )
  },
  useNavigate: () => router.navigate,
  useRouter: () => ({ invalidate: router.invalidate }),
}))

vi.mock('#/frontend/features/services-public/server/published-services', () => ({ fetchServicesBatch: vi.fn() }))

const { ServicesListV2 } = await import('#/frontend/features/services-public/ServicesListV2')

afterEach(() => {
  cleanup()
  router.navigate.mockClear()
  applyContentOverrides(emptyOverrides())
})

const NBSP = ' '

const fixed = (amountCents: number, plans: Partial<ReturnType<typeof emptyServicePrice>> = {}) =>
  publicPriceOf(
    { ...emptyServicePrice(), mode: 'fixed', amountCents, period: 'one_time', ...plans },
    'Startangebot',
  )!

const card = (slug: string, name: string, price: PublicServiceCard['price']): PublicServiceCard => ({
  slug,
  name,
  summary: `Über ${name}`,
  included: [`${name} eins`, `${name} zwei`],
  price,
  publishedAt: null,
})

const FOUND = card(
  'gefunden-werden',
  'Gefunden werden',
  fixed(99_900, {
    instalment: { monthlyCents: 9_900, months: 12 },
    rent: { monthlyCents: 3_499, minTermMonths: 12 },
  }),
)

const TRUST = card(
  'vertrauen-gewinnen',
  'Vertrauen gewinnen',
  fixed(149_900, {
    instalment: { monthlyCents: 14_900, months: 12 },
    rent: { monthlyCents: 4_999, minTermMonths: 12 },
  }),
)

const draw = (
  items: PublicServiceCard[],
  options: { plan?: 'kaufen' | 'raten' | 'mieten'; language?: 'de' | 'en' | 'ar'; page?: number } = {},
) =>
  render(
    <ServicesListV2
      data={{ source: 'v2', status: 'ok', items, total: items.length }}
      page={options.page ?? 1}
      plan={options.plan}
      language={options.language ?? 'de'}
    />,
  )

/**
 * The paragraphs a visitor can see in a card: the payment models that are not
 * chosen are `invisible`. One string per paragraph, spaces normalised.
 */
const lines = (root: Element) =>
  [...root.querySelectorAll('p')]
    .filter((paragraph) => !paragraph.closest('.invisible'))
    .map((paragraph) => paragraph.textContent!.replace(/[ \t\r\n]+/gu, ' ').trim())

const visibleText = (root: Element) => lines(root).join(' | ')

const tab = (name: string) => screen.getByRole('tab', { name })

/* =========================================================== the tab control */

describe('the tab control', () => {
  it('has a tab list with three tabs, Buy selected by default', () => {
    draw([FOUND, TRUST])

    const list = screen.getByRole('tablist', { name: 'Zahlungsmodell' })
    const tabs = within(list).getAllByRole('tab')

    expect(tabs.map((entry) => entry.textContent)).toEqual(['Kaufen', 'In Raten', 'Mieten'])
    expect(tabs.map((entry) => entry.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
  })

  it('names the tabs in English and Arabic', () => {
    draw([FOUND], { language: 'en' })
    expect(screen.getAllByRole('tab').map((entry) => entry.textContent)).toEqual(['Buy', 'Instalments', 'Rent'])

    cleanup()
    draw([FOUND], { language: 'ar' })
    expect(screen.getAllByRole('tab').map((entry) => entry.textContent)).toEqual(['شراء', 'تقسيط', 'إيجار'])
  })

  it('selects the tab the address asks for', () => {
    draw([FOUND, TRUST], { plan: 'mieten' })

    expect(tab('Mieten').getAttribute('aria-selected')).toBe('true')
    expect(tab('Kaufen').getAttribute('aria-selected')).toBe('false')
  })

  it('lets only the selected tab take the keyboard focus, as a tab list does', () => {
    draw([FOUND, TRUST], { plan: 'raten' })

    expect(screen.getAllByRole('tab').map((entry) => entry.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
  })

  it('points each tab at the one panel the packages are drawn in', () => {
    draw([FOUND, TRUST], { plan: 'raten' })

    const panel = screen.getByRole('tabpanel')

    expect(panel.getAttribute('aria-labelledby')).toBe(tab('In Raten').id)
    for (const entry of screen.getAllByRole('tab')) expect(entry.getAttribute('aria-controls')).toBe(panel.id)
    expect(within(panel).getAllByRole('article')).toHaveLength(2)
  })

  it('writes the chosen tab into the address by replacing it, not stacking history', () => {
    draw([FOUND, TRUST])

    fireEvent.click(tab('Mieten'))

    expect(router.navigate).toHaveBeenCalledWith({
      to: '/$lang/services',
      params: { lang: 'de' },
      search: { page: undefined, plan: 'mieten' },
      replace: true,
      resetScroll: false,
    })
  })

  it('leaves the address clean for Buy, the default', () => {
    draw([FOUND, TRUST], { plan: 'mieten' })

    fireEvent.click(tab('Kaufen'))

    expect(router.navigate.mock.calls[0]![0].search).toEqual({ page: undefined, plan: undefined })
  })

  it('keeps the page the visitor has loaded when the tab changes', () => {
    draw([FOUND, TRUST], { page: 2 })

    fireEvent.click(tab('In Raten'))

    expect(router.navigate.mock.calls[0]![0].search).toEqual({ page: 2, plan: 'raten' })
  })

  describe('with the keyboard', () => {
    const press = (key: string, from: string) => {
      fireEvent.keyDown(tab(from), { key })

      return router.navigate.mock.calls.at(-1)?.[0].search.plan
    }

    it('moves right with ArrowRight and left with ArrowLeft, and wraps round', () => {
      draw([FOUND, TRUST], { plan: 'raten' })

      expect(press('ArrowRight', 'In Raten')).toBe('mieten')
      expect(press('ArrowLeft', 'In Raten')).toBeUndefined() // Buy: the clean address

      cleanup()
      draw([FOUND, TRUST], { plan: 'mieten' })
      expect(press('ArrowRight', 'Mieten')).toBeUndefined() // wraps to Buy

      cleanup()
      draw([FOUND, TRUST], { plan: 'kaufen' })
      expect(press('ArrowLeft', 'Kaufen')).toBe('mieten') // wraps to Rent
    })

    it('jumps to the ends with Home and End', () => {
      draw([FOUND, TRUST], { plan: 'raten' })

      expect(press('End', 'In Raten')).toBe('mieten')
      expect(press('Home', 'In Raten')).toBeUndefined()
    })

    it('moves focus with the selection', () => {
      draw([FOUND, TRUST], { plan: 'raten' })
      tab('In Raten').focus()

      fireEvent.keyDown(tab('In Raten'), { key: 'ArrowRight' })

      expect(document.activeElement).toBe(tab('Mieten'))
    })

    it('goes the other way in Arabic, where the row is mirrored', () => {
      draw([FOUND, TRUST], { plan: 'raten', language: 'ar' })

      // ArrowLeft is "forward" on a row that reads right to left.
      fireEvent.keyDown(tab('تقسيط'), { key: 'ArrowLeft' })
      expect(router.navigate.mock.calls.at(-1)![0].search.plan).toBe('mieten')

      fireEvent.keyDown(tab('تقسيط'), { key: 'ArrowRight' })
      expect(router.navigate.mock.calls.at(-1)![0].search.plan).toBeUndefined()
    })

    it('ignores every other key', () => {
      draw([FOUND, TRUST])

      fireEvent.keyDown(tab('Kaufen'), { key: 'Enter' })
      fireEvent.keyDown(tab('Kaufen'), { key: 'a' })

      expect(router.navigate).not.toHaveBeenCalled()
    })
  })
})

/* ================================================================ the cards */

describe('what a card shows under each tab', () => {
  const cardFor = (name: string) => screen.getByRole('heading', { name }).closest('article')!

  it('Buy: the price and "einmalig"', () => {
    draw([FOUND, TRUST])

    expect(lines(cardFor('Gefunden werden'))).toEqual(
      expect.arrayContaining([`999${NBSP}€`, 'einmalig']),
    )
    expect(lines(cardFor('Vertrauen gewinnen'))).toEqual(expect.arrayContaining([`1.499${NBSP}€`, 'einmalig']))
  })

  it('Instalments: the monthly price, the count, the computed total and who owns it', () => {
    draw([FOUND, TRUST], { plan: 'raten' })

    const shown = lines(cardFor('Gefunden werden'))

    expect(shown).toContain(`99${NBSP}€ / Monat`)
    expect(shown).toContain(`12 Raten · insgesamt 1.188${NBSP}€`)
    expect(shown).toContain('Danach gehört die Website dir')
    expect(shown).not.toContain('einmalig')
    expect(lines(cardFor('Vertrauen gewinnen'))).toContain(`12 Raten · insgesamt 1.788${NBSP}€`)
  })

  it('Rent: the monthly price, the term, what it includes and who owns it', () => {
    draw([FOUND, TRUST], { plan: 'mieten' })

    const shown = lines(cardFor('Gefunden werden'))

    expect(shown).toContain(`34,99${NBSP}€ / Monat`)
    expect(shown).toContain('Mindestlaufzeit 12 Monate, danach monatlich kündbar · Hosting und Wartung inklusive')
    expect(shown).toContain('Die Website bleibt Eigentum von Yaman Warda')
    expect(lines(cardFor('Vertrauen gewinnen'))).toContain(`49,99${NBSP}€ / Monat`)
  })

  it('shows the instalment and rent lines in English and Arabic', () => {
    draw([FOUND], { plan: 'raten', language: 'en' })
    expect(lines(screen.getByRole('article'))).toContain('12 instalments · €1,188 in total')

    cleanup()
    draw([FOUND], { plan: 'mieten', language: 'ar' })
    expect(lines(screen.getByRole('article'))).toContain(`34,99${NBSP}يورو شهرياً`)
  })

  it('keeps the other payment models in the page but out of sight and out of the reading order', () => {
    draw([FOUND, TRUST], { plan: 'kaufen' })

    const hidden = [...cardFor('Gefunden werden').querySelectorAll('.invisible')]

    expect(hidden).toHaveLength(2)
    for (const element of hidden) expect(element.getAttribute('aria-hidden')).toBe('true')
    expect(hidden.map((element) => element.textContent).join(' ')).toContain('/ Monat')
  })

  it('draws the same blocks under every tab, so the height does not depend on the tab', () => {
    const structure = (plan: 'kaufen' | 'raten' | 'mieten') => {
      cleanup()
      draw([FOUND, TRUST], { plan })

      return cardFor('Gefunden werden').querySelectorAll('.col-start-1.row-start-1').length
    }

    expect(structure('kaufen')).toBe(3)
    expect(structure('raten')).toBe(3)
    expect(structure('mieten')).toBe(3)
  })

  it('says "Auf Anfrage" under a model the package does not offer, and keeps the card', () => {
    const rentOnly = card(
      'gefunden-werden',
      'Gefunden werden',
      fixed(99_900, { rent: { monthlyCents: 3_499, minTermMonths: 12 } }),
    )

    draw([rentOnly, TRUST], { plan: 'raten' })

    expect(lines(cardFor('Gefunden werden'))).toContain('Auf Anfrage')
    expect(lines(cardFor('Vertrauen gewinnen'))).toContain(`149${NBSP}€ / Monat`)
    // Still there to ask about.
    expect(within(cardFor('Gefunden werden')).getByRole('link', { name: /Paket anfragen/ })).toBeTruthy()
  })

  it('keeps an offer price on Buy', () => {
    const offer = card(
      'gefunden-werden',
      'Gefunden werden',
      fixed(99_900, {
        promotion: { active: true, amountCents: 79_900 },
        instalment: { monthlyCents: 9_900, months: 12 },
      }),
    )

    draw([offer])

    const text = visibleText(cardFor('Gefunden werden'))

    expect(text).toContain('Startangebot')
    expect(text).toContain(`799${NBSP}€`)
    expect(cardFor('Gefunden werden').querySelector('del')!.textContent).toContain(`999${NBSP}€`)
  })
})

/* ==================================================== the links to ask */

describe('asking about a package', () => {
  const askHref = (name: string) =>
    within(screen.getByRole('heading', { name }).closest('article')!)
      .getByRole('link', { name: /Paket anfragen/ })
      .getAttribute('href')

  it('carries the package and the payment model on the link', () => {
    draw([FOUND, TRUST], { plan: 'mieten' })

    expect(askHref('Gefunden werden')).toBe('/de/contact?package=gefunden-werden&plan=mieten')
    expect(askHref('Vertrauen gewinnen')).toBe('/de/contact?package=vertrauen-gewinnen&plan=mieten')
  })

  it('says Buy when nothing else is chosen', () => {
    draw([FOUND, TRUST])

    expect(askHref('Gefunden werden')).toBe('/de/contact?package=gefunden-werden&plan=kaufen')
  })

  it('uses the same words in every language', () => {
    draw([FOUND], { plan: 'raten', language: 'en' })

    expect(
      within(screen.getByRole('article')).getByRole('link', { name: /Ask about this package/ }).getAttribute('href'),
    ).toBe('/en/contact?package=gefunden-werden&plan=raten')
  })
})

/* =========================================================== the teaser */

describe('the teaser under the tabs', () => {
  const teaser = () => screen.queryByRole('button', { name: /Kein Budget für alles auf einmal/ })

  it('shows on Buy, with the cheapest rent worked out from the data', () => {
    draw([FOUND, TRUST])

    expect(teaser()!.textContent).toBe(`Kein Budget für alles auf einmal? Schon ab 34,99${NBSP}€/Monat mieten`)
  })

  it('follows the prices: change the cheapest rent and the teaser changes', () => {
    const cheaper = card(
      'gefunden-werden',
      'Gefunden werden',
      fixed(99_900, { rent: { monthlyCents: 2_950, minTermMonths: 12 } }),
    )

    draw([cheaper, TRUST])

    expect(teaser()!.textContent).toContain(`29,50${NBSP}€/Monat`)
  })

  it('takes the lowest rent even when it belongs to a later package', () => {
    draw([TRUST, FOUND])

    expect(teaser()!.textContent).toContain(`34,99${NBSP}€`)
  })

  it('switches to the Rent tab when pressed', () => {
    draw([FOUND, TRUST])

    fireEvent.click(teaser()!)

    expect(router.navigate.mock.calls[0]![0].search).toEqual({ page: undefined, plan: 'mieten' })
  })

  it('is gone on Instalments and Rent', () => {
    draw([FOUND, TRUST], { plan: 'raten' })
    expect(teaser()).toBeNull()

    cleanup()
    draw([FOUND, TRUST], { plan: 'mieten' })
    expect(teaser()).toBeNull()
  })

  it('is not there when nothing can be rented', () => {
    const instalmentsOnly = card(
      'gefunden-werden',
      'Gefunden werden',
      fixed(99_900, { instalment: { monthlyCents: 9_900, months: 12 } }),
    )

    draw([instalmentsOnly])

    expect(teaser()).toBeNull()
  })

  it('is written in English and Arabic', () => {
    draw([FOUND], { language: 'en' })
    expect(screen.getByRole('button', { name: /Rent from €34\.99\/month/ })).toBeTruthy()

    cleanup()
    draw([FOUND], { language: 'ar' })
    expect(screen.getByRole('button', { name: new RegExp(`34,99${NBSP}يورو شهرياً`) })).toBeTruthy()
  })
})

/* ========================================================== the notes */

describe('the notes under the cards', () => {
  const FEE = 'Kleine Änderungen nach dem Launch: 16 € pro Änderung'
  const ONE_TIME = 'Einmalige Preise.'

  it('show the fee for small changes under every tab', () => {
    for (const plan of ['kaufen', 'raten', 'mieten'] as const) {
      cleanup()
      draw([FOUND, TRUST], { plan })

      expect(screen.getByText(FEE), plan).toBeTruthy()
    }
  })

  it('show the tax note only once the owner has written one', () => {
    draw([FOUND, TRUST])
    expect(screen.queryByText('Alle Preise zzgl. MwSt.')).toBeNull()

    cleanup()
    applyContentOverrides({ ...emptyOverrides(), de: { 'services.pricing.taxNote': 'Alle Preise zzgl. MwSt.' } })

    for (const plan of ['kaufen', 'raten', 'mieten'] as const) {
      cleanup()
      draw([FOUND, TRUST], { plan })

      expect(screen.getByText('Alle Preise zzgl. MwSt.'), plan).toBeTruthy()
    }
  })

  it('treat a tax note of only spaces as empty', () => {
    applyContentOverrides({ ...emptyOverrides(), de: { 'services.pricing.taxNote': '   ' } })

    const { container } = draw([FOUND, TRUST])

    expect(container.textContent).not.toContain('MwSt')
    // Fee only: no stray empty paragraph.
    expect([...container.querySelectorAll('p')].filter((paragraph) => paragraph.textContent === '')).toHaveLength(0)
  })

  it('use the owner\'s rewording of the rent note', () => {
    applyContentOverrides({
      ...emptyOverrides(),
      de: { 'services.pricing.rentIncludes': 'Betrieb und Pflege dabei' },
    })

    draw([FOUND, TRUST], { plan: 'mieten' })

    expect(visibleText(document.body)).toContain('danach monatlich kündbar · Betrieb und Pflege dabei')
  })

  it('keep "Einmalige Preise" to the tab where it is true, and keep its space on the others', () => {
    draw([FOUND, TRUST])
    expect(screen.getByText(new RegExp(ONE_TIME)).closest('.invisible')).toBeNull()

    for (const plan of ['raten', 'mieten'] as const) {
      cleanup()
      draw([FOUND, TRUST], { plan })

      const note = screen.getByText(new RegExp(ONE_TIME))

      // Out of sight and out of the reading order, but still taking its room.
      expect(note.closest('.invisible'), plan).not.toBeNull()
      expect(note.getAttribute('aria-hidden'), plan).toBe('true')
    }
  })

  it('put the fee before the one-time note, so the empty space is at the very end', () => {
    draw([FOUND, TRUST], { plan: 'mieten' })

    const fee = screen.getByText('Kleine Änderungen nach dem Launch: 16 € pro Änderung')
    const note = screen.getByText(new RegExp(ONE_TIME))

    expect(fee.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('are written in English and Arabic', () => {
    draw([FOUND], { language: 'en' })
    expect(screen.getByText('Small changes after launch: €16 per change')).toBeTruthy()

    cleanup()
    draw([FOUND], { language: 'ar' })
    expect(screen.getByText('التعديلات الصغيرة بعد الإطلاق: 16 يورو للتعديل الواحد')).toBeTruthy()
  })
})

/* ============================================= packages with no plans at all */

describe('before any package has a plan', () => {
  const plain = [
    card('gefunden-werden', 'Gefunden werden', fixed(99_900)),
    card('vertrauen-gewinnen', 'Vertrauen gewinnen', fixed(149_900)),
  ]

  it('draws no tabs and no teaser — the page visitors already know', () => {
    draw(plain)

    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tabpanel')).toBeNull()
    expect(screen.queryByRole('button', { name: /Kein Budget/ })).toBeNull()
  })

  it('shows Buy even if the address asks for another tab', () => {
    draw(plain, { plan: 'mieten' })

    const shown = lines(screen.getByRole('heading', { name: 'Gefunden werden' }).closest('article')!)

    expect(shown).toEqual(expect.arrayContaining([`999${NBSP}€`, 'einmalig']))
    expect(shown).not.toContain('Auf Anfrage')
  })

  it('still passes the package, but no plan, to the contact page', () => {
    draw(plain)

    expect(
      within(screen.getByRole('heading', { name: 'Gefunden werden' }).closest('article')!)
        .getByRole('link', { name: /Paket anfragen/ })
        .getAttribute('href'),
    ).toBe('/de/contact?package=gefunden-werden')
  })
})

describe('services that are not packages', () => {
  it('keep their own line and take no part in the tabs', () => {
    const shop = card('shopify', 'Online-Shops', {
      mode: 'from',
      currency: 'EUR',
      amountCents: 249_000,
      period: 'one_time',
      promotion: null,
    })
    const software = card('software', 'Software', { mode: 'quote' })

    draw([FOUND, shop, software], { plan: 'mieten' })

    const others = screen.getByRole('heading', { name: 'Online-Shops' }).closest('article')!

    expect(others.textContent).toContain(`ab 2.490${NBSP}€`)
    expect(screen.getByRole('heading', { name: 'Software' }).closest('article')!.textContent).toContain('Preis auf Anfrage')
    // Only the one package is inside the tab panel.
    expect(within(screen.getByRole('tabpanel')).getAllByRole('article')).toHaveLength(1)
  })
})
