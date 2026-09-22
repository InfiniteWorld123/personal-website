import { getDb } from '../../db/client'
import {
  LANGUAGES,
  type Language,
  type PriceMode,
  type PricePeriod,
  type ServiceDraftInput,
  type ServiceListQuery,
  type ServiceTexts,
  emptyServiceDraft,
  emptyServiceTexts,
} from '../../contracts/service.contract'

/**
 * Every statement Services runs. No business rule lives here and no HTTP
 * concept reaches it — the service layer decides what should happen, this
 * decides how it is written down, against the shape `0005_services.sql`
 * installed.
 *
 * Queries run one after another, never `Promise.all`: a Cloudflare Worker may
 * hold six sockets at once, and the local development database answers one
 * connection at a time (`docs/v2/auth.md`).
 */

export type ServiceRow = {
  id: string
  position: number
  draft_version_id: string | null
  published_version_id: string | null
  draft_revision: number
  published_draft_revision: number | null
  first_published_at: Date | null
  published_at: Date | null
  created_at: Date
  updated_at: Date
}

export type VersionRow = {
  id: string
  service_id: string
  kind: 'draft' | 'published'
  slug: string
  featured: boolean
  price_mode: PriceMode | null
  price_amount_cents: number | null
  price_period: PricePeriod | null
  promotion_active: boolean
  promotion_amount_cents: number | null
}

type TextRow = {
  version_id: string
  language: Language
  name: string
  summary: string
  included: string[] | null
  body: string
  promotion_label: string
  seo_title: string
  seo_description: string
}

const TEXT_COLUMNS =
  'version_id, language, name, summary, included, body, promotion_label, seo_title, seo_description'

const toTexts = (row: TextRow): ServiceTexts => ({
  name: row.name,
  summary: row.summary,
  included: row.included ?? [],
  body: row.body,
  promotionLabel: row.promotion_label,
  seoTitle: row.seo_title,
  seoDescription: row.seo_description,
})

/** A version row and its three text rows, as one version. */
export const toVersionInput = (
  version: VersionRow,
  texts: Map<Language, ServiceTexts>,
): ServiceDraftInput => ({
  slug: version.slug,
  featured: version.featured,
  price: {
    mode: version.price_mode,
    amountCents: version.price_amount_cents,
    period: version.price_period,
    promotion: {
      active: version.promotion_active,
      amountCents: version.promotion_amount_cents,
    },
  },
  texts: {
    de: texts.get('de') ?? emptyServiceTexts(),
    en: texts.get('en') ?? emptyServiceTexts(),
    ar: texts.get('ar') ?? emptyServiceTexts(),
  },
})

/* --------------------------------------------------------------- one service */

export const findService = async (id: string): Promise<ServiceRow | null> => {
  const { rows } = await getDb().query<ServiceRow>('SELECT * FROM v2_services WHERE id = $1', [id])

  return rows[0] ?? null
}

/**
 * The same row, locked until the transaction ends.
 *
 * Publishing reads the draft, checks it, and then writes a new live version.
 * Without the lock two overlapping publishes could both pass the checks, and
 * the loser would already have deleted the version that was live.
 */
export const lockService = async (id: string): Promise<ServiceRow | null> => {
  const { rows } = await getDb().query<ServiceRow>(
    'SELECT * FROM v2_services WHERE id = $1 FOR UPDATE',
    [id],
  )

  return rows[0] ?? null
}

/** One version, texts included, or null if the row is gone. */
export const loadVersion = async (versionId: string): Promise<ServiceDraftInput | null> => {
  const db = getDb()

  const { rows: versions } = await db.query<VersionRow>(
    'SELECT * FROM v2_service_versions WHERE id = $1',
    [versionId],
  )
  const version = versions[0]

  if (!version) return null

  const { rows } = await db.query<TextRow>(
    `SELECT ${TEXT_COLUMNS} FROM v2_service_texts WHERE version_id = $1`,
    [versionId],
  )

  return toVersionInput(version, new Map(rows.map((row) => [row.language, toTexts(row)])))
}

/* ---------------------------------------------------------------- the order */

/**
 * Serialises everything that changes the order: creating, moving, deleting.
 *
 * A transaction-scoped advisory lock rather than a lock on rows, because a
 * new service has no row to lock yet — two creates reading the same `MAX`
 * would otherwise both claim the same position. Released at COMMIT or
 * ROLLBACK on its own, so there is nothing to forget.
 */
export const lockOrder = async (): Promise<void> => {
  await getDb().query(`SELECT pg_advisory_xact_lock(hashtext('v2_services.position'))`)
}

export const idsInOrder = async (): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_services ORDER BY position, id',
  )

  return rows.map((row) => row.id)
}

/**
 * The whole order, rewritten densely. The unique key on `position` is
 * deferred, so the sequence may collide with itself halfway and is checked
 * once at COMMIT.
 */
export const writeOrder = async (ids: string[]): Promise<void> => {
  const db = getDb()

  await db.query('SET CONSTRAINTS ALL DEFERRED')

  for (const [index, id] of ids.entries()) {
    await db.query(
      'UPDATE v2_services SET position = $2 WHERE id = $1 AND position IS DISTINCT FROM $2',
      [id, index + 1],
    )
  }
}

/* ------------------------------------------------------------------ creation */

/**
 * A service and its draft, in one transaction, appended to the end of the
 * order. The two tables point at each other; both keys are deferrable, so
 * the service row is written before the version it names.
 */
export const insertService = async (input: {
  slug: string
  name: string
  language: Language
}): Promise<string> => {
  const db = getDb()

  await db.query('SET CONSTRAINTS ALL DEFERRED')

  const { rows: positioned } = await db.query<{ next: number }>(
    'SELECT COALESCE(MAX(position), 0) + 1 AS next FROM v2_services',
  )

  const { rows: created } = await db.query<{ id: string }>(
    'INSERT INTO v2_services (position) VALUES ($1) RETURNING id',
    [positioned[0]?.next ?? 1],
  )
  const serviceId = created[0]!.id

  const { rows: version } = await db.query<{ id: string }>(
    `INSERT INTO v2_service_versions (service_id, kind, slug)
          VALUES ($1, 'draft', $2) RETURNING id`,
    [serviceId, input.slug],
  )
  const versionId = version[0]!.id

  // Three rows always, so the editor never meets a missing language. The
  // name goes only where it was written: a draft may be in one language.
  for (const language of LANGUAGES) {
    await db.query(
      'INSERT INTO v2_service_texts (version_id, language, name) VALUES ($1, $2, $3)',
      [versionId, language, language === input.language ? input.name : ''],
    )
  }

  await db.query('UPDATE v2_services SET draft_version_id = $1 WHERE id = $2', [
    versionId,
    serviceId,
  ])

  return serviceId
}

/* ------------------------------------------------------------------ writing */

/**
 * A version's whole content, replaced. The texts are upserted so the three
 * rows are never absent, even for a moment inside the transaction.
 */
export const writeVersion = async (versionId: string, draft: ServiceDraftInput): Promise<void> => {
  const db = getDb()

  await db.query(
    `UPDATE v2_service_versions
        SET slug = $2, featured = $3, price_mode = $4, price_amount_cents = $5,
            price_period = $6, promotion_active = $7, promotion_amount_cents = $8
      WHERE id = $1`,
    [
      versionId,
      draft.slug,
      draft.featured,
      draft.price.mode,
      draft.price.amountCents,
      draft.price.period,
      draft.price.promotion.active,
      draft.price.promotion.amountCents,
    ],
  )

  for (const language of LANGUAGES) {
    const texts = draft.texts[language]

    await db.query(
      `INSERT INTO v2_service_texts
              (version_id, language, name, summary, included, body,
               promotion_label, seo_title, seo_description)
            VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9)
       ON CONFLICT (version_id, language) DO UPDATE
            SET name = EXCLUDED.name,
                summary = EXCLUDED.summary,
                included = EXCLUDED.included,
                body = EXCLUDED.body,
                promotion_label = EXCLUDED.promotion_label,
                seo_title = EXCLUDED.seo_title,
                seo_description = EXCLUDED.seo_description`,
      [
        versionId,
        language,
        texts.name,
        texts.summary,
        texts.included,
        texts.body,
        texts.promotionLabel,
        texts.seoTitle,
        texts.seoDescription,
      ],
    )
  }
}

export const bumpRevision = async (serviceId: string): Promise<number> => {
  const { rows } = await getDb().query<{ draft_revision: number }>(
    `UPDATE v2_services
        SET draft_revision = draft_revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING draft_revision`,
    [serviceId],
  )

  return rows[0]!.draft_revision
}

/** Records that the draft at `revision` is exactly what is live. */
export const markInSync = async (serviceId: string, revision: number): Promise<void> => {
  await getDb().query('UPDATE v2_services SET published_draft_revision = $2 WHERE id = $1', [
    serviceId,
    revision,
  ])
}

/**
 * The draft, copied into a new published version.
 *
 * A copy rather than a pointer swap: the version a visitor reads keeps saying
 * what it said when the owner pressed Publish, whatever the draft does next.
 */
export const copyToPublished = async (input: {
  serviceId: string
  draftVersionId: string
}): Promise<string> => {
  const db = getDb()

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO v2_service_versions
            (service_id, kind, slug, featured, price_mode, price_amount_cents, price_period,
             promotion_active, promotion_amount_cents)
     SELECT service_id, 'published', slug, featured, price_mode, price_amount_cents, price_period,
            promotion_active, promotion_amount_cents
       FROM v2_service_versions WHERE id = $1
     RETURNING id`,
    [input.draftVersionId],
  )
  const publishedId = rows[0]!.id

  await db.query(
    `INSERT INTO v2_service_texts
            (version_id, language, name, summary, included, body,
             promotion_label, seo_title, seo_description)
     SELECT $2, language, name, summary, included, body,
            promotion_label, seo_title, seo_description
       FROM v2_service_texts WHERE version_id = $1`,
    [input.draftVersionId, publishedId],
  )

  return publishedId
}

export const deleteVersion = async (versionId: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_service_versions WHERE id = $1', [versionId])
}

export const setPublished = async (input: {
  serviceId: string
  publishedVersionId: string | null
  draftRevision?: number
  firstPublish?: boolean
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_services
        SET published_version_id = $2,
            published_draft_revision = $3,
            published_at = CASE WHEN $2::uuid IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
            first_published_at = CASE
              WHEN $4::boolean THEN CURRENT_TIMESTAMP ELSE first_published_at END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [
      input.serviceId,
      input.publishedVersionId,
      input.draftRevision ?? null,
      input.firstPublish ?? false,
    ],
  )
}

export const deleteService = async (serviceId: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_services WHERE id = $1', [serviceId])
}

/* --------------------------------------------------------------------- slugs */

/** Which service holds this address — now or at any time before — if any. */
export const findSlugOwner = async (slug: string): Promise<string | null> => {
  const { rows } = await getDb().query<{ service_id: string }>(
    'SELECT service_id FROM v2_service_slugs WHERE slug = $1',
    [slug],
  )

  return rows[0]?.service_id ?? null
}

export const currentSlug = async (serviceId: string): Promise<string | null> => {
  const { rows } = await getDb().query<{ slug: string }>(
    'SELECT slug FROM v2_service_slugs WHERE service_id = $1 AND is_current',
    [serviceId],
  )

  return rows[0]?.slug ?? null
}

/**
 * Makes `slug` this service's current address, keeping every earlier one as a
 * retired address that still resolves.
 *
 * The upsert only ever updates a row this service already owns. If another
 * service claimed the address in the same instant, nothing comes back, and the
 * caller answers with a conflict instead of quietly sharing the address.
 */
export const claimSlug = async (input: { serviceId: string; slug: string }): Promise<boolean> => {
  const db = getDb()

  await db.query(
    'UPDATE v2_service_slugs SET is_current = false WHERE service_id = $1 AND slug <> $2',
    [input.serviceId, input.slug],
  )

  const { rows } = await db.query<{ slug: string }>(
    `INSERT INTO v2_service_slugs (slug, service_id, is_current) VALUES ($1, $2, true)
     ON CONFLICT (slug) DO UPDATE SET is_current = true
       WHERE v2_service_slugs.service_id = EXCLUDED.service_id
     RETURNING slug`,
    [input.slug, input.serviceId],
  )

  return rows.length === 1
}

/** Taken down: the history stays, so nobody else can take the address. */
export const retireSlugs = async (serviceId: string): Promise<void> => {
  await getDb().query('UPDATE v2_service_slugs SET is_current = false WHERE service_id = $1', [
    serviceId,
  ])
}

/* ------------------------------------------------------------------- listing */

export type ListRow = ServiceRow & {
  slug: string
  featured: boolean
  price_mode: PriceMode | null
  price_amount_cents: number | null
  price_period: PricePeriod | null
  promotion_active: boolean
  promotion_amount_cents: number | null
  featured_live: boolean | null
  published_slug: string | null
}

/** `%` and `_` typed by the owner are letters to find, not wildcards. */
const likeTerm = (search: string): string =>
  `%${search.toLowerCase().replace(/[\\%_]/g, (character) => `\\${character}`)}%`

/**
 * The Dashboard list.
 *
 * Filters change which rows come back and never touch `position`: the order
 * is global, and narrowing a search must not renumber what the owner cannot
 * currently see.
 */
export const listServices = async (
  query: ServiceListQuery,
): Promise<{ rows: ListRow[]; total: number }> => {
  const conditions: string[] = []
  const values: unknown[] = []
  const bind = (value: unknown): string => `$${values.push(value)}`

  if (query.state === 'draft') {
    conditions.push('s.published_version_id IS NULL AND s.first_published_at IS NULL')
  } else if (query.state === 'unpublished') {
    conditions.push('s.published_version_id IS NULL AND s.first_published_at IS NOT NULL')
  } else if (query.state === 'published') {
    conditions.push(
      's.published_version_id IS NOT NULL AND s.draft_revision IS NOT DISTINCT FROM s.published_draft_revision',
    )
  } else if (query.state === 'pending' || query.state === 'published_with_pending_changes') {
    conditions.push(
      's.published_version_id IS NOT NULL AND s.draft_revision IS DISTINCT FROM s.published_draft_revision',
    )
  }

  if (query.featured === 'featured') conditions.push('d.featured')
  if (query.featured === 'not_featured') conditions.push('NOT d.featured')

  if (query.search !== '') {
    // Across the address and every language, not only the one the row shows:
    // searching for an Arabic name must find a row that happens to be in
    // English.
    const term = bind(likeTerm(query.search))

    conditions.push(`(
      LOWER(d.slug) LIKE ${term} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM v2_service_texts t
         WHERE t.version_id = d.id
           AND (LOWER(t.name) LIKE ${term} ESCAPE '\\' OR LOWER(t.summary) LIKE ${term} ESCAPE '\\')
      )
    )`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const from = `
    FROM v2_services s
    JOIN v2_service_versions d ON d.id = s.draft_version_id
    LEFT JOIN v2_service_versions p ON p.id = s.published_version_id
    ${where}
  `

  const db = getDb()

  const { rows: counted } = await db.query<{ total: string }>(
    `SELECT count(*)::text AS total ${from}`,
    values,
  )

  const limit = bind(query.pageSize)
  const offset = bind((query.page - 1) * query.pageSize)

  const { rows } = await db.query<ListRow>(
    `SELECT s.*, d.slug, d.featured, d.price_mode, d.price_amount_cents, d.price_period,
            d.promotion_active, d.promotion_amount_cents,
            p.featured AS featured_live,
            (SELECT c.slug FROM v2_service_slugs c
              WHERE c.service_id = s.id AND c.is_current) AS published_slug
     ${from}
     ORDER BY s.position, s.id
     LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

/** Every language's texts for a page of versions, in one query. */
export const loadTexts = async (
  versionIds: string[],
): Promise<Map<string, Record<Language, ServiceTexts>>> => {
  const result = new Map<string, Record<Language, ServiceTexts>>()

  if (versionIds.length === 0) return result

  const { rows } = await getDb().query<TextRow>(
    `SELECT ${TEXT_COLUMNS} FROM v2_service_texts WHERE version_id = ANY($1::uuid[])`,
    [versionIds],
  )

  for (const row of rows) {
    const entry = result.get(row.version_id) ?? emptyServiceDraft().texts

    entry[row.language] = toTexts(row)
    result.set(row.version_id, entry)
  }

  return result
}

/** One language's texts for a batch of versions — all a visitor is sent. */
export const loadTextsIn = async (
  versionIds: string[],
  language: Language,
): Promise<Map<string, ServiceTexts>> => {
  const result = new Map<string, ServiceTexts>()

  if (versionIds.length === 0) return result

  const { rows } = await getDb().query<TextRow>(
    `SELECT ${TEXT_COLUMNS} FROM v2_service_texts
      WHERE version_id = ANY($1::uuid[]) AND language = $2`,
    [versionIds, language],
  )

  for (const row of rows) result.set(row.version_id, toTexts(row))

  return result
}

/* -------------------------------------------------------------------- public */

export type PublishedRow = VersionRow & { published_at: Date | null }

/**
 * One batch of published services, in the owner's order, and how many exist.
 *
 * `LIMIT`/`OFFSET` in SQL rather than a full read sliced by the caller: the
 * public site must never be able to ask for the whole catalogue at once.
 * `featuredOnly` is the homepage — the same order, narrowed to the stars that
 * are live. A star on a draft does not count until it is published.
 */
export const listPublished = async (input: {
  offset: number
  limit: number
  featuredOnly: boolean
}): Promise<{ rows: PublishedRow[]; total: number }> => {
  const db = getDb()
  const featured = input.featuredOnly ? 'AND pv.featured' : ''

  const { rows: counted } = await db.query<{ total: string }>(
    `SELECT count(*)::text AS total
       FROM v2_services s
       JOIN v2_service_versions pv ON pv.id = s.published_version_id
      WHERE s.published_version_id IS NOT NULL ${featured}`,
  )

  const { rows } = await db.query<PublishedRow>(
    `SELECT pv.*, s.published_at
       FROM v2_services s
       JOIN v2_service_versions pv ON pv.id = s.published_version_id
      WHERE s.published_version_id IS NOT NULL ${featured}
      ORDER BY s.position, s.id
      LIMIT $1 OFFSET $2`,
    [input.limit, input.offset],
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

/**
 * One published service by any address it has ever been published under.
 *
 * The join runs through `v2_service_slugs`, so a retired address still finds
 * the service and the caller names the current one. A draft or a service that
 * was taken down matches nothing here — the same answer as an address that
 * never existed.
 */
export const findPublishedBySlug = async (
  slug: string,
): Promise<(PublishedRow & { canonical_slug: string | null }) | null> => {
  const { rows } = await getDb().query<PublishedRow & { canonical_slug: string | null }>(
    `SELECT pv.*, s.published_at,
            (SELECT c.slug FROM v2_service_slugs c
              WHERE c.service_id = s.id AND c.is_current) AS canonical_slug
       FROM v2_service_slugs a
       JOIN v2_services s ON s.id = a.service_id
       JOIN v2_service_versions pv ON pv.id = s.published_version_id
      WHERE a.slug = $1 AND s.published_version_id IS NOT NULL`,
    [slug],
  )

  return rows[0] ?? null
}
