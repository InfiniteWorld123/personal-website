import type { Language, PublicServicePrice } from '#/backend2/contracts/service.contract'

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
    cta: 'اطلب مكالمة',
  },
}

/**
 * Euros as the site writes them — `990 €` in German and Arabic, `€990` in
 * English, Western digits throughout — with cents only when there are some.
 */
export const formatCents = (cents: number, language: Language): string => {
  const hasCents = cents % 100 !== 0

  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : 'de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
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
