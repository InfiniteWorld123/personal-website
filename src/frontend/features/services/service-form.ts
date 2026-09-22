import {
  LANGUAGES,
  type Language,
  type OwnerService,
  type PriceMode,
  type PricePeriod,
  SERVICE_LIMITS,
  type ServiceDraftInput,
  type ServicePrice,
  type ServiceTexts,
  isValidServiceSlug,
  normalizeServiceDraft,
} from '#/backend2/contracts/service.contract'

/**
 * The editor's values, and the way back to a draft.
 *
 * Prices are held as the text the owner typed ("990", "49,90") rather than as
 * cents, so a half-typed number is never silently rounded or dropped; they
 * become cents only on the way to the server. Everything else is the draft's
 * own shape.
 */
export type ServiceFormValues = {
  slug: string
  featured: boolean
  mode: PriceMode | ''
  amount: string
  period: PricePeriod | ''
  promoOn: boolean
  promo: string
  texts: Record<Language, ServiceTexts>
}

export const centsToText = (cents: number | null): string => {
  if (cents === null) return ''

  const rest = cents % 100

  return rest ? `${Math.floor(cents / 100)},${String(rest).padStart(2, '0')}` : String(cents / 100)
}

/** "990", "49,90" or "49.9" into cents; anything else is a sentence to show. */
export const parseAmount = (text: string): { cents: number | null; error?: string } => {
  const value = text.replace(/[\s€]/g, '')

  if (value === '') return { cents: null }

  const match = value.match(/^(\d{1,9})(?:[.,](\d{1,2}))?$/)

  if (!match) return { cents: null, error: 'Write the price like 990 or 49,90' }

  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))

  if (cents < SERVICE_LIMITS.amountCents.min) return { cents: null, error: 'A price must be more than 0 €' }
  if (cents > SERVICE_LIMITS.amountCents.max) return { cents: null, error: 'That price is too high' }

  return { cents }
}

const copyTexts = (texts: ServiceTexts): ServiceTexts => ({ ...texts, included: [...texts.included] })

export const toFormValues = (draft: ServiceDraftInput): ServiceFormValues => ({
  slug: draft.slug,
  featured: draft.featured,
  mode: draft.price.mode ?? '',
  amount: centsToText(draft.price.amountCents),
  period: draft.price.period ?? '',
  promoOn: draft.price.promotion.active,
  promo: centsToText(draft.price.promotion.amountCents),
  texts: { de: copyTexts(draft.texts.de), en: copyTexts(draft.texts.en), ar: copyTexts(draft.texts.ar) },
})

export const emptyFormValues = (): ServiceFormValues => {
  const blank = (): ServiceTexts => ({
    name: '',
    summary: '',
    included: [],
    body: '',
    promotionLabel: '',
    seoTitle: '',
    seoDescription: '',
  })

  return { slug: '', featured: false, mode: '', amount: '', period: '', promoOn: false, promo: '', texts: { de: blank(), en: blank(), ar: blank() } }
}

/** The values as the draft the server will store — trimmed and normalised the same way. */
export const toDraft = (values: ServiceFormValues): ServiceDraftInput => {
  const texts = {} as Record<Language, ServiceTexts>

  for (const language of LANGUAGES) {
    const t = values.texts[language]

    texts[language] = {
      name: t.name.trim(),
      summary: t.summary.trim(),
      included: t.included.map((item) => item.trim()).filter((item) => item !== ''),
      body: t.body.replace(/\r\n?/g, '\n').trim(),
      promotionLabel: t.promotionLabel.trim(),
      seoTitle: t.seoTitle.trim(),
      seoDescription: t.seoDescription.trim(),
    }
  }

  const price: ServicePrice = {
    mode: values.mode === '' ? null : values.mode,
    amountCents: parseAmount(values.amount).cents,
    period: values.period === '' ? null : values.period,
    promotion: { active: values.promoOn, amountCents: parseAmount(values.promo).cents },
  }

  return normalizeServiceDraft({ slug: values.slug.trim(), featured: values.featured, price, texts })
}

/**
 * Shape and limits, keyed by the form's own field paths. Completeness is the
 * checklist's job (`publishBlockers`), so an unfinished draft still saves.
 */
export const fieldErrors = (values: ServiceFormValues): Record<string, string> => {
  const errors: Record<string, string> = {}
  const slug = values.slug.trim()

  if (slug !== '' && !isValidServiceSlug(slug)) {
    errors.slug = 'Use lowercase letters, numbers and single hyphens only'
  }

  if (values.mode === 'fixed' || values.mode === 'from') {
    const amount = parseAmount(values.amount)

    if (amount.error) errors.amount = amount.error

    if (values.promoOn) {
      const promo = parseAmount(values.promo)

      if (promo.error) errors.promo = promo.error
    }
  }

  for (const language of LANGUAGES) {
    const t = values.texts[language]

    if (t.name.length > SERVICE_LIMITS.name) errors[`texts.${language}.name`] = 'The name is too long'
    if (t.summary.length > SERVICE_LIMITS.summary) {
      errors[`texts.${language}.summary`] = 'The short description is too long'
    }
    t.included.forEach((item, index) => {
      if (item.length > SERVICE_LIMITS.includedItem) {
        errors[`texts.${language}.included[${index}]`] = 'This line is too long'
      }
    })
  }

  return errors
}

/** The owner's one-line reading of a price, in the Dashboard's English. */
export const priceSummary = (price: ServicePrice): string => {
  if (!price.mode) return 'Price not set'
  if (price.mode === 'quote') return 'On request'

  const euros = (cents: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: cents % 100 ? 2 : 0,
      maximumFractionDigits: cents % 100 ? 2 : 0,
    }).format(cents / 100)

  const period = { one_time: 'one-time', monthly: 'per month', yearly: 'per year' }
  let text = `${price.mode === 'from' ? 'From ' : ''}${price.amountCents === null ? '€ —' : euros(price.amountCents)} · ${
    price.period ? period[price.period] : 'period not set'
  }`

  if (price.promotion.active) {
    text += ` · offer ${price.promotion.amountCents === null ? 'not set' : euros(price.promotion.amountCents)}`
  }

  return text
}

/**
 * Which field a checklist sentence is about, so clicking it goes there. The
 * sentences are the contract's; a new one without a target is simply not a
 * link.
 */
export const blockerTarget = (sentence: string): { id: string; language?: Language } | null => {
  if (sentence.startsWith('The web address')) return { id: 'service-slug' }
  if (sentence === 'Choose how the price is shown') return { id: 'service-mode-fixed' }
  if (sentence === 'The price is missing') return { id: 'service-amount' }
  if (sentence.startsWith('Choose whether')) return { id: 'service-period' }
  if (sentence.startsWith('The promotional price') || sentence.startsWith('A price on request')) {
    return { id: 'service-promo' }
  }

  const match = sentence.match(/^(DE|EN|AR): (the name|the short description|nothing is listed|the promotion label)/)

  if (!match) return null

  const language = match[1]!.toLowerCase() as Language

  if (match[2] === 'the promotion label') return { id: `service-label-${language}` }

  const field = { 'the name': 'name', 'the short description': 'summary', 'nothing is listed': 'included-0' }[match[2]!]

  return { id: `service-${language}-${field}`, language }
}

/** The name typed back to confirm a permanent delete (approved choice 6A). */
export const deleteConfirmation = (service: OwnerService): string => {
  for (const language of ['en', 'de', 'ar'] as const) {
    const name = service.draft.texts[language].name.trim()

    if (name) return name
  }

  return 'delete'
}
