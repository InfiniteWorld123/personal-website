import { withTransaction } from '../../db/client'
import type { Page } from '../../contracts/pagination.contract'
import {
  type Language,
  type OwnerService,
  type OwnerServiceListItem,
  type PublicServiceBatch,
  type PublicServiceDetail,
  type ServiceDraftInput,
  type ServiceDraftPatch,
  type ServiceListQuery,
  canonicalServiceDraft,
  isValidServiceSlug,
  mergeServiceDraft,
  publishBlockers,
  suggestServiceSlug,
} from '../../contracts/service.contract'
import { conflict, notFound } from '../../http/error'
import * as repo from './service.repo'
import { toListItem, toOwnerService, toPublicCard, toPublicDetail } from './service.mapper'

/**
 * What a Services request actually does.
 *
 * The rule this file keeps is the owner's: *saving cannot change what visitors
 * see.* Every draft operation writes the draft version and reads the published
 * one only to report on it. The one place the two meet is `publish`, in
 * `service.publish.ts`.
 */

/* ------------------------------------------------------------------ reading */

/** The draft, and the live version if there is one. */
export const loadVersions = async (
  row: repo.ServiceRow,
): Promise<{ draft: ServiceDraftInput; published: ServiceDraftInput | null }> => {
  // Every path that creates a service creates its draft too. A missing one
  // could only be a row deleted behind the application's back.
  const draft = row.draft_version_id ? await repo.loadVersion(row.draft_version_id) : null

  if (!draft) throw notFound('That service has no draft')

  const published = row.published_version_id
    ? await repo.loadVersion(row.published_version_id)
    : null

  return { draft, published }
}

/**
 * Is this address free for this service?
 *
 * Free means nobody holds it, or the holder is this service. Every address a
 * service was ever published under is held, so an old link can never start
 * pointing at somebody else.
 */
export const isSlugAvailable = async (input: {
  slug: string
  serviceId: string
}): Promise<boolean> => {
  if (input.slug === '') return false

  const owner = await repo.findSlugOwner(input.slug)

  return owner === null || owner === input.serviceId
}

const describe = async (row: repo.ServiceRow): Promise<OwnerService> => {
  const { draft, published } = await loadVersions(row)

  return toOwnerService({
    row,
    draft,
    published,
    publishedSlug: row.published_version_id ? await repo.currentSlug(row.id) : null,
    blockers: publishBlockers(draft),
    slugAvailable: await isSlugAvailable({ slug: draft.slug, serviceId: row.id }),
  })
}

export const getService = async (id: string): Promise<OwnerService> => {
  const row = await repo.findService(id)

  if (!row) throw notFound('That service does not exist')

  return describe(row)
}

export const listServices = async (
  query: ServiceListQuery,
): Promise<Page<OwnerServiceListItem>> => {
  const first = await repo.listServices(query)
  const pageCount = Math.max(1, Math.ceil(first.total / query.pageSize))

  /*
   * A page past the end is clamped rather than answered with nothing: a
   * narrower filter must not strand the owner on page 4 of 2.
   */
  const page = Math.min(query.page, pageCount)
  const result = page === query.page ? first : await repo.listServices({ ...query, page })

  const texts = await repo.loadTexts(
    result.rows.map((row) => row.draft_version_id).filter((id): id is string => id !== null),
  )

  return {
    items: result.rows.map((row) =>
      toListItem({ row, texts: texts.get(row.draft_version_id ?? ''), language: query.language }),
    ),
    page,
    pageSize: query.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
  }
}

/* ----------------------------------------------------------------- creating */

/**
 * A new private draft, at the end of the order.
 *
 * The name goes into the one language it was written in, and the address is
 * only a suggestion from it: an Arabic-only name suggests nothing, and an
 * empty address is a perfectly good draft.
 */
export const createService = async (input: {
  name: string
  language: Language
}): Promise<OwnerService> => {
  const id = await withTransaction(async () => {
    await repo.lockOrder()

    return repo.insertService({
      name: input.name,
      language: input.language,
      slug: suggestServiceSlug(input.name),
    })
  })

  return getService(id)
}

/* ------------------------------------------------------------------- saving */

const staleRevision = () =>
  conflict('This service was changed somewhere else. Reload the page to see the newer version.')

/**
 * Pending edits: whatever was sent, laid over the draft.
 *
 * A save that changes nothing writes nothing and keeps the revision, so an
 * editor that saves on a timer cannot make a live service look edited. And a
 * save that makes the draft identical to what is live again — a star switched
 * on and off — records that, so the service goes back to "Live" rather than
 * claiming changes that are not there.
 */
export const patchService = async (input: {
  serviceId: string
  draftRevision: number
  patch: ServiceDraftPatch
}): Promise<OwnerService> => {
  await withTransaction(async () => {
    const row = await repo.lockService(input.serviceId)

    if (!row) throw notFound('That service does not exist')
    if (!row.draft_version_id) throw notFound('That service has no draft')
    if (row.draft_revision !== input.draftRevision) throw staleRevision()

    const { draft, published } = await loadVersions(row)
    const next = mergeServiceDraft(draft, input.patch)

    if (canonicalServiceDraft(next) === canonicalServiceDraft(draft)) return

    await repo.writeVersion(row.draft_version_id, next)

    const revision = await repo.bumpRevision(row.id)

    if (published && canonicalServiceDraft(next) === canonicalServiceDraft(published)) {
      await repo.markInSync(row.id, revision)
    }
  })

  return getService(input.serviceId)
}

/* -------------------------------------------------------------------- public */

/**
 * What a visitor may read, and only that.
 *
 * These functions never look at a draft version. They join
 * `published_version_id`, and there is nothing else to join.
 */
export const listPublicServices = async (input: {
  language: Language
  offset: number
  limit: number
  featured: 'all' | 'only'
}): Promise<PublicServiceBatch> => {
  const { rows, total } = await repo.listPublished({
    offset: input.offset,
    limit: input.limit,
    featuredOnly: input.featured === 'only',
  })

  const texts = await repo.loadTextsIn(
    rows.map((row) => row.id),
    input.language,
  )

  const items = rows.map((row) => {
    const version = repo.toVersionInput(
      row,
      new Map(texts.has(row.id) ? [[input.language, texts.get(row.id)!]] : []),
    )

    return toPublicCard({ version, language: input.language, publishedAt: row.published_at })
  })

  return {
    items,
    offset: input.offset,
    limit: input.limit,
    total,
    hasMore: input.offset + items.length < total,
  }
}

export const readPublicService = async (input: {
  slug: string
  language: Language
}): Promise<PublicServiceDetail> => {
  // A draft, a service that was taken down and a deleted one all answer
  // exactly as an address that never existed — and so does an address that
  // could not exist, without a query. Nothing is revealed by the difference.
  const found = isValidServiceSlug(input.slug) ? await repo.findPublishedBySlug(input.slug) : null

  if (!found) throw notFound('That service does not exist')

  const version = await repo.loadVersion(found.id)

  if (!version) throw notFound('That service does not exist')

  return toPublicDetail({
    version,
    language: input.language,
    publishedAt: found.published_at,
    canonicalSlug: found.canonical_slug ?? version.slug,
  })
}

/**
 * The draft, in the public shape, for the owner's preview.
 *
 * Built by the same projection the live site uses, so the preview shows what
 * publishing would produce — the same price terms, the same fallbacks —
 * rather than a second renderer that agrees until it does not.
 */
export const previewService = async (input: {
  serviceId: string
  language: Language
}): Promise<PublicServiceDetail> => {
  const row = await repo.findService(input.serviceId)

  if (!row) throw notFound('That service does not exist')

  const { draft } = await loadVersions(row)

  return toPublicDetail({
    version: draft,
    language: input.language,
    publishedAt: row.published_at,
    canonicalSlug: draft.slug,
  })
}
