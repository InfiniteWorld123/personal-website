import {
  type Language,
  type OwnerService,
  type OwnerServiceListItem,
  type PublicServiceCard,
  type PublicServiceDetail,
  type ServiceDraftInput,
  type ServiceState,
  type ServiceTexts,
  completeServiceLanguages,
  emptyServiceDraft,
  publicPriceOf,
  serviceDisplayName,
} from '../../contracts/service.contract'
import type { ListRow, ServiceRow } from './service.repo'

/**
 * Rows in, responses out.
 *
 * Two audiences with opposite rules. The owner's shape carries what the editor
 * needs. The public shape is built **field by field from typed input, never
 * by spreading a row** — so a private draft, a revision number or an internal
 * id cannot reach a visitor because somebody added a column later.
 */

/* ------------------------------------------------------------------- states */

/**
 * Derived on every read, never stored. A service that was taken down is told
 * apart from one that was never published by `first_published_at`.
 */
export const serviceState = (row: ServiceRow): ServiceState => {
  if (row.published_version_id === null) {
    return row.first_published_at === null ? 'draft' : 'unpublished'
  }

  return hasPendingChanges(row) ? 'published_with_pending_changes' : 'published'
}

export const hasPendingChanges = (row: ServiceRow): boolean =>
  row.published_version_id !== null && row.draft_revision !== row.published_draft_revision

const iso = (value: Date | null): string | null => (value ? new Date(value).toISOString() : null)

/* -------------------------------------------------------------- owner shape */

export const toOwnerService = (input: {
  row: ServiceRow
  draft: ServiceDraftInput
  published: ServiceDraftInput | null
  publishedSlug: string | null
  blockers: string[]
  slugAvailable: boolean
}): OwnerService => ({
  id: input.row.id,
  position: input.row.position,
  state: serviceState(input.row),
  draftRevision: input.row.draft_revision,
  createdAt: iso(input.row.created_at)!,
  updatedAt: iso(input.row.updated_at)!,
  firstPublishedAt: iso(input.row.first_published_at),
  publishedAt: iso(input.row.published_at),
  hasPendingChanges: hasPendingChanges(input.row),
  publishedSlug: input.publishedSlug,
  draft: input.draft,
  published: input.published,
  publishBlockers: input.blockers,
  slugAvailable: input.slugAvailable,
})

export const toListItem = (input: {
  row: ListRow
  texts: Record<Language, ServiceTexts> | undefined
  language: Language
}): OwnerServiceListItem => {
  const texts = input.texts ?? emptyServiceDraft().texts

  return {
    id: input.row.id,
    position: input.row.position,
    state: serviceState(input.row),
    draftRevision: input.row.draft_revision,
    slug: input.row.slug,
    publishedSlug: input.row.published_slug,
    displayName: serviceDisplayName(texts, input.language),
    languagesComplete: completeServiceLanguages(texts),
    featured: input.row.featured,
    featuredLive: input.row.featured_live,
    price: {
      mode: input.row.price_mode,
      amountCents: input.row.price_amount_cents,
      period: input.row.price_period,
      promotion: {
        active: input.row.promotion_active,
        amountCents: input.row.promotion_amount_cents,
      },
    },
    hasPendingChanges: hasPendingChanges(input.row),
    updatedAt: iso(input.row.updated_at)!,
    publishedAt: iso(input.row.published_at),
  }
}

/* ------------------------------------------------------------- public shape */

/** One definition, shared with the Dashboard preview: see the contract. */
export const toPublicPrice = publicPriceOf

/**
 * A card, one field at a time, in one language. The other two languages are
 * not sent, and neither is anything the owner has saved but not published —
 * the caller hands this function the published version, and only that.
 */
export const toPublicCard = (input: {
  version: ServiceDraftInput
  language: Language
  publishedAt: Date | null
}): PublicServiceCard => {
  const texts = input.version.texts[input.language]

  return {
    slug: input.version.slug,
    name: texts.name,
    summary: texts.summary,
    included: [...texts.included],
    price: toPublicPrice(input.version.price, texts.promotionLabel),
    publishedAt: iso(input.publishedAt),
  }
}

export const toPublicDetail = (input: {
  version: ServiceDraftInput
  language: Language
  publishedAt: Date | null
  canonicalSlug: string
}): PublicServiceDetail => {
  const texts = input.version.texts[input.language]

  return {
    ...toPublicCard(input),
    canonicalSlug: input.canonicalSlug,
    body: texts.body,
    // Resolved here so every consumer — the page head, a social card, the
    // preview — falls back the same way.
    seo: {
      title: texts.seoTitle.trim() !== '' ? texts.seoTitle : texts.name,
      description: texts.seoDescription.trim() !== '' ? texts.seoDescription : texts.summary,
    },
  }
}
