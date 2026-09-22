import * as v from 'valibot'
import { LANGUAGES, type Language, SLUG_PATTERN, slugify } from './project.contract'

/**
 * The Services contract, shared by the server and the Dashboard editor.
 *
 * See `docs/v2/services.md`.
 *
 * Pure — valibot and plain TypeScript, nothing server-only — for the reason the
 * Projects contract is: the editor must be able to draw the publication
 * checklist before anything is sent, and the server enforces the identical
 * rules afterwards. One file, one set of rules.
 *
 * The three languages and the web-address rule come from the Projects contract
 * rather than being copied: an address means the same thing in both modules,
 * and two copies of a slug rule are two rules.
 */

export { LANGUAGES, slugify }
export type { Language }

/* ----------------------------------------------------------------- the words */

const LANGUAGE_LABEL: Record<Language, string> = { de: 'DE', en: 'EN', ar: 'AR' }

/**
 * How the price is shown. Presentation only: none of these charges anyone,
 * and "per month" describes an offer, it does not start a subscription.
 */
export const PRICE_MODES = ['fixed', 'from', 'quote'] as const
export type PriceMode = (typeof PRICE_MODES)[number]

export const PRICE_PERIODS = ['one_time', 'monthly', 'yearly'] as const
export type PricePeriod = (typeof PRICE_PERIODS)[number]

/** `docs/v2/services.md`: "Monetary prices use EUR." One currency, stated once. */
export const SERVICE_CURRENCY = 'EUR' as const

/** Derived on every read, never stored twice. There is no archive in Services. */
export const SERVICE_STATES = [
  'draft',
  'published',
  'published_with_pending_changes',
  'unpublished',
] as const
export type ServiceState = (typeof SERVICE_STATES)[number]

/** What the Dashboard list may filter by. `pending` is a short alias. */
export const SERVICE_LIST_STATES = ['all', ...SERVICE_STATES, 'pending'] as const
export type ServiceListState = (typeof SERVICE_LIST_STATES)[number]

export const SERVICE_FEATURED_FILTERS = ['all', 'featured', 'not_featured'] as const

/* ---------------------------------------------------------------- the limits */

export const SERVICE_LIMITS = {
  /** The same ceiling as a project's address; `slugify` cuts at it. */
  slug: 80,
  name: 120,
  summary: 400,
  includedItem: 200,
  includedCount: 20,
  body: 6000,
  promotionLabel: 60,
  seoTitle: 80,
  seoDescription: 200,
  /** Euro cents: 0.01 € to 999,999.99 €. Zero is not a price. */
  amountCents: { min: 1, max: 99_999_999 },
} as const

/** The Dashboard list, as Projects: pages of 20, at most 50. */
export const SERVICE_PAGE_SIZE = { min: 1, default: 20, max: 50 } as const

/** One public batch. Bounded on the server, whatever the caller asks for. */
export const PUBLIC_SERVICE_BATCH = { min: 1, default: 6, max: 36, maxOffset: 600 } as const

/** A web address a published service may have. */
export const isValidServiceSlug = (slug: string): boolean =>
  slug.length > 0 && slug.length <= SERVICE_LIMITS.slug && SLUG_PATTERN.test(slug)

/* --------------------------------------------------------------- the payload */

export type ServiceTexts = {
  name: string
  /** The short description. */
  summary: string
  /** What is included — one sentence per entry. */
  included: string[]
  /** Optional longer copy, as plain text. */
  body: string
  /** Shown only while the promotion is switched on. */
  promotionLabel: string
  /** Optional. Empty means the name is used. */
  seoTitle: string
  /** Optional. Empty means the short description is used. */
  seoDescription: string
}

export type ServicePromotion = {
  active: boolean
  amountCents: number | null
}

export type ServicePrice = {
  /** `null` while the owner has not chosen — allowed in a draft, never live. */
  mode: PriceMode | null
  amountCents: number | null
  period: PricePeriod | null
  promotion: ServicePromotion
}

/** One version of a service: everything a visitor could ever see of it. */
export type ServiceDraftInput = {
  slug: string
  featured: boolean
  price: ServicePrice
  texts: Record<Language, ServiceTexts>
}

/**
 * What `PATCH /owner/services/:id` accepts: only what changes.
 *
 * Every key is optional, down to a single text field in a single language,
 * so the list can star a service by sending `{ featured: true }` and nothing
 * else — and a field that is not sent is a field that is not touched. A
 * `null` is a value ("no price"), not an omission.
 */
export type ServiceDraftPatch = {
  slug?: string
  featured?: boolean
  price?: {
    mode?: PriceMode | null
    amountCents?: number | null
    period?: PricePeriod | null
    promotion?: { active?: boolean; amountCents?: number | null }
  }
  texts?: Partial<Record<Language, Partial<ServiceTexts>>>
}

export const emptyServiceTexts = (): ServiceTexts => ({
  name: '',
  summary: '',
  included: [],
  body: '',
  promotionLabel: '',
  seoTitle: '',
  seoDescription: '',
})

export const emptyServiceDraft = (): ServiceDraftInput => ({
  slug: '',
  featured: false,
  price: { mode: null, amountCents: null, period: null, promotion: { active: false, amountCents: null } },
  texts: { de: emptyServiceTexts(), en: emptyServiceTexts(), ar: emptyServiceTexts() },
})

/* ------------------------------------------------------------- the schemas */

const text = (max: number, label: string) =>
  v.pipe(v.string(`${label} must be text`), v.trim(), v.maxLength(max, `${label} is too long`))

/** Line endings made one kind, so a Windows paste and a Mac paste are equal. */
const longText = (max: number, label: string) =>
  v.pipe(
    v.string(`${label} must be text`),
    v.transform((value) => value.replace(/\r\n?/g, '\n')),
    v.trim(),
    v.maxLength(max, `${label} is too long`),
  )

const SlugSchema = v.pipe(
  v.string('The web address must be text'),
  v.trim(),
  v.maxLength(SERVICE_LIMITS.slug, 'That address is too long'),
  v.check(
    (value) => value === '' || SLUG_PATTERN.test(value),
    'A web address may use lowercase letters, numbers and single hyphens only',
  ),
)

/**
 * A price in euro cents. A whole number, because a float cannot hold 0.10 €
 * exactly, and above zero, because "free" is something to write in the copy
 * rather than a price of 0 € to display.
 */
const AmountSchema = v.nullable(
  v.pipe(
    v.number('A price must be a number of cents'),
    v.integer('A price must be a whole number of cents'),
    v.minValue(SERVICE_LIMITS.amountCents.min, 'A price must be more than 0 €'),
    v.maxValue(SERVICE_LIMITS.amountCents.max, 'That price is too high'),
  ),
)

const IncludedSchema = v.pipe(
  v.array(
    v.pipe(
      v.string('Each included item must be text'),
      v.trim(),
      v.maxLength(SERVICE_LIMITS.includedItem, 'An included item is too long'),
    ),
    'What is included must be a list',
  ),
  // A blank line is a stray keystroke, not an item.
  v.transform((items) => items.filter((item) => item !== '')),
  v.maxLength(
    SERVICE_LIMITS.includedCount,
    `A service may list at most ${SERVICE_LIMITS.includedCount} included items`,
  ),
)

const TEXT_FIELDS = {
  name: text(SERVICE_LIMITS.name, 'The name'),
  summary: text(SERVICE_LIMITS.summary, 'The short description'),
  included: IncludedSchema,
  body: longText(SERVICE_LIMITS.body, 'The longer description'),
  promotionLabel: text(SERVICE_LIMITS.promotionLabel, 'The promotion label'),
  seoTitle: text(SERVICE_LIMITS.seoTitle, 'The search title'),
  seoDescription: text(SERVICE_LIMITS.seoDescription, 'The search description'),
} as const

const TextsSchema = v.object({
  name: v.optional(TEXT_FIELDS.name, ''),
  summary: v.optional(TEXT_FIELDS.summary, ''),
  included: v.optional(TEXT_FIELDS.included, []),
  body: v.optional(TEXT_FIELDS.body, ''),
  promotionLabel: v.optional(TEXT_FIELDS.promotionLabel, ''),
  seoTitle: v.optional(TEXT_FIELDS.seoTitle, ''),
  seoDescription: v.optional(TEXT_FIELDS.seoDescription, ''),
})

const TextsPatchSchema = v.object({
  name: v.optional(TEXT_FIELDS.name),
  summary: v.optional(TEXT_FIELDS.summary),
  included: v.optional(TEXT_FIELDS.included),
  body: v.optional(TEXT_FIELDS.body),
  promotionLabel: v.optional(TEXT_FIELDS.promotionLabel),
  seoTitle: v.optional(TEXT_FIELDS.seoTitle),
  seoDescription: v.optional(TEXT_FIELDS.seoDescription),
})

const ModeSchema = v.nullable(v.picklist(PRICE_MODES, 'Choose fixed, starting from or on request'))
const PeriodSchema = v.nullable(v.picklist(PRICE_PERIODS, 'Choose one-time, monthly or yearly'))

/**
 * A whole version. Used for the stored shape and for the merged result of a
 * patch. Shape and limits only: an unfinished service must stay saveable, so
 * completeness is `publishBlockers`' question, not this schema's.
 */
export const ServiceDraftSchema = v.pipe(
  v.object({
    slug: v.optional(SlugSchema, ''),
    featured: v.optional(v.boolean('Starred must be true or false'), false),
    // Defaults are functions so no two parses ever share one object.
    price: v.optional(
      v.object({
        mode: v.optional(ModeSchema, null),
        amountCents: v.optional(AmountSchema, null),
        period: v.optional(PeriodSchema, null),
        promotion: v.optional(
          v.object({
            active: v.optional(v.boolean(), false),
            amountCents: v.optional(AmountSchema, null),
          }),
          () => ({ active: false, amountCents: null }),
        ),
      }),
      () => emptyServiceDraft().price,
    ),
    texts: v.optional(
      v.object({
        de: v.optional(TextsSchema, emptyServiceTexts),
        en: v.optional(TextsSchema, emptyServiceTexts),
        ar: v.optional(TextsSchema, emptyServiceTexts),
      }),
      () => ({ de: emptyServiceTexts(), en: emptyServiceTexts(), ar: emptyServiceTexts() }),
    ),
  }),
  v.transform((draft) => normalizeServiceDraft(draft as ServiceDraftInput)),
) as unknown as v.GenericSchema<unknown, ServiceDraftInput>

/** The body of `PATCH /owner/services/:id`: the revision guard and a patch. */
export const ServicePatchSchema = v.object({
  // The editor sends back what it was given; a stale value means a second tab
  // saved in between, and that is a 409 rather than a silent overwrite.
  draftRevision: v.pipe(
    v.number('Send the revision you are editing'),
    v.integer(),
    v.minValue(1),
  ),
  slug: v.optional(SlugSchema),
  featured: v.optional(v.boolean('Starred must be true or false')),
  price: v.optional(
    v.object({
      mode: v.optional(ModeSchema),
      amountCents: v.optional(AmountSchema),
      period: v.optional(PeriodSchema),
      promotion: v.optional(
        v.object({ active: v.optional(v.boolean()), amountCents: v.optional(AmountSchema) }),
      ),
    }),
  ),
  texts: v.optional(
    v.object({
      de: v.optional(TextsPatchSchema),
      en: v.optional(TextsPatchSchema),
      ar: v.optional(TextsPatchSchema),
    }),
  ),
})

export type ServicePatchBody = v.InferOutput<typeof ServicePatchSchema>

export const CreateServiceSchema = v.object({
  name: v.optional(text(SERVICE_LIMITS.name, 'The name'), ''),
  /** Which language that name is written in. A draft may use only one. */
  language: v.optional(v.picklist(LANGUAGES, 'Choose de, en or ar'), 'en'),
})

export const ServiceRevisionSchema = v.object({
  draftRevision: v.pipe(v.number('Send the revision you are editing'), v.integer(), v.minValue(1)),
})

export const ServicePositionSchema = v.object({
  position: v.pipe(v.number('Send a position'), v.integer('A position is a whole number'), v.minValue(1)),
})

export const ServiceDeleteSchema = v.object({
  confirm: v.string('Send the service id to confirm'),
})

/* ------------------------------------------------------------ the arithmetic */

/**
 * The one place a stored version is made consistent.
 *
 * "On request" has no number and no offer (`docs/v2/services.md`: "absent for
 * quote-only", "Quote-only services have no numeric discount"), so choosing it
 * clears them rather than leaving a hidden price behind a mode that does not
 * show one. The promotion's label is text in three languages and is kept: it
 * costs nothing, and the owner who switches back should not have to retype it.
 */
export const normalizeServiceDraft = (draft: ServiceDraftInput): ServiceDraftInput => {
  if (draft.price.mode !== 'quote') return draft

  return {
    ...draft,
    price: {
      mode: 'quote',
      amountCents: null,
      period: null,
      promotion: { active: false, amountCents: null },
    },
  }
}

const pick = <T>(next: T | undefined, current: T): T => (next === undefined ? current : next)

/**
 * A patch laid over the stored version.
 *
 * Pure, so the Dashboard can show the exact result of a save before sending
 * it, and so the rule "what you did not send, you did not change" is one
 * function with its own tests rather than a property of some SQL.
 */
export const mergeServiceDraft = (
  current: ServiceDraftInput,
  patch: ServiceDraftPatch,
): ServiceDraftInput => {
  const texts = { ...current.texts }

  for (const language of LANGUAGES) {
    const change = patch.texts?.[language]

    if (!change) continue

    const before = current.texts[language]

    texts[language] = {
      name: pick(change.name, before.name),
      summary: pick(change.summary, before.summary),
      included: pick(change.included, before.included),
      body: pick(change.body, before.body),
      promotionLabel: pick(change.promotionLabel, before.promotionLabel),
      seoTitle: pick(change.seoTitle, before.seoTitle),
      seoDescription: pick(change.seoDescription, before.seoDescription),
    }
  }

  const price = patch.price

  return normalizeServiceDraft({
    slug: pick(patch.slug, current.slug),
    featured: pick(patch.featured, current.featured),
    price: {
      mode: pick(price?.mode, current.price.mode),
      amountCents: pick(price?.amountCents, current.price.amountCents),
      period: pick(price?.period, current.price.period),
      promotion: {
        active: pick(price?.promotion?.active, current.price.promotion.active),
        amountCents: pick(price?.promotion?.amountCents, current.price.promotion.amountCents),
      },
    },
    texts,
  })
}

/**
 * The same version, written in one fixed key order.
 *
 * Two versions are equal exactly when these strings are. That is how a save
 * that changes nothing is recognised as nothing, and how starring a live
 * service and un-starring it again leaves it "Live" rather than "Live · edited".
 */
export const canonicalServiceDraft = (draft: ServiceDraftInput): string =>
  JSON.stringify({
    slug: draft.slug,
    featured: draft.featured,
    price: {
      mode: draft.price.mode,
      amountCents: draft.price.amountCents,
      period: draft.price.period,
      promotion: {
        active: draft.price.promotion.active,
        amountCents: draft.price.promotion.amountCents,
      },
    },
    texts: LANGUAGES.map((language) => {
      const entry = draft.texts[language]

      return [
        language,
        entry.name,
        entry.summary,
        entry.included,
        entry.body,
        entry.promotionLabel,
        entry.seoTitle,
        entry.seoDescription,
      ]
    }),
  })

/* ---------------------------------------------------- the publication rules */

/**
 * What must be true before a visitor sees it.
 *
 * `docs/v2/services.md`: "Publishing requires complete German, English, and
 * Arabic versions. Each version needs a name, short description, and a list
 * of what is included." Plus the price rules: a fixed or starting-from price
 * has an amount and says whether it is one-time, monthly or yearly; an offer
 * that is switched on is lower than the normal price and has its short label
 * in all three languages.
 *
 * Sentences rather than a boolean, and shared with the editor, which draws
 * them as the checklist. Whether the address is *free* is not checked here —
 * that needs the database, and it is a 409, not a missing field.
 */
export const publishBlockers = (draft: ServiceDraftInput): string[] => {
  const blockers: string[] = []

  if (draft.slug === '') blockers.push('The web address is empty')
  else if (!isValidServiceSlug(draft.slug)) blockers.push('The web address is not valid')

  const { price } = draft

  if (price.mode === null) {
    blockers.push('Choose how the price is shown')
  } else if (price.mode === 'quote') {
    // `normalizeServiceDraft` makes this unreachable for anything that was
    // saved. Stated anyway, because this function also judges drafts the
    // editor has not sent yet.
    if (price.promotion.active) blockers.push('A price on request cannot have a promotion')
  } else {
    if (price.amountCents === null) blockers.push('The price is missing')
    if (price.period === null) {
      blockers.push('Choose whether the price is one-time, monthly or yearly')
    }

    if (price.promotion.active) {
      if (price.promotion.amountCents === null) {
        blockers.push('The promotional price is missing')
      } else if (price.amountCents !== null && price.promotion.amountCents >= price.amountCents) {
        blockers.push('The promotional price must be lower than the normal price')
      }
    }
  }

  const promotionShown = price.mode !== 'quote' && price.mode !== null && price.promotion.active

  for (const language of LANGUAGES) {
    const label = LANGUAGE_LABEL[language]
    const texts = draft.texts[language]

    if (texts.name.trim() === '') blockers.push(`${label}: the name is empty`)
    if (texts.summary.trim() === '') blockers.push(`${label}: the short description is empty`)
    if (texts.included.every((item) => item.trim() === '')) {
      blockers.push(`${label}: nothing is listed as included`)
    }
    if (promotionShown && texts.promotionLabel.trim() === '') {
      blockers.push(`${label}: the promotion label is empty`)
    }
  }

  return blockers
}

/* --------------------------------------------- the shapes the Dashboard gets */

/**
 * What the owner API answers with. In the contract rather than beside the
 * mapper, because the contract is the only part of `src/backend2/` the
 * frontend may import.
 */
export type OwnerService = {
  id: string
  position: number
  state: ServiceState
  draftRevision: number
  createdAt: string
  updatedAt: string
  firstPublishedAt: string | null
  publishedAt: string | null
  hasPendingChanges: boolean
  /** The address visitors use right now; null while it is not published. */
  publishedSlug: string | null
  /** What the owner is editing. */
  draft: ServiceDraftInput
  /** What visitors see right now; null while it is not published. */
  published: ServiceDraftInput | null
  /** Recomputed on every read, so the checklist is never stale. */
  publishBlockers: string[]
  slugAvailable: boolean
}

export type OwnerServiceListItem = {
  id: string
  position: number
  state: ServiceState
  /** Carried so a row can star a service without opening it. */
  draftRevision: number
  slug: string
  publishedSlug: string | null
  displayName: string
  languagesComplete: Language[]
  /** The owner's star, as saved. */
  featured: boolean
  /** The star visitors see; null while the service is not published. */
  featuredLive: boolean | null
  price: ServicePrice
  hasPendingChanges: boolean
  updatedAt: string
  publishedAt: string | null
}

/* --------------------------------------------- the shapes visitors get */

export type PublicServicePrice =
  | { mode: 'quote' }
  | {
      mode: 'fixed' | 'from'
      currency: typeof SERVICE_CURRENCY
      amountCents: number
      period: PricePeriod
      /** Present only while the owner has the offer switched on. */
      promotion: { amountCents: number; label: string } | null
    }

/**
 * The price a visitor is shown, or null if there is not a complete one.
 *
 * Here rather than in the server's mapper so the Dashboard's price preview is
 * this exact function: a live version always has a complete price (the
 * database refuses one that does not), so null only reaches a preview of an
 * unfinished draft. The offer appears only while it is switched on *and*
 * genuinely lower, with the one language's label.
 */
export const publicPriceOf = (price: ServicePrice, promotionLabel: string): PublicServicePrice | null => {
  if (price.mode === null) return null
  if (price.mode === 'quote') return { mode: 'quote' }
  if (price.amountCents === null || price.period === null) return null

  const offer = price.promotion

  return {
    mode: price.mode,
    currency: SERVICE_CURRENCY,
    amountCents: price.amountCents,
    period: price.period,
    promotion:
      offer.active && offer.amountCents !== null && offer.amountCents < price.amountCents
        ? { amountCents: offer.amountCents, label: promotionLabel }
        : null,
  }
}

export type PublicServiceCard = {
  slug: string
  name: string
  summary: string
  included: string[]
  /**
   * Never null for a published service — the database refuses a live version
   * without a complete price. Null only in the owner's preview of a draft
   * whose price is not finished yet.
   */
  price: PublicServicePrice | null
  publishedAt: string | null
}

export type PublicServiceDetail = PublicServiceCard & {
  /** The address to use. When it differs from the one asked for, redirect. */
  canonicalSlug: string
  body: string
  /** Already resolved: the owner's override, or the name and short description. */
  seo: { title: string; description: string }
}

export type PublicServiceBatch = {
  items: PublicServiceCard[]
  offset: number
  limit: number
  total: number
  hasMore: boolean
}

/* -------------------------------------------------------------- the queries */

const IntFromQuery = (fallback: number, min: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(String(value).trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(min, 'That is below the smallest allowed value'),
    v.maxValue(max, 'That is above the largest allowed value'),
  )

export const ServiceListQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(SERVICE_PAGE_SIZE.default, SERVICE_PAGE_SIZE.min, SERVICE_PAGE_SIZE.max),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(120)), ''),
  state: v.optional(v.picklist(SERVICE_LIST_STATES), 'all'),
  featured: v.optional(v.picklist(SERVICE_FEATURED_FILTERS), 'all'),
  /** Which language's name each row shows. The Dashboard is English. */
  language: v.optional(v.picklist(LANGUAGES), 'en'),
})

export type ServiceListQuery = v.InferOutput<typeof ServiceListQuerySchema>

export const PublicServiceListQuerySchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'de'),
  offset: IntFromQuery(0, 0, PUBLIC_SERVICE_BATCH.maxOffset),
  limit: IntFromQuery(PUBLIC_SERVICE_BATCH.default, PUBLIC_SERVICE_BATCH.min, PUBLIC_SERVICE_BATCH.max),
  /** `only` is the homepage: starred, published, in the same manual order. */
  featured: v.optional(v.picklist(['all', 'only'] as const), 'all'),
})

export const PublicServiceDetailQuerySchema = v.object({
  language: v.optional(v.picklist(LANGUAGES), 'de'),
})

/* ------------------------------------------------------------ the wording */

/**
 * The Dashboard's words, next to the values they describe so the list and the
 * editor cannot disagree. English, because Dashboard V2 is English. What a
 * visitor reads in German, English and Arabic is the public site's copy and is
 * settled in the Design Lab.
 */
export const SERVICE_STATE_WORDS: Record<ServiceState, { label: string; meaning: string }> = {
  draft: { label: 'Private', meaning: 'Only you can see this. It has never been published.' },
  published: { label: 'Live', meaning: 'Visitors see exactly what you have saved.' },
  published_with_pending_changes: {
    label: 'Live · edited',
    meaning: 'Visitors still see the older version. Your changes are saved but not published.',
  },
  unpublished: {
    label: 'Taken down',
    meaning: 'You published this before and then took it down.',
  },
}

export const PRICE_MODE_WORDS: Record<PriceMode, string> = {
  fixed: 'Fixed price',
  from: 'Starting from',
  quote: 'On request',
}

export const PRICE_PERIOD_WORDS: Record<PricePeriod, string> = {
  one_time: 'One-time',
  monthly: 'Per month',
  yearly: 'Per year',
}

/**
 * Which languages are complete enough to publish: a name, a short description
 * and at least one included item — the three things publication demands.
 */
export const completeServiceLanguages = (texts: Record<Language, ServiceTexts>): Language[] =>
  LANGUAGES.filter(
    (language) =>
      texts[language].name.trim() !== '' &&
      texts[language].summary.trim() !== '' &&
      texts[language].included.some((item) => item.trim() !== ''),
  )

/**
 * The name to show when the requested language has none: English, then
 * German, then Arabic. A service with no name anywhere is "Untitled" rather
 * than a blank row the owner cannot click.
 */
export const serviceDisplayName = (
  texts: Record<Language, Pick<ServiceTexts, 'name'>>,
  preferred: Language,
): string => {
  for (const language of [preferred, 'en', 'de', 'ar'] as const) {
    const name = texts[language]?.name.trim()

    if (name) return name
  }

  return 'Untitled service'
}

/** A suggested address from a name. Arabic alone suggests nothing. */
export const suggestServiceSlug = (name: string): string => slugify(name)
