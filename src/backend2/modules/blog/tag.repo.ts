import { getDb } from '../../db/client'
import type { BlogTagRef, Language, PublicBlogTag } from '../../contracts/blog.contract'

/**
 * Every statement about tags. A tag is shared by every article that carries
 * it, so renaming one renames it everywhere at once — that is what a tag is.
 * Which tags an article carries, on the other hand, belongs to each version,
 * and waits for **Publish update** like everything else a visitor sees.
 */

export type TagRow = {
  id: string
  slug: string
  names: Partial<Record<Language, string>> | null
  article_count: number
  live_count: number
  created_at: Date
  updated_at: Date
}

const NAMES = `(SELECT jsonb_object_agg(n.language, n.name) FROM v2_blog_tag_names n WHERE n.tag_id = t.id)`

/** Articles carrying the tag in any version: the draft, a schedule, or live. */
const ARTICLE_COUNT = `(SELECT count(DISTINCT v.post_id)::int
    FROM v2_blog_post_tags pt JOIN v2_blog_post_versions v ON v.id = pt.version_id
   WHERE pt.tag_id = t.id)`

/** Articles a visitor can currently find under the tag. */
const LIVE_COUNT = `(SELECT count(*)::int
    FROM v2_blog_post_tags pt JOIN v2_blog_posts p ON p.published_version_id = pt.version_id
   WHERE pt.tag_id = t.id)`

const SELECT = `SELECT t.id, t.slug, t.created_at, t.updated_at,
       ${NAMES} AS names, ${ARTICLE_COUNT} AS article_count, ${LIVE_COUNT} AS live_count
  FROM v2_blog_tags t`

/** `%` and `_` typed by the owner are letters to find, not wildcards. */
const likeTerm = (search: string): string =>
  `%${search.toLowerCase().replace(/[\\%_]/g, (character) => `\\${character}`)}%`

/**
 * One page of tags, alphabetical by their English name — the Dashboard is
 * English — with the id breaking ties so a page boundary never repeats one.
 */
export const listTags = async (input: {
  search: string
  limit: number
  offset: number
}): Promise<{ rows: TagRow[]; total: number }> => {
  const db = getDb()
  const values: unknown[] = []
  let where = ''

  if (input.search !== '') {
    values.push(likeTerm(input.search))
    where = `WHERE LOWER(t.slug) LIKE $1 ESCAPE '\\'
      OR EXISTS (SELECT 1 FROM v2_blog_tag_names n
                  WHERE n.tag_id = t.id AND LOWER(n.name) LIKE $1 ESCAPE '\\')`
  }

  const { rows: counted } = await db.query<{ total: string }>(
    `SELECT count(*)::text AS total FROM v2_blog_tags t ${where}`,
    values,
  )

  const { rows } = await db.query<TagRow>(
    `${SELECT} ${where}
     ORDER BY lower(COALESCE((SELECT n.name FROM v2_blog_tag_names n
                               WHERE n.tag_id = t.id AND n.language = 'en'), t.slug)), t.id
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, input.limit, input.offset],
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

export const findTag = async (id: string): Promise<TagRow | null> => {
  const { rows } = await getDb().query<TagRow>(`${SELECT} WHERE t.id = $1`, [id])

  return rows[0] ?? null
}

export const findTagIdBySlug = async (slug: string): Promise<string | null> => {
  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_blog_tags WHERE slug = $1',
    [slug],
  )

  return rows[0]?.id ?? null
}

/** Does another tag already use this name in this language? Case does not matter. */
export const nameTakenBy = async (input: {
  language: Language
  name: string
  excludeId: string | null
}): Promise<boolean> => {
  const { rows } = await getDb().query<{ taken: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM v2_blog_tag_names
        WHERE language = $1 AND lower(name) = lower($2)
          AND ($3::uuid IS NULL OR tag_id <> $3::uuid)
     ) AS taken`,
    [input.language, input.name, input.excludeId],
  )

  return rows[0]?.taken === true
}

export const insertTag = async (input: {
  slug: string
  names: Record<Language, string>
}): Promise<string> => {
  const db = getDb()

  const { rows } = await db.query<{ id: string }>(
    'INSERT INTO v2_blog_tags (slug) VALUES ($1) RETURNING id',
    [input.slug],
  )
  const id = rows[0]!.id

  await writeNames(id, input.names)

  return id
}

export const updateTag = async (input: {
  id: string
  slug: string
  names: Record<Language, string>
}): Promise<void> => {
  await getDb().query(
    'UPDATE v2_blog_tags SET slug = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [input.id, input.slug],
  )

  await writeNames(input.id, input.names)
}

const writeNames = async (tagId: string, names: Record<Language, string>): Promise<void> => {
  const db = getDb()

  for (const language of ['de', 'en', 'ar'] as const) {
    await db.query(
      `INSERT INTO v2_blog_tag_names (tag_id, language, name) VALUES ($1, $2, $3)
       ON CONFLICT (tag_id, language) DO UPDATE SET name = EXCLUDED.name`,
      [tagId, language, names[language]],
    )
  }
}

export const deleteTag = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_blog_tags WHERE id = $1', [id])
}

/**
 * The articles that still carry a tag, for the refusal that names them. A
 * few are enough to act on; the count says how many there are in all.
 */
export const tagUsers = async (
  tagId: string,
  limit: number,
): Promise<{ total: number; posts: Array<{ id: string; draft_version_id: string | null }> }> => {
  const db = getDb()

  const { rows: counted } = await db.query<{ total: number }>(
    `SELECT count(DISTINCT v.post_id)::int AS total
       FROM v2_blog_post_tags pt JOIN v2_blog_post_versions v ON v.id = pt.version_id
      WHERE pt.tag_id = $1`,
    [tagId],
  )

  const { rows } = await db.query<{ id: string; draft_version_id: string | null }>(
    `SELECT p.id, p.draft_version_id FROM v2_blog_posts p
      WHERE EXISTS (
        SELECT 1 FROM v2_blog_post_tags pt JOIN v2_blog_post_versions v ON v.id = pt.version_id
         WHERE pt.tag_id = $1 AND v.post_id = p.id
      )
      ORDER BY p.updated_at DESC, p.id
      LIMIT $2`,
    [tagId, limit],
  )

  return { total: counted[0]?.total ?? 0, posts: rows }
}

/** Which of these ids are tags. */
export const findKnownTags = async (ids: string[]): Promise<Set<string>> => {
  if (ids.length === 0) return new Set()

  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_blog_tags WHERE id = ANY($1::uuid[])',
    [ids],
  )

  return new Set(rows.map((row) => row.id))
}

/** The named tags for the editor, keyed by id. */
export const loadTagRefs = async (ids: string[]): Promise<Map<string, BlogTagRef>> => {
  const refs = new Map<string, BlogTagRef>()

  if (ids.length === 0) return refs

  const { rows } = await getDb().query<{
    id: string
    slug: string
    names: Partial<Record<Language, string>> | null
  }>(`SELECT t.id, t.slug, ${NAMES} AS names FROM v2_blog_tags t WHERE t.id = ANY($1::uuid[])`, [
    ids,
  ])

  for (const row of rows) {
    refs.set(row.id, {
      id: row.id,
      slug: row.slug,
      names: { de: '', en: '', ar: '', ...(row.names ?? {}) },
    })
  }

  return refs
}

/** Tag ids per version, in each version's order, for a page of versions. */
export const loadVersionTagIds = async (versionIds: string[]): Promise<Map<string, string[]>> => {
  const result = new Map<string, string[]>()

  if (versionIds.length === 0) return result

  const { rows } = await getDb().query<{ version_id: string; tag_id: string }>(
    `SELECT version_id, tag_id FROM v2_blog_post_tags
      WHERE version_id = ANY($1::uuid[])
      ORDER BY version_id, position, tag_id`,
    [versionIds],
  )

  for (const row of rows) {
    result.set(row.version_id, [...(result.get(row.version_id) ?? []), row.tag_id])
  }

  return result
}

/** Each version's tags in one language, as a visitor receives them. */
export const loadPublicTags = async (
  versionIds: string[],
  language: Language,
): Promise<Map<string, PublicBlogTag[]>> => {
  const result = new Map<string, PublicBlogTag[]>()

  if (versionIds.length === 0) return result

  const { rows } = await getDb().query<{ version_id: string; slug: string; name: string }>(
    `SELECT pt.version_id, t.slug, n.name
       FROM v2_blog_post_tags pt
       JOIN v2_blog_tags t ON t.id = pt.tag_id
       JOIN v2_blog_tag_names n ON n.tag_id = t.id AND n.language = $2
      WHERE pt.version_id = ANY($1::uuid[])
      ORDER BY pt.version_id, pt.position, t.slug`,
    [versionIds, language],
  )

  for (const row of rows) {
    result.set(row.version_id, [
      ...(result.get(row.version_id) ?? []),
      { slug: row.slug, name: row.name },
    ])
  }

  return result
}

/**
 * The filter chips: every tag at least one live article carries, in this
 * language, alphabetically. A tag only a draft uses is not offered — a chip
 * that filters down to nothing is the thin page the specification rules out.
 */
export const listPublicTags = async (
  language: Language,
  limit: number,
): Promise<PublicBlogTag[]> => {
  const { rows } = await getDb().query<PublicBlogTag>(
    `SELECT t.slug, n.name
       FROM v2_blog_tags t
       JOIN v2_blog_tag_names n ON n.tag_id = t.id AND n.language = $1
      WHERE EXISTS (
        SELECT 1 FROM v2_blog_post_tags pt
          JOIN v2_blog_posts p ON p.published_version_id = pt.version_id
         WHERE pt.tag_id = t.id
      )
      ORDER BY lower(n.name), t.slug
      LIMIT $2`,
    [language, limit],
  )

  return rows
}
