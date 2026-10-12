import type { Language, PublicServiceCard, PublicServicePrice } from '#/backend2/contracts/service.contract'
import { site } from '#/frontend/content/site'

/**
 * How a service's price and longer text read to a visitor.
 *
 * Shared by the Dashboard preview now and by the public pages when they are
 * connected, so the two cannot describe one price differently
 * (`docs/v2/services.md`: "The public page and Dashboard preview must display
 * the same approved price terms in each language").
 *
 * The words were approved with the Design Lab on 22 Sep 2026. "ab", "from"
 * and "من" are the site's existing words; the rest are new.
 */
export const PRICE_WORDS: Record<
  Language,
  {
    from: string
    oneTime: string
    perMonth: string
    perYear: string
    quote: string
    price: string
    regular: string
    offer: string
    includes: string
    /** A fixed-price package lists what it contains, not what it may contain. */
    included: string
    cta: string
  }
> = {
  de: {
    from: 'ab',
    oneTime: 'einmalig',
    perMonth: '/ Monat',
    perYear: '/ Jahr',
    quote: 'Preis auf Anfrage',
    price: 'Preis',
    regular: 'Normalpreis',
    offer: 'Angebotspreis',
    includes: 'Das kann dazugehören',
    included: 'Enthalten',
    cta: 'Gespräch anfragen',
  },
  en: {
    from: 'from',
    oneTime: 'one-time',
    perMonth: '/ month',
    perYear: '/ year',
    quote: 'Price on request',
    price: 'Price',
    regular: 'Regular price',
    offer: 'Offer price',
    includes: 'This can include',
    included: 'Included',
    cta: 'Request a call',
  },
  ar: {
    from: 'من',
    oneTime: 'دفعة واحدة',
    perMonth: 'شهرياً',
    perYear: 'سنوياً',
    quote: 'السعر عند الطلب',
    price: 'السعر',
    regular: 'السعر العادي',
    offer: 'سعر العرض',
    includes: 'يمكن أن يشمل',
    included: 'يشمل',
    cta: 'اطلب مكالمة',
  },
}

/** Non-breaking, so a number never ends a line while its "€" or "يورو" starts the next. */
const NBSP = '\u00a0'

/**
 * Euros as the site writes them, with cents only when there are some and
 * Western digits throughout:
 *
 * - German: `34,99 €`, `1.499 €`
 * - English: `€34.99`, `€1,499`
 * - Arabic: `34,99 يورو`, `1.499 يورو` — the German number, the word "euro"
 *   after it (owner's request, 12 Oct 2026; before it the sign was "€").
 */
export const formatCents = (cents: number, language: Language): string => {
  const hasCents = cents % 100 !== 0
  const digits = { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: hasCents ? 2 : 0 }

  if (language === 'ar') {
    return `${new Intl.NumberFormat('de-DE', digits).format(cents / 100)}${NBSP}يورو`
  }

  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE', {
    style: 'currency',
    currency: 'EUR',
    ...digits,
  }).format(cents / 100)
}

export type PriceParts = {
  lead: string | null
  /** The struck-through normal price, while an offer is on. */
  regular: string | null
  amount: string
  period: string | null
  /** Shown under the price on the service page only (approved choice 4A). */
  caption: string | null
  label: string | null
}

/** The pieces of one price, in one language, ready to lay out. */
export const priceParts = (price: PublicServicePrice, language: Language): PriceParts => {
  const words = PRICE_WORDS[language]

  if (price.mode === 'quote') {
    return { lead: null, regular: null, amount: words.quote, period: null, caption: null, label: null }
  }

  return {
    lead: price.mode === 'from' ? words.from : null,
    regular: price.promotion ? formatCents(price.amountCents, language) : null,
    amount: formatCents(price.promotion ? price.promotion.amountCents : price.amountCents, language),
    period: price.period === 'monthly' ? words.perMonth : price.period === 'yearly' ? words.perYear : null,
    caption: price.period === 'one_time' ? words.oneTime : null,
    label: price.promotion?.label.trim() ? price.promotion.label : null,
  }
}

export type BodyBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'ul'; items: string[] }

/**
 * The longer description, from plain text: an empty line starts a paragraph,
 * a line starting with "- " is a list line, and a short line ending in ":" at
 * the start of a block is a small heading. The owner chose this over separate
 * "who it's for" and "price note" fields (answer 1a, 22 Sep 2026).
 */
export const parseServiceBody = (text: string): BodyBlock[] => {
  const blocks: BodyBlock[] = []
  let paragraph: string[] = []
  let list: string[] | null = null
  let fresh = true

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') })
    paragraph = []
  }
  const flushList = () => {
    if (list) blocks.push({ type: 'ul', items: list })
    list = null
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()

    if (line === '') {
      flushParagraph()
      flushList()
      fresh = true
      continue
    }

    if (/^[-•*]\s+/.test(line)) {
      flushParagraph()
      list = list ?? []
      list.push(line.replace(/^[-•*]\s+/, ''))
      fresh = false
      continue
    }

    flushList()

    if (fresh && /[:：]$/.test(line) && line.length <= 60) {
      blocks.push({ type: 'h', text: line.replace(/[:：]$/, '') })
      continue
    }

    paragraph.push(line)
    fresh = false
  }

  flushParagraph()
  flushList()

  return blocks
}

/* ------------------------------------------------------- the payment models */

/**
 * The three ways a fixed-price package can be paid, and the words in the
 * address (`/services?plan=mieten`) that name them. The same words in every
 * language, so a link to the rent tab is the same link in German, English and
 * Arabic. Spelled out in `service-page.ts` for the route, which parses the
 * address without the copy below.
 */
export const PLAN_KEYS = ['kaufen', 'raten', 'mieten'] as const
export type PlanKey = (typeof PLAN_KEYS)[number]

/**
 * How many things, in the language's own grammar. Arabic counts two as a dual
 * ("قسطان"), three to ten as a plural ("أقساط") and eleven or more as a
 * singular ("قسطاً"); German and English only tell one from many.
 */
type Count = (n: number) => string

const arabicCount =
  (words: { two: string; few: string; many: string }): Count =>
  (n) =>
    n === 2 ? words.two : n >= 3 && n <= 10 ? `${n} ${words.few}` : `${n} ${words.many}`

export const PLAN_WORDS: Record<
  Language,
  {
    /** The accessible name of the tab list. */
    tabsLabel: string
    tabs: Record<PlanKey, string>
    /** A package with no price in the chosen model. */
    onRequest: string
    instalments: Count
    instalmentTotal: (total: string) => string
    instalmentOwnership: string
    rentTerm: (months: number) => string
    rentOwnership: (owner: string) => string
    /** The line under the tabs on "Buy": `price` is the cheapest rent, "34,99 €". */
    teaser: (price: string) => string
  }
> = {
  de: {
    tabsLabel: 'Zahlungsmodell',
    tabs: { kaufen: 'Kaufen', raten: 'In Raten', mieten: 'Mieten' },
    onRequest: 'Auf Anfrage',
    instalments: (n) => `${n} Raten`,
    instalmentTotal: (total) => `insgesamt ${total}`,
    instalmentOwnership: 'Danach gehört die Website dir',
    rentTerm: (n) => (n === 1 ? 'Monatlich kündbar' : `Mindestlaufzeit ${n} Monate, danach monatlich kündbar`),
    rentOwnership: (owner) => `Die Website bleibt Eigentum von ${owner}`,
    teaser: (price) => `Kein Budget für alles auf einmal? Schon ab ${price}/Monat mieten`,
  },
  en: {
    tabsLabel: 'Payment model',
    tabs: { kaufen: 'Buy', raten: 'Instalments', mieten: 'Rent' },
    onRequest: 'On request',
    instalments: (n) => `${n} instalments`,
    instalmentTotal: (total) => `${total} in total`,
    instalmentOwnership: 'After that, the website is yours',
    rentTerm: (n) => (n === 1 ? 'Cancel monthly' : `Minimum term ${n} months, then cancel monthly`),
    rentOwnership: (owner) => `The website remains the property of ${owner}`,
    teaser: (price) => `No budget for everything at once? Rent from ${price}/month`,
  },
  ar: {
    tabsLabel: 'طريقة الدفع',
    tabs: { kaufen: 'شراء', raten: 'تقسيط', mieten: 'إيجار' },
    onRequest: 'عند الطلب',
    instalments: arabicCount({ two: 'قسطان', few: 'أقساط', many: 'قسطاً' }),
    instalmentTotal: (total) => `المجموع ${total}`,
    instalmentOwnership: 'وبعدها يصبح الموقع ملكك',
    rentTerm: (n) =>
      n === 1
        ? 'يمكن الإلغاء شهرياً'
        : `الحد الأدنى للمدة ${arabicCount({ two: 'شهران', few: 'أشهر', many: 'شهراً' })(n)}، وبعدها يمكن الإلغاء شهرياً`,
    rentOwnership: (owner) => `يبقى الموقع ملكاً لـ ${owner}`,
    teaser: (price) => `لا تريد دفع كل شيء دفعة واحدة؟ استأجر الموقع من ${price} شهرياً`,
  },
}

/**
 * One package under one tab, ready to lay out.
 *
 * `request` is a package that has no price in that model ("Auf Anfrage"); the
 * page keeps the card, so the three tabs always show the same packages and a
 * visitor can still ask.
 */
export type PlanView =
  | { kind: 'request'; amount: string }
  | {
      kind: 'priced'
      /** An offer's short label, on "Buy" only. */
      label: string | null
      /** The struck-through normal price while an offer is on, on "Buy" only. */
      regular: string | null
      amount: string
      /** "/ Monat" — null for the one-time price. */
      period: string | null
      /** The small print under the price. */
      lines: string[]
    }

/**
 * What a package shows under a tab.
 *
 * `notes.rentIncludes` is the owner's editable "Hosting und Wartung
 * inklusive" (Dashboard → Content), added to the rent line when it is not
 * empty. Everything else is computed from the price, so the total of the
 * instalments can never disagree with the monthly amount beside it.
 */
export const planView = (
  price: PublicServicePrice,
  plan: PlanKey,
  language: Language,
  notes: { rentIncludes: string },
): PlanView => {
  const words = PLAN_WORDS[language]

  if (plan === 'kaufen') {
    const parts = priceParts(price, language)

    return {
      kind: 'priced',
      label: parts.label,
      regular: parts.regular,
      amount: parts.amount,
      period: parts.period,
      lines: parts.caption ? [parts.caption] : [],
    }
  }

  const plans = price.mode === 'quote' ? undefined : price.plans
  const perMonth = PRICE_WORDS[language].perMonth

  if (plan === 'raten') {
    const instalment = plans?.instalment

    if (!instalment) return { kind: 'request', amount: words.onRequest }

    return {
      kind: 'priced',
      label: null,
      regular: null,
      amount: formatCents(instalment.monthlyCents, language),
      period: perMonth,
      lines: [
        `${words.instalments(instalment.months)} · ${words.instalmentTotal(formatCents(instalment.totalCents, language))}`,
        words.instalmentOwnership,
      ],
    }
  }

  const rent = plans?.rent

  if (!rent) return { kind: 'request', amount: words.onRequest }

  const included = notes.rentIncludes.trim()

  return {
    kind: 'priced',
    label: null,
    regular: null,
    amount: formatCents(rent.monthlyCents, language),
    period: perMonth,
    lines: [
      included ? `${words.rentTerm(rent.minTermMonths)} · ${included}` : words.rentTerm(rent.minTermMonths),
      words.rentOwnership(site.name),
    ],
  }
}

/**
 * The lowest monthly rent among the packages on the page, or null when none is
 * rented. Computed from the data, never written into a sentence: the teaser
 * under the tabs follows the owner's prices.
 */
export const cheapestRentCents = (items: PublicServiceCard[]): number | null => {
  let cheapest: number | null = null

  for (const item of items) {
    const rent = item.price?.mode === 'quote' ? undefined : item.price?.plans?.rent

    if (rent && (cheapest === null || rent.monthlyCents < cheapest)) cheapest = rent.monthlyCents
  }

  return cheapest
}
