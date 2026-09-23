import { getDb } from '../../db/client'
import {
  type BlogDoc,
  type BlogDraftInput,
  type BlogListQuery,
  type BlogTexts,
  LANGUAGES,
  type Language,
  emptyBlogDoc,
  emptyBlogTexts,
  isBlogBodyEmpty,
  readingMinutesOf,
} from '../../contracts/blog.contract'

/**
 * Every statement the Blog runs against articles. No business rule lives here
 * and no HTTP concept reaches it — the service decides what should happen,
 * this decides how it is written down, against the shape `0006_blog.sql`
 * installed.
 *
 * Queries run one after another, never `Promise.all`: a Cloudflare Worker may
 * hold six sockets at once, and the local development database answers one
 * connection at a time (`docs/v2/auth.md`).
 */

export type PostRow = {
  id: string
  slug: string | null
  draft_version_id: string | null
  scheduled_version_id: string | null
  published_version_id: string | null
  draft_revision: number
  scheduled_draft_revision: number | null
  published_draft_revision: number | null
  scheduled_for: Date | null
  first_published_at: Date | null
  published_at: Date | null
  content_updated_at: Date | null
  published_substance: string | null
  last_scheduled_for: Date | null
  last_schedule_ran_at: Date | null
  comments_enabled: boolean
  read_count: number
  like_count: number
  created_at: Date
  updated_at: Date
}

export type VersionKind = 'draft' | 'scheduled' | 'published'

type VersionRow = {
  id: string
  post_id: string
  kind: VersionKind
  slug: string
  cover_asset_id: string | null
  project_id: string | null
}

type TextRow = {
  version_id: string
  language: Language
  title: string
  summary: string
  body: BlogDoc | null
  body_empty: boolean
  reading_minutes: number
  cover_alt: string
  seo_title: string
  seo_description: string
}

const TEXT_COLUMNS =
  'version_id, language, title, summary, body, body_empty, reading_minutes, cover_alt, seo_title, seo_description'

/** One version as the service works with it: the draft shape, plus what is derived. */
export type StoredVersion = {
  id: string
  kind: VersionKind
  draft: BlogDraftInput
  readingMinutes: Record<Language, number>
}

const toTexts = (row: TextRow | undefined): BlogTexts =>
  row
    ? {
        title: row.title,
        summary: row.summary,
        body: row.body ?? emptyBlogDoc(),
        seoTitle: row.seo_title,
        seoDescription: row.seo_description,
      }
    : emptyBlogTexts()

/* --------------------------------------------------------------- one article */

export const findPost = async (id: string): Promise<PostRow | null> => {
  const { rows } = await getDb().query<PostRow>('SELECT * FROM v2_blog_posts WHERE id = $1', [id])

  return rows[0] ?? null
}

/**
 * The same row, locked until the transaction ends.
 *
 * Publishing reads the draft, checks it and then writes a new live version;
 * a due schedule does the same from another request. Without the lock two of
 * them could both pass the checks, and the loser would already have deleted
 * the version that was live.
 */
export const lockPost = async (id: string): Promise<PostRow | null> => {
  const { rows } = await getDb().query<PostRow>(
    'SELECT * FROM v2_blog_posts WHERE id = $1 FOR UPDATE',
    [id],
  )

  return rows[0] ?? null
}

/** One version, texts and tags included, or null if the row is gone. */
export const loadVersion = async (versionId: string): Promise<StoredVersion | null> => {
  const db = getDb()

  const { rows: versions } = await db.query<VersionRow>(
    'SELECT * FROM v2_blog_post_versions WHERE id = $1',
    [versionId],
  )
  const version = versions[0]

  if (!version) return null

  const { rows: texts } = await db.query<TextRow>(
    `SELECT ${TEXT_COLUMNS} FROM v2_blog_post_texts WHERE version_id = $1`,
    [versionId],
  )

  const { rows: tags } = await db.query<{ tag_id: string }>(
    'SELECT tag_id FROM v2_blog_post_tags WHERE version_id = $1 ORDER BY position, tag_id',
    [versionId],
  )

  const byLanguage = new Map(texts.map((row) => [row.language, row]))

  const cover = version.cover_asset_id
    ? {
        mediaId: version.cover_asset_id,
        alt: {
          de: byLanguage.get('de')?.cover_alt ?? '',
          en: byLanguage.get('en')?.cover_alt ?? '',
          ar: byLanguage.get('ar')?.cover_alt ?? '',
        },
      }
    : null

  return {
    id: version.id,
    kind: version.kind,
    draft: {
      slug: version.slug,
      cover,
      projectId: version.project_id,
      tagIds: tags.map((row) => row.tag_id),
      texts: {
        de: toTexts(byLanguage.get('de')),
        en: toTexts(byLanguage.get('en')),
        ar: toTexts(byLanguage.get('ar')),
      },
    },
    readingMinutes: {
      de: byLanguage.get('de')?.reading_minutes ?? 1,
      en: byLanguage.get('en')?.reading_minutes ?? 1,
      ar: byLanguage.get('ar')?.reading_minutes ?? 1,
    },
  }
}

/* ------------------------------------------------------------------ creation */

/**
 * An article and its draft, in one transaction. The two tables point at each
 * other; both keys are deferrable, so the article row is written before the
 * version it names.
 */
export const insertPost = async (input: {
  title: string
  language: Language
  slug: string
}): Promise<string> => {
  const db = getDb()

  await db.query('SET CONSTRAINTS ALL DEFERRED')

  const { rows: created } = await db.query<{ id: string }>(
    'INSERT INTO v2_blog_posts DEFAULT VALUES RETURNING id',
  )
  const postId = created[0]!.id

  const { rows: version } = await db.query<{ id: string }>(
    `INSERT INTO v2_blog_post_versions (post_id, kind, slug)
          VALUES ($1, 'draft', $2) RETURNING id`,
    [postId, input.slug],
  )
  const versionId = version[0]!.id

  // Three rows always, so the editor never meets a missing language. The
  // title goes only where it was written: a draft may be in one language.
  for (const language of LANGUAGES) {
    await db.query(
      'INSERT INTO v2_blog_post_texts (version_id, language, title) VALUES ($1, $2, $3)',
      [versionId, language, language === input.language ? input.title : ''],
    )
  }

  await db.query('UPDATE v2_blog_posts SET draft_version_id = $1 WHERE id = $2', [
    versionId,
    postId,
  ])

  return postId
}

/* ------------------------------------------------------------------- writing */

/**
 * A version's whole content, replaced. The texts are upserted so the three
 * rows are never absent, even for a moment inside the transaction; the tags
 * are rewritten in the order they were given.
 *
 * The body's derived facts — empty or not, minutes to read — are computed
 * here, from the document being written, so they cannot drift from it.
 */
export const writeVersion = async (versionId: string, draft: BlogDraftInput): Promise<void> => {
  const db = getDb()

  await db.query(
    `UPDATE v2_blog_post_versions
        SET slug = $2, cover_asset_id = $3, project_id = $4
      WHERE id = $1`,
    [versionId, draft.slug, draft.cover?.mediaId ?? null, draft.projectId],
  )

  for (const language of LANGUAGES) {
    const texts = draft.texts[language]

    await db.query(
      `INSERT INTO v2_blog_post_texts
              (version_id, language, title, summary, body, body_empty, reading_minutes,
               cover_alt, seo_title, seo_description)
            VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10)
       ON CONFLICT (version_id, language) DO UPDATE
            SET title = EXCLUDED.title,
                summary = EXCLUDED.summary,
                body = EXCLUDED.body,
                body_empty = EXCLUDED.body_empty,
                reading_minutes = EXCLUDED.reading_minutes,
                cover_alt = EXCLUDED.cover_alt,
                seo_title = EXCLUDED.seo_title,
                seo_description = EXCLUDED.seo_description`,
      [
        versionId,
        language,
        texts.title,
        texts.summary,
        JSON.stringify(texts.body),
        isBlogBodyEmpty(texts.body),
        readingMinutesOf(texts.body),
        draft.cover?.alt[language] ?? '',
        texts.seoTitle,
        texts.seoDescription,
      ],
    )
  }

  await db.query('DELETE FROM v2_blog_post_tags WHERE version_id = $1', [versionId])

  for (const [index, tagId] of draft.tagIds.entries()) {
    await db.query(
      'INSERT INTO v2_blog_post_tags (version_id, tag_id, position) VALUES ($1, $2, $3)',
      [versionId, tagId, index],
    )
  }
}

/**
 * A version, copied into a new one of another kind.
 *
 * A copy rather than a pointer swap: a frozen schedule and a live snapshot
 * keep saying what they said when the owner pressed the button, whatever the
 * draft does next.
 */
export const copyVersion = async (input: {
  postId: string
  fromVersionId: string
  kind: VersionKind
}): Promise<string> => {
  const db = getDb()

  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO v2_blog_post_versions (post_id, kind, slug, cover_asset_id, project_id)
     SELECT $2, $3, slug, cover_asset_id, project_id
       FROM v2_blog_post_versions WHERE id = $1
     RETURNING id`,
    [input.fromVersionId, input.postId, input.kind],
  )
  const versionId = rows[0]!.id

  await copyChildren({ fromVersionId: input.fromVersionId, toVersionId: versionId })

  return versionId
}

/** The draft's content replaced by another version's (`discard-pending`). */
export const overwriteVersion = async (input: {
  fromVersionId: string
  toVersionId: string
}): Promise<void> => {
  const db = getDb()

  await db.query('DELETE FROM v2_blog_post_texts WHERE version_id = $1', [input.toVersionId])
  await db.query('DELETE FROM v2_blog_post_tags WHERE version_id = $1', [input.toVersionId])

  await db.query(
    `UPDATE v2_blog_post_versions AS target
        SET slug = source.slug, cover_asset_id = source.cover_asset_id,
            project_id = source.project_id
       FROM v2_blog_post_versions AS source
      WHERE target.id = $2 AND source.id = $1`,
    [input.fromVersionId, input.toVersionId],
  )

  await copyChildren(input)
}

const copyChildren = async (input: { fromVersionId: string; toVersionId: string }) => {
  const db = getDb()

  await db.query(
    `INSERT INTO v2_blog_post_texts
            (version_id, language, title, summary, body, body_empty, reading_minutes,
             cover_alt, seo_title, seo_description)
     SELECT $2, language, title, summary, body, body_empty, reading_minutes,
            cover_alt, seo_title, seo_description
       FROM v2_blog_post_texts WHERE version_id = $1`,
    [input.fromVersionId, input.toVersionId],
  )

  await db.query(
    `INSERT INTO v2_blog_post_tags (version_id, tag_id, position)
     SELECT $2, tag_id, position FROM v2_blog_post_tags WHERE version_id = $1`,
    [input.fromVersionId, input.toVersionId],
  )
}

export const deleteVersion = async (versionId: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_blog_post_versions WHERE id = $1', [versionId])
}

/** A scheduled snapshot becoming the live one, without a copy: it is already frozen. */
export const promoteVersion = async (versionId: string): Promise<void> => {
  await getDb().query(`UPDATE v2_blog_post_versions SET kind = 'published' WHERE id = $1`, [
    versionId,
  ])
}

export const bumpRevision = async (postId: string): Promise<number> => {
  const { rows } = await getDb().query<{ draft_revision: number }>(
    `UPDATE v2_blog_posts
        SET draft_revision = draft_revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING draft_revision`,
    [postId],
  )

  return rows[0]!.draft_revision
}

/**
 * Records that the draft at `revision` is exactly what is live, or exactly
 * what is scheduled. Either comparison is then one integer in a list.
 */
export const markDraftMatches = async (input: {
  postId: string
  revision: number
  published?: boolean
  scheduled?: boolean
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_blog_posts
        SET published_draft_revision = CASE WHEN $3::boolean THEN $2 ELSE published_draft_revision END,
            scheduled_draft_revision = CASE WHEN $4::boolean THEN $2 ELSE scheduled_draft_revision END
      WHERE id = $1`,
    [input.postId, input.revision, input.published ?? false, input.scheduled ?? false],
  )
}

export const touch = async (postId: string): Promise<void> => {
  await getDb().query('UPDATE v2_blog_posts SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [
    postId,
  ])
}

/* ---------------------------------------------------------- the address */

/** Which article holds this public address, if any. */
export const findSlugOwner = async (slug: string): Promise<string | null> => {
  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_blog_posts WHERE slug = $1',
    [slug],
  )

  return rows[0]?.id ?? null
}

/**
 * Fixes `slug` as this article's public address.
 *
 * Never replaces an address the article already holds: that one is fixed.
 * The caller checks the address is free first; if another article takes it
 * in the same instant, the unique index refuses the write, the transaction
 * rolls back whole, and the owner is told the address is taken — two articles
 * never share one URL.
 */
export const claimSlug = async (input: { postId: string; slug: string }): Promise<boolean> => {
  const { rows } = await getDb().query<{ id: string }>(
    `UPDATE v2_blog_posts SET slug = $2
      WHERE id = $1 AND (slug IS NULL OR slug = $2)
      RETURNING id`,
    [input.postId, input.slug],
  )

  return rows.length === 1
}

/**
 * Gives the address back. Only for an article that was never published: a
 * cancelled schedule of something no visitor has ever seen leaves nothing to
 * redirect.
 */
export const releaseSlug = async (postId: string): Promise<void> => {
  await getDb().query(
    'UPDATE v2_blog_posts SET slug = NULL WHERE id = $1 AND first_published_at IS NULL',
    [postId],
  )
}

/* ---------------------------------------------------------- the snapshots */

export const setSchedule = async (input: {
  postId: string
  versionId: string
  at: Date
  draftRevision: number
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_blog_posts
        SET scheduled_version_id = $2, scheduled_for = $3, scheduled_draft_revision = $4,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [input.postId, input.versionId, input.at, input.draftRevision],
  )
}

export const moveSchedule = async (input: { postId: string; at: Date }): Promise<void> => {
  await getDb().query(
    `UPDATE v2_blog_posts SET scheduled_for = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND scheduled_version_id IS NOT NULL`,
    [input.postId, input.at],
  )
}

export const clearSchedule = async (postId: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_blog_posts
        SET scheduled_version_id = NULL, scheduled_for = NULL, scheduled_draft_revision = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [postId],
  )
}

/**
 * The article goes live with `versionId`.
 *
 * `first_published_at` is written only the first time — an update, and a
 * republication after a take down, keep the date readers already know.
 * `content_updated_at` moves only when the caller says the substance changed.
 */
export const setPublished = async (input: {
  postId: string
  versionId: string
  draftRevision: number
  substance: string
  contentUpdated: boolean
  schedule?: { scheduledFor: Date }
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_blog_posts
        SET published_version_id = $2,
            published_draft_revision = $3,
            published_substance = $4,
            published_at = CURRENT_TIMESTAMP,
            first_published_at = COALESCE(first_published_at, CURRENT_TIMESTAMP),
            content_updated_at = CASE WHEN $5::boolean THEN CURRENT_TIMESTAMP ELSE content_updated_at END,
            last_scheduled_for = CASE WHEN $6::timestamptz IS NULL THEN last_scheduled_for ELSE $6 END,
            last_schedule_ran_at = CASE
              WHEN $6::timestamptz IS NULL THEN last_schedule_ran_at ELSE CURRENT_TIMESTAMP END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [
      input.postId,
      input.versionId,
      input.draftRevision,
      input.substance,
      input.contentUpdated,
      input.schedule?.scheduledFor ?? null,
    ],
  )
}

/**
 * Taken down. The substance of what was live is kept, so a later
 * republication can tell whether it says anything new.
 */
export const clearPublished = async (postId: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_blog_posts
        SET published_version_id = NULL, published_draft_revision = NULL, published_at = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [postId],
  )
}

export const setCommentsEnabled = async (postId: string, enabled: boolean): Promise<void> => {
  await getDb().query(
    `UPDATE v2_blog_posts SET comments_enabled = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [postId, enabled],
  )
}

export const deletePost = async (postId: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_blog_posts WHERE id = $1', [postId])
}

/* --------------------------------------------------------------- schedules */

/**
 * Is any schedule due? One index lookup, asked before every public read, so
 * the question costs almost nothing when the answer is no — which is nearly
 * always.
 */
export const anyDue = async (now: Date): Promise<boolean> => {
  const { rows } = await getDb().query<{ due: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM v2_blog_posts
        WHERE scheduled_version_id IS NOT NULL AND scheduled_for <= $1
     ) AS due`,
    [now],
  )

  return rows[0]?.due === true
}

/**
 * The due articles, locked, oldest schedule first.
 *
 * `SKIP LOCKED`: two requests arriving together each take what the other has
 * not, rather than the second waiting to find nothing left. Combined with the
 * state check inside the lock, a schedule runs exactly once however many
 * requests notice it.
 */
export const lockDue = async (now: Date, limit: number): Promise<PostRow[]> => {
  const { rows } = await getDb().query<PostRow>(
    `SELECT * FROM v2_blog_posts
      WHERE scheduled_version_id IS NOT NULL AND scheduled_for <= $1
      ORDER BY scheduled_for, id
      LIMIT $2
      FOR UPDATE SKIP LOCKED`,
    [now, limit],
  )

  return rows
}

/* ------------------------------------------------------------------- checks */

/** The library files that exist, with their kind — a cover must be an image. */
export const findAssets = async (
  ids: string[],
): Promise<Map<string, { kind: string; width: number | null; height: number | null }>> => {
  const found = new Map<string, { kind: string; width: number | null; height: number | null }>()

  if (ids.length === 0) return found

  const { rows } = await getDb().query<{
    id: string
    kind: string
    width: number | null
    height: number | null
  }>('SELECT id, kind, width, height FROM v2_media_assets WHERE id = ANY($1::uuid[])', [ids])

  for (const row of rows) found.set(row.id, { kind: row.kind, width: row.width, height: row.height })

  return found
}

export const findProjectRef = async (
  projectId: string,
): Promise<{ id: string; names: Record<string, string> | null; live: boolean } | null> => {
  const { rows } = await getDb().query<{
    id: string
    names: Record<string, string> | null
    live: boolean
  }>(
    `SELECT p.id,
            (SELECT jsonb_object_agg(t.language, t.name)
               FROM v2_project_texts t WHERE t.version_id = p.draft_version_id) AS names,
            (p.lifecycle = 'active' AND p.published_version_id IS NOT NULL) AS live
       FROM v2_projects p WHERE p.id = $1`,
    [projectId],
  )

  return rows[0] ?? null
}

/**
 * The linked project as a visitor may see it: only while the project is live
 * itself, under its current address and its published name. A draft, archived
 * or deleted project is simply not linked.
 */
export const findLiveProject = async (
  projectId: string,
  language: Language,
): Promise<{ slug: string; name: string } | null> => {
  const { rows } = await getDb().query<{ slug: string; name: string | null }>(
    `SELECT s.slug, t.name
       FROM v2_projects p
       JOIN v2_project_versions pv ON pv.id = p.published_version_id
       JOIN v2_project_slugs s ON s.project_id = p.id AND s.is_current
       LEFT JOIN v2_project_texts t ON t.version_id = pv.id AND t.language = $2
      WHERE p.id = $1 AND p.lifecycle = 'active'`,
    [projectId, language],
  )

  const row = rows[0]

  return row ? { slug: row.slug, name: row.name ?? row.slug } : null
}

/* ------------------------------------------------------------------- listing */

export type ListRow = PostRow & {
  draft_slug: string
  cover_asset_id: string | null
}

/** `%` and `_` typed by the owner are letters to find, not wildcards. */
const likeTerm = (search: string): string =>
  `%${search.toLowerCase().replace(/[\\%_]/g, (character) => `\\${character}`)}%`

const ORDER_BY: Record<BlogListQuery['sort'], string> = {
  updated: 'p.updated_at DESC, p.id DESC',
  created: 'p.created_at DESC, p.id DESC',
  // Never-published articles after the published ones, most recent first.
  published: 'p.first_published_at DESC NULLS LAST, p.created_at DESC, p.id DESC',
}

/** The Dashboard list: one bounded page, filtered and searched on the server. */
export const listPosts = async (
  query: BlogListQuery,
): Promise<{ rows: ListRow[]; total: number }> => {
  const conditions: string[] = []
  const values: unknown[] = []
  const bind = (value: unknown): string => `$${values.push(value)}`

  if (query.state === 'draft') {
    conditions.push(
      'p.published_version_id IS NULL AND p.scheduled_version_id IS NULL AND p.first_published_at IS NULL',
    )
  } else if (query.state === 'scheduled') {
    conditions.push('p.scheduled_version_id IS NOT NULL')
  } else if (query.state === 'unpublished') {
    conditions.push(
      'p.published_version_id IS NULL AND p.scheduled_version_id IS NULL AND p.first_published_at IS NOT NULL',
    )
  } else if (query.state === 'published') {
    conditions.push(
      'p.published_version_id IS NOT NULL AND p.draft_revision IS NOT DISTINCT FROM p.published_draft_revision',
    )
  } else if (query.state === 'pending' || query.state === 'published_with_pending_changes') {
    conditions.push(
      'p.published_version_id IS NOT NULL AND p.draft_revision IS DISTINCT FROM p.published_draft_revision',
    )
  }

  if (query.tag !== 'all') {
    conditions.push(
      `EXISTS (SELECT 1 FROM v2_blog_post_tags pt WHERE pt.version_id = d.id AND pt.tag_id = ${bind(query.tag)})`,
    )
  }

  if (query.search !== '') {
    // Across the address and every language, not only the one the row shows.
    const term = bind(likeTerm(query.search))

    conditions.push(`(
      LOWER(d.slug) LIKE ${term} ESCAPE '\\'
      OR EXISTS (
        SELECT 1 FROM v2_blog_post_texts t
         WHERE t.version_id = d.id
           AND (LOWER(t.title) LIKE ${term} ESCAPE '\\' OR LOWER(t.summary) LIKE ${term} ESCAPE '\\')
      )
    )`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const from = `
    FROM v2_blog_posts p
    JOIN v2_blog_post_versions d ON d.id = p.draft_version_id
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
    `SELECT p.*, d.slug AS draft_slug, d.cover_asset_id
     ${from}
     ORDER BY ${ORDER_BY[query.sort]}
     LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

/** The list's words for a page of versions, in one query and without the bodies. */
export const loadListTexts = async (
  versionIds: string[],
): Promise<Map<string, Record<Language, { title: string; summary: string; bodyEmpty: boolean }>>> => {
  const result = new Map<
    string,
    Record<Language, { title: string; summary: string; bodyEmpty: boolean }>
  >()

  if (versionIds.length === 0) return result

  const { rows } = await getDb().query<{
    version_id: string
    language: Language
    title: string
    summary: string
    body_empty: boolean
  }>(
    `SELECT version_id, language, title, summary, body_empty FROM v2_blog_post_texts
      WHERE version_id = ANY($1::uuid[])`,
    [versionIds],
  )

  for (const row of rows) {
    const entry = result.get(row.version_id) ?? {
      de: { title: '', summary: '', bodyEmpty: true },
      en: { title: '', summary: '', bodyEmpty: true },
      ar: { title: '', summary: '', bodyEmpty: true },
    }

    entry[row.language] = { title: row.title, summary: row.summary, bodyEmpty: row.body_empty }
    result.set(row.version_id, entry)
  }

  return result
}

/* -------------------------------------------------------------------- public */

export type PublishedRow = PostRow & {
  version_id: string
  cover_asset_id: string | null
  project_id: string | null
}

const PUBLISHED_FROM = `
    FROM v2_blog_posts p
    JOIN v2_blog_post_versions pv ON pv.id = p.published_version_id
   WHERE p.published_version_id IS NOT NULL
`

/**
 * One batch of live articles, newest first by their original date, and how
 * many there are.
 *
 * `LIMIT`/`OFFSET` in SQL rather than a full read sliced by the caller: the
 * public site must never be able to ask for the whole blog at once. The tag
 * filter reads the live snapshot's tags — a tag added in a draft does not
 * move an article into a filter before **Publish update**.
 */
export const listPublished = async (input: {
  offset: number
  limit: number
  tagSlug: string
}): Promise<{ rows: PublishedRow[]; total: number }> => {
  const db = getDb()
  const values: unknown[] = []
  let tagFilter = ''

  if (input.tagSlug !== '') {
    values.push(input.tagSlug)
    tagFilter = `AND EXISTS (
      SELECT 1 FROM v2_blog_post_tags pt
        JOIN v2_blog_tags tg ON tg.id = pt.tag_id
       WHERE pt.version_id = pv.id AND tg.slug = $1
    )`
  }

  const { rows: counted } = await db.query<{ total: string }>(
    `SELECT count(*)::text AS total ${PUBLISHED_FROM} ${tagFilter}`,
    values,
  )

  const { rows } = await db.query<PublishedRow>(
    `SELECT p.*, pv.id AS version_id, pv.cover_asset_id, pv.project_id
     ${PUBLISHED_FROM} ${tagFilter}
     ORDER BY p.first_published_at DESC, p.id DESC
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, input.limit, input.offset],
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

/**
 * One live article by its address. A draft, a scheduled article, one that was
 * taken down and one that was deleted all match nothing here — the same
 * answer as an address that never existed.
 */
export const findPublishedBySlug = async (slug: string): Promise<PublishedRow | null> => {
  const { rows } = await getDb().query<PublishedRow>(
    `SELECT p.*, pv.id AS version_id, pv.cover_asset_id, pv.project_id
     ${PUBLISHED_FROM} AND p.slug = $1`,
    [slug],
  )

  return rows[0] ?? null
}

/** One language of one version, as a visitor's answer is built from it. */
export type LanguageTexts = {
  title: string
  summary: string
  body: BlogDoc
  readingMinutes: number
  coverAlt: string
  seoTitle: string
  seoDescription: string
}

/** One language's texts for a batch of versions — all a visitor is sent. */
export const loadTextsIn = async (
  versionIds: string[],
  language: Language,
  options: { withBody: boolean },
): Promise<Map<string, LanguageTexts>> => {
  const result = new Map<string, LanguageTexts>()

  if (versionIds.length === 0) return result

  // A list of cards has no use for the bodies, which are by far the largest
  // thing in the table.
  const body = options.withBody ? 'body' : `'{"type":"doc","content":[]}'::jsonb AS body`

  const { rows } = await getDb().query<TextRow>(
    `SELECT version_id, language, title, summary, ${body}, body_empty, reading_minutes,
            cover_alt, seo_title, seo_description
       FROM v2_blog_post_texts
      WHERE version_id = ANY($1::uuid[]) AND language = $2`,
    [versionIds, language],
  )

  for (const row of rows) {
    result.set(row.version_id, {
      title: row.title,
      summary: row.summary,
      body: row.body ?? emptyBlogDoc(),
      readingMinutes: row.reading_minutes,
      coverAlt: row.cover_alt,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
    })
  }

  return result
}

/* --------------------------------------------------------------- counters */

/**
 * One more read, on a live article only.
 *
 * Publication is in the predicate rather than checked first: a separate check
 * would leave a window in which a draft nobody can read could be counted.
 * Neither counter touches `updated_at` — a visitor reading is not the owner
 * editing.
 */
export const countRead = async (
  slug: string,
): Promise<{ read_count: number; like_count: number } | null> => {
  const { rows } = await getDb().query<{ read_count: number; like_count: number }>(
    `UPDATE v2_blog_posts SET read_count = read_count + 1
      WHERE slug = $1 AND published_version_id IS NOT NULL
      RETURNING read_count, like_count`,
    [slug],
  )

  return rows[0] ?? null
}

/**
 * A like, or a like taken back.
 *
 * `GREATEST(..., 0)`: only the reader's own browser remembers whether they had
 * liked the article, and a cleared storage or a second tab can send an unlike
 * that was never a like. The floor keeps that from walking the figure below
 * zero, where the table's own check would turn a shrug into an error.
 */
export const changeLikes = async (
  slug: string,
  liked: boolean,
): Promise<{ read_count: number; like_count: number } | null> => {
  const { rows } = await getDb().query<{ read_count: number; like_count: number }>(
    `UPDATE v2_blog_posts
        SET like_count = CASE WHEN $2::boolean THEN like_count + 1 ELSE GREATEST(like_count - 1, 0) END
      WHERE slug = $1 AND published_version_id IS NOT NULL
      RETURNING read_count, like_count`,
    [slug, liked],
  )

  return rows[0] ?? null
}
