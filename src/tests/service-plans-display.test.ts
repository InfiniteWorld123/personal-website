import { describe, expect, it } from 'vitest'
import {
  type PublicServiceCard,
  type ServicePrice,
  emptyServicePrice,
  instalmentTotalCents,
  publicPriceOf,
} from '#/backend2/contracts/service.contract'
import { buildStructuredData, structuredPackagesOf } from '#/frontend/lib/structured-data'
import {
  PLAN_KEYS,
  PLAN_WORDS,
  cheapestRentCents,
  formatCents,
  planView,
} from '#/frontend/features/services/service-display'
import {
  emptyFormValues,
  fieldErrors,
  parseMonths,
  priceSummary,
  toDraft,
  toFormValues,
} from '#/frontend/features/services/service-form'
import { PLAN_VALUES, parsePlan } from '#/frontend/features/services-public/service-page'

/**
 * The payment models of a package, as pure rules: how a price is written in
 * each language, how the instalments add up, what each tab says, and what the
 * owner's typing becomes. The page that draws them is in
 * `public-services-plans-ui.test.tsx`.
 */

const NBSP = ' '

const price = (over: Partial<ServicePrice> = {}) =>
  publicPriceOf(
    {
      ...emptyServicePrice(),
      mode: 'fixed',
      amountCents: 99_900,
      period: 'one_time',
      instalment: { monthlyCents: 9_900, months: 12 },
      rent: { monthlyCents: 3_499, minTermMonths: 12 },
      ...over,
    },
    'Startangebot',
  )!

const NOTES = { rentIncludes: 'Hosting und Wartung inklusive' }

/* ============================================================ the number */

describe('euros in each language', () => {
  it('writes German with a decimal comma, a dot between thousands and the sign after', () => {
    expect(formatCents(3_499, 'de')).toBe(`34,99${NBSP}€`)
    expect(formatCents(149_900, 'de')).toBe(`1.499${NBSP}€`)
    expect(formatCents(118_800, 'de')).toBe(`1.188${NBSP}€`)
    expect(formatCents(99_900, 'de')).toBe(`999${NBSP}€`)
    expect(formatCents(9_900, 'de')).toBe(`99${NBSP}€`)
  })

  it('writes English with the sign first, a decimal point and a comma between thousands', () => {
    expect(formatCents(3_499, 'en')).toBe('€34.99')
    expect(formatCents(149_900, 'en')).toBe('€1,499')
    expect(formatCents(118_800, 'en')).toBe('€1,188')
    expect(formatCents(99_900, 'en')).toBe('€999')
  })

  it('writes Arabic with the German number and the word "euro" after it', () => {
    expect(formatCents(3_499, 'ar')).toBe(`34,99${NBSP}يورو`)
    expect(formatCents(149_900, 'ar')).toBe(`1.499${NBSP}يورو`)
    expect(formatCents(99_900, 'ar')).toBe(`999${NBSP}يورو`)
  })

  it('shows cents only when there are some', () => {
    expect(formatCents(100_000, 'de')).toBe(`1.000${NBSP}€`)
    expect(formatCents(100_001, 'de')).toBe(`1.000,01${NBSP}€`)
    expect(formatCents(1_000, 'en')).toBe('€10')
    expect(formatCents(1_005, 'en')).toBe('€10.05')
  })
})

/* ================================================== the instalment total */

describe('the instalment total', () => {
  it('is the monthly payment times the number of payments', () => {
    expect(instalmentTotalCents(9_900, 12)).toBe(118_800)
    expect(instalmentTotalCents(14_900, 12)).toBe(178_800)
    expect(instalmentTotalCents(3_333, 3)).toBe(9_999)
    expect(instalmentTotalCents(1, 60)).toBe(60)
  })

  it('is exact in cents, however the monthly price is written', () => {
    // 34,99 € x 7 = 244,93 € — a float would say 244.92999999999998.
    expect(instalmentTotalCents(3_499, 7)).toBe(24_493)
    expect(formatCents(instalmentTotalCents(3_499, 7), 'de')).toBe(`244,93${NBSP}€`)
  })

  it('reaches the visitor already added up, so no page adds it again', () => {
    const plans = (price() as { plans: { instalment: { totalCents: number } } }).plans

    expect(plans.instalment.totalCents).toBe(118_800)
  })
})

/* ============================================================ the tabs */

describe('what each tab says', () => {
  it('German: buy, instalments, rent', () => {
    const buy = planView(price(), 'kaufen', 'de', NOTES)
    const instalments = planView(price(), 'raten', 'de', NOTES)
    const rent = planView(price(), 'mieten', 'de', NOTES)

    expect(buy).toEqual({ kind: 'priced', label: null, regular: null, amount: `999${NBSP}€`, period: null, lines: ['einmalig'] })
    expect(instalments).toEqual({
      kind: 'priced',
      label: null,
      regular: null,
      amount: `99${NBSP}€`,
      period: '/ Monat',
      lines: [`12 Raten · insgesamt 1.188${NBSP}€`, 'Danach gehört die Website dir'],
    })
    expect(rent).toEqual({
      kind: 'priced',
      label: null,
      regular: null,
      amount: `34,99${NBSP}€`,
      period: '/ Monat',
      lines: [
        'Mindestlaufzeit 12 Monate, danach monatlich kündbar · Hosting und Wartung inklusive',
        'Die Website bleibt Eigentum von Yaman Warda',
      ],
    })
  })

  it('English: the same, with the sign first', () => {
    const instalments = planView(price(), 'raten', 'en', NOTES)
    const rent = planView(price(), 'mieten', 'en', { rentIncludes: 'Hosting and maintenance included' })

    expect(instalments).toMatchObject({
      amount: '€99',
      period: '/ month',
      lines: ['12 instalments · €1,188 in total', 'After that, the website is yours'],
    })
    expect(rent).toMatchObject({
      amount: '€34.99',
      period: '/ month',
      lines: [
        'Minimum term 12 months, then cancel monthly · Hosting and maintenance included',
        'The website remains the property of Yaman Warda',
      ],
    })
  })

  it('Arabic: the words in the right grammar and the German number', () => {
    const instalments = planView(price(), 'raten', 'ar', NOTES)
    const rent = planView(price(), 'mieten', 'ar', { rentIncludes: 'الاستضافة والصيانة مشمولتان' })

    expect(instalments).toMatchObject({
      amount: `99${NBSP}يورو`,
      period: 'شهرياً',
      lines: [`12 قسطاً · المجموع 1.188${NBSP}يورو`, 'وبعدها يصبح الموقع ملكك'],
    })
    expect(rent).toMatchObject({
      amount: `34,99${NBSP}يورو`,
      lines: [
        'الحد الأدنى للمدة 12 شهراً، وبعدها يمكن الإلغاء شهرياً · الاستضافة والصيانة مشمولتان',
        'يبقى الموقع ملكاً لـ Yaman Warda',
      ],
    })
  })

  it('counts in Arabic grammar: two, three to ten, eleven or more', () => {
    const lines = (months: number) =>
      planView(price({ instalment: { monthlyCents: 9_900, months } }), 'raten', 'ar', NOTES)

    expect((lines(2) as { lines: string[] }).lines[0]).toContain('قسطان')
    expect((lines(6) as { lines: string[] }).lines[0]).toContain('6 أقساط')
    expect((lines(12) as { lines: string[] }).lines[0]).toContain('12 قسطاً')
  })

  it('says "cancel monthly" alone when the minimum term is one month', () => {
    const rent = (language: 'de' | 'en' | 'ar') =>
      (planView(price({ rent: { monthlyCents: 3_499, minTermMonths: 1 } }), 'mieten', language, { rentIncludes: '' }) as {
        lines: string[]
      }).lines[0]

    expect(rent('de')).toBe('Monatlich kündbar')
    expect(rent('en')).toBe('Cancel monthly')
    expect(rent('ar')).toBe('يمكن الإلغاء شهرياً')
  })

  it('leaves out "included" when the owner has emptied that note', () => {
    const rent = planView(price(), 'mieten', 'de', { rentIncludes: '   ' }) as { lines: string[] }

    expect(rent.lines[0]).toBe('Mindestlaufzeit 12 Monate, danach monatlich kündbar')
  })

  it('shows the owner\'s own numbers when they change, not a fixed 12', () => {
    const view = planView(
      price({ instalment: { monthlyCents: 5_000, months: 24 }, rent: { monthlyCents: 2_000, minTermMonths: 6 } }),
      'raten',
      'de',
      NOTES,
    ) as { lines: string[] }

    expect(view.lines[0]).toBe(`24 Raten · insgesamt 1.200${NBSP}€`)
    expect((planView(price({ rent: { monthlyCents: 2_000, minTermMonths: 6 } }), 'mieten', 'de', NOTES) as { lines: string[] }).lines[0]).toContain(
      'Mindestlaufzeit 6 Monate',
    )
  })

  it('keeps an offer on the Buy tab only', () => {
    const offer = price({ promotion: { active: true, amountCents: 79_900 } })

    expect(planView(offer, 'kaufen', 'de', NOTES)).toMatchObject({
      label: 'Startangebot',
      regular: `999${NBSP}€`,
      amount: `799${NBSP}€`,
    })
    expect(planView(offer, 'raten', 'de', NOTES)).toMatchObject({ label: null, regular: null })
    expect(planView(offer, 'mieten', 'de', NOTES)).toMatchObject({ label: null, regular: null })
  })

  it('says "Auf Anfrage" for a model the package does not offer', () => {
    const onlyRent = price({ instalment: { monthlyCents: null, months: 12 } })
    const onlyInstalments = price({ rent: { monthlyCents: null, minTermMonths: 12 } })
    const neither = price({ instalment: { monthlyCents: null, months: 12 }, rent: { monthlyCents: null, minTermMonths: 12 } })

    expect(planView(onlyRent, 'raten', 'de', NOTES)).toEqual({ kind: 'request', amount: 'Auf Anfrage' })
    expect(planView(onlyRent, 'raten', 'en', NOTES)).toEqual({ kind: 'request', amount: 'On request' })
    expect(planView(onlyRent, 'raten', 'ar', NOTES)).toEqual({ kind: 'request', amount: 'عند الطلب' })
    expect(planView(onlyInstalments, 'mieten', 'de', NOTES).kind).toBe('request')
    expect(planView(neither, 'raten', 'de', NOTES).kind).toBe('request')
    expect(planView(neither, 'mieten', 'de', NOTES).kind).toBe('request')
    // Buying is always there.
    expect(planView(neither, 'kaufen', 'de', NOTES).kind).toBe('priced')
  })

  it('says "Auf Anfrage" for a price that is itself on request', () => {
    expect(planView({ mode: 'quote' }, 'mieten', 'de', NOTES)).toEqual({ kind: 'request', amount: 'Auf Anfrage' })
  })

  it('names the three tabs the way the owner asked, in each language', () => {
    expect(PLAN_WORDS.de.tabs).toEqual({ kaufen: 'Kaufen', raten: 'In Raten', mieten: 'Mieten' })
    expect(PLAN_WORDS.en.tabs).toEqual({ kaufen: 'Buy', raten: 'Instalments', mieten: 'Rent' })
    expect(PLAN_WORDS.ar.tabs).toEqual({ kaufen: 'شراء', raten: 'تقسيط', mieten: 'إيجار' })
  })
})

/* ================================================= the cheapest rent */

describe('the cheapest rent', () => {
  const card = (slug: string, rent: number | null, over: Partial<PublicServiceCard> = {}): PublicServiceCard => ({
    slug,
    name: slug,
    summary: '',
    included: [],
    price: price({ rent: { monthlyCents: rent, minTermMonths: 12 } }),
    publishedAt: null,
    ...over,
  })

  it('is the lowest monthly rent among the packages, computed from the data', () => {
    expect(cheapestRentCents([card('a', 3_499), card('b', 4_999)])).toBe(3_499)
    expect(cheapestRentCents([card('a', 4_999), card('b', 3_499)])).toBe(3_499)
    expect(cheapestRentCents([card('a', 2_500), card('b', 3_499)])).toBe(2_500)
  })

  it('skips packages that cannot be rented', () => {
    expect(cheapestRentCents([card('a', null), card('b', 4_999)])).toBe(4_999)
  })

  it('is nothing when nothing can be rented', () => {
    expect(cheapestRentCents([card('a', null)])).toBeNull()
    expect(cheapestRentCents([])).toBeNull()
    expect(cheapestRentCents([card('q', null, { price: { mode: 'quote' } }), card('n', null, { price: null })])).toBeNull()
  })

  it('goes into the teaser in each language, formatted like every other price', () => {
    const cheapest = 3_499

    expect(PLAN_WORDS.de.teaser(formatCents(cheapest, 'de'))).toBe(
      `Kein Budget für alles auf einmal? Schon ab 34,99${NBSP}€/Monat mieten`,
    )
    expect(PLAN_WORDS.en.teaser(formatCents(cheapest, 'en'))).toBe('No budget for everything at once? Rent from €34.99/month')
    expect(PLAN_WORDS.ar.teaser(formatCents(cheapest, 'ar'))).toContain(`34,99${NBSP}يورو`)
  })
})

/* ========================================================== the address */

describe('the plan in the address', () => {
  it('knows the three words, the same in every language', () => {
    expect(parsePlan('kaufen')).toBe('kaufen')
    expect(parsePlan('raten')).toBe('raten')
    expect(parsePlan('mieten')).toBe('mieten')
  })

  it('falls back to Buy for anything else', () => {
    for (const value of [undefined, null, '', 'rent', 'MIETEN', 'mieten ', 3, ['mieten'], {}]) {
      expect(parsePlan(value), String(value)).toBe('kaufen')
    }
  })

  it('keeps the route\'s list of words equal to the display\'s', () => {
    expect([...PLAN_VALUES]).toEqual([...PLAN_KEYS])
  })
})

/* ====================================================== the owner's typing */

describe('the plans in the editor', () => {
  it('reads months as whole numbers only', () => {
    expect(parseMonths('12')).toBe(12)
    expect(parseMonths(' 6 ')).toBe(6)
    expect(parseMonths('')).toBeNull()
    expect(parseMonths('1,5')).toBeNull()
    expect(parseMonths('abc')).toBeNull()
    expect(parseMonths('1000')).toBeNull()
  })

  it('turns "34,99" into 3499 cents and keeps the term', () => {
    const values = emptyFormValues()

    values.mode = 'fixed'
    values.amount = '999'
    values.period = 'one_time'
    values.instalmentMonthly = '99'
    values.rentMonthly = '34,99'

    const draft = toDraft(values)

    expect(draft.price.instalment).toEqual({ monthlyCents: 9_900, months: 12 })
    expect(draft.price.rent).toEqual({ monthlyCents: 3_499, minTermMonths: 12 })
  })

  it('goes there and back without losing the plans', () => {
    const values = emptyFormValues()

    values.mode = 'fixed'
    values.amount = '1499'
    values.period = 'one_time'
    values.instalmentMonthly = '149'
    values.instalmentMonths = '24'
    values.rentMonthly = '49,99'
    values.rentMinTermMonths = '6'

    const draft = toDraft(values)

    expect(toFormValues(draft)).toMatchObject({
      instalmentMonthly: '149',
      instalmentMonths: '24',
      rentMonthly: '49,99',
      rentMinTermMonths: '6',
    })
    expect(toDraft(toFormValues(draft))).toEqual(draft)
  })

  it('treats an empty monthly price as "not offered"', () => {
    const values = emptyFormValues()

    values.mode = 'fixed'

    const draft = toDraft(values)

    expect(draft.price.instalment.monthlyCents).toBeNull()
    expect(draft.price.rent.monthlyCents).toBeNull()
  })

  it('flags a monthly price it cannot read, next to its field', () => {
    const values = emptyFormValues()

    values.mode = 'fixed'
    values.instalmentMonthly = '99,999'
    values.rentMonthly = '0'

    expect(Object.keys(fieldErrors(values))).toEqual(['instalmentMonthly', 'rentMonthly'])
  })

  it('flags a term out of range only once there is a price beside it', () => {
    const values = emptyFormValues()

    values.mode = 'fixed'
    values.instalmentMonths = '1'
    values.rentMinTermMonths = '99'

    // No monthly prices yet: the terms are not in play.
    expect(fieldErrors(values)).toEqual({})

    values.instalmentMonthly = '99'
    values.rentMonthly = '34,99'

    expect(Object.keys(fieldErrors(values))).toEqual(['instalmentMonths', 'rentMinTermMonths'])

    values.instalmentMonths = '12'
    values.rentMinTermMonths = '12'

    expect(fieldErrors(values)).toEqual({})
  })

  it('falls back to twelve months rather than saving a nonsense term', () => {
    const values = emptyFormValues()

    values.mode = 'fixed'
    values.instalmentMonthly = '99'
    values.instalmentMonths = 'abc'
    values.rentMonthly = '34,99'
    values.rentMinTermMonths = '500'

    const draft = toDraft(values)

    expect(draft.price.instalment.months).toBe(12)
    expect(draft.price.rent.minTermMonths).toBe(12)
  })

  it('ignores the plan fields on a price that is not fixed', () => {
    const values = emptyFormValues()

    values.mode = 'from'
    values.instalmentMonthly = 'not a price'

    expect(fieldErrors(values)).toEqual({})
  })

  it('summarises the plans for the owner, beside the price', () => {
    const base = { ...emptyServicePrice(), mode: 'fixed' as const, amountCents: 99_900, period: 'one_time' as const }

    expect(
      priceSummary({
        ...base,
        instalment: { monthlyCents: 9_900, months: 12 },
        rent: { monthlyCents: 3_499, minTermMonths: 12 },
      }),
    ).toBe('€999 · one-time · 12 × €99 · rent €34.99/month')
    expect(priceSummary(base)).toBe('€999 · one-time')
    // Stored but not offered, so not announced.
    expect(
      priceSummary({ ...base, period: 'monthly', instalment: { monthlyCents: 9_900, months: 12 } }),
    ).toBe('€999 · per month')
  })
})

/* ====================================================== the structured data */

describe('the structured data for the packages', () => {
  const cards: PublicServiceCard[] = [
    {
      slug: 'gefunden-werden',
      name: 'Gefunden werden',
      summary: 'Für Betriebe',
      included: ['Website'],
      price: price(),
      publishedAt: null,
    },
    {
      slug: 'vertrauen-gewinnen',
      name: 'Vertrauen gewinnen',
      summary: 'Mehr Vertrauen',
      included: ['Website'],
      price: price({ amountCents: 149_900, rent: { monthlyCents: null, minTermMonths: 12 } }),
      publishedAt: null,
    },
    { slug: 'shop', name: 'Shop', summary: '', included: [], price: price({ mode: 'from' }), publishedAt: null },
    { slug: 'software', name: 'Software', summary: '', included: [], price: { mode: 'quote' }, publishedAt: null },
  ]

  it('takes only the fixed one-time packages', () => {
    expect(structuredPackagesOf(cards).map((entry) => entry.slug)).toEqual(['gefunden-werden', 'vertrauen-gewinnen'])
  })

  it('uses the offer price while an offer is on', () => {
    const offer = { ...cards[0]!, price: price({ promotion: { active: true, amountCents: 79_900 } }) }

    expect(structuredPackagesOf([offer])[0]!.buyCents).toBe(79_900)
  })

  const graph = (items: PublicServiceCard[]) =>
    buildStructuredData({
      language: 'de',
      path: '/services',
      title: 'Leistungen',
      description: 'Beschreibung',
      canonical: 'https://yamanwarda.de/de/services',
      image: 'https://yamanwarda.de/card.jpg',
      packages: structuredPackagesOf(items),
    })['@graph'] as Array<Record<string, any>>

  const offersOf = (items: PublicServiceCard[]) =>
    graph(items).find((node) => node['@type'] === 'ProfessionalService')!.makesOffer as Array<Record<string, any>>

  it('keeps the buy price as the main Offer and adds the rent as a monthly price specification', () => {
    const offers = offersOf(cards)
    const buy = offers.find((offer) => offer.name === 'Gefunden werden')!
    const rent = offers.find((offer) => offer.name === 'Gefunden werden (Mieten)')!

    expect(buy).toMatchObject({ '@type': 'Offer', priceCurrency: 'EUR', price: 999 })
    expect(buy).not.toHaveProperty('priceSpecification')
    expect(rent).toMatchObject({
      '@type': 'Offer',
      priceSpecification: { '@type': 'UnitPriceSpecification', price: 34.99, priceCurrency: 'EUR', unitCode: 'MON' },
    })
  })

  it('adds no rent Offer to a package that cannot be rented', () => {
    const names = offersOf(cards).map((offer) => offer.name)

    expect(names).toContain('Vertrauen gewinnen')
    expect(names).not.toContain('Vertrauen gewinnen (Mieten)')
  })

  it('points every offer at the one /services address — a payment model is not a page', () => {
    for (const offer of offersOf(cards).filter((entry) => String(entry.name).includes('Gefunden'))) {
      expect(offer.url).toBe('https://yamanwarda.de/de/services#gefunden-werden')
    }
  })

  it('keeps the existing offers and adds none when there are no packages', () => {
    const before = offersOf([])
    const after = offersOf(cards)

    expect(before.length).toBeGreaterThan(0)
    expect(after.slice(0, before.length)).toEqual(before)
    expect(after.length).toBe(before.length + 3)
  })
})
