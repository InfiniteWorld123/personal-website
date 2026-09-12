import { getDb, withTransaction } from '#/backend/db/client'
import { conflictError, notFoundError, validationError } from '#/backend/shared/error'
import type {
  AdminPostDetail,
  AdminPostList,
  AdminPostListItem,
  AdminTag,
  PostProjectOption,
  PublicPost,
  PublicPostSummary,
  PublicTag,
} from '#/shared/types/post.types'
import {
  POST_LANGUAGES,
  POST_PAGE_SIZE,
  type PostFilterInput,
  type PostLanguage,
  type PostWriteInput,
  type TagWriteInput,
  missingPublishRequirements,
} from '#/shared/validation/post.validation'
import { type RichTextDoc, emptyRichTextDoc, readingMinutes } from '#/shared/validation/rich-text'

/** Postgres' unique-violation code. A taken slug is a conflict, not a 500. */
const UNIQUE_VIOLATION = '23505'

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION

/** Prefer English, then German, then Arabic for the one title the admin lists. */
const TITLE_LANGUAGE_ORDER = `CASE pt.language WHEN 'en' THEN 1 WHEN 'de' THEN 2 ELSE 3 END`

/** The date the reader sees. Rendered in UTC so it does not drift by server. */
const PUBLISHED_ON = `to_char(p.published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')`

/**
 * The admin form sends a day, the column stores an instant. Midnight UTC is
 * the one reading of "12 September" that is the same everywhere.
 */
const toInstant = (day: string): Date => new Date(`${day}T00:00:00.000Z`)

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */

export const listTags = async (): Promise<AdminTag[]> => {
  const result = await getDb().query<{
    id: string
    slug: string
    names: Array<{ language: PostLanguage; name: string }> | null
    post_count: string
  }>(
    `SELECT
        t.id,
        t.slug,
        (
          SELECT json_agg(json_build_object('language', tt.language, 'name', tt.name))
            FROM tag_translations tt WHERE tt.tag_id = t.id
        ) AS names,
        (SELECT count(*) FROM post_tags pt WHERE pt.tag_id = t.id)::text AS post_count
       FROM tags t
      ORDER BY t.slug;`,
  )

  return result.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    names: {
      de: '',
      en: '',
      ar: '',
      ...Object.fromEntries((row.names ?? []).map((entry) => [entry.language, entry.name])),
    },
    postCount: Number(row.post_count),
  }))
}

const writeTagNames = async (tagId: string, names: TagWriteInput['names']) => {
  const db = getDb()

  await db.query('DELETE FROM tag_translations WHERE tag_id = $1;', [tagId])

  for (const language of POST_LANGUAGES) {
    await db.query(
      'INSERT INTO tag_translations (tag_id, language, name) VALUES ($1, $2, $3);',
      [tagId, language, names[language]],
    )
  }
}

export const createTag = async (input: TagWriteInput): Promise<AdminTag> => {
  const id = await withTransaction(async (db) => {
    const created = await db
      .query<{ id: string }>('INSERT INTO tags (slug) VALUES ($1) RETURNING id;', [input.slug])
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw conflictError('A tag with that slug already exists')
        throw error
      })

    const tagId = created.rows[0]?.id
    if (!tagId) throw notFoundError('The tag could not be created')

    await writeTagNames(tagId, input.names)

    return tagId
  })

  const tag = (await listTags()).find((entry) => entry.id === id)
  if (!tag) throw notFoundError('The tag could not be created')

  return tag
}

export const updateTag = async (id: string, input: TagWriteInput): Promise<AdminTag> => {
  await withTransaction(async (db) => {
    const updated = await db
      .query<{ id: string }>('UPDATE tags SET slug = $2 WHERE id = $1 RETURNING id;', [id, input.slug])
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw conflictError('A tag with that slug already exists')
        throw error
      })

    if (!updated.rows[0]) throw notFoundError('That tag does not exist')

    await writeTagNames(id, input.names)
  })

  const tag = (await listTags()).find((entry) => entry.id === id)
  if (!tag) throw notFoundError('That tag does not exist')

  return tag
}

export const deleteTag = async (id: string): Promise<void> => {
  const result = await getDb().query('DELETE FROM tags WHERE id = $1;', [id])

  if (result.rowCount === 0) throw notFoundError('That tag does not exist')
}

/* -------------------------------------------------------------------------- */
/* Posts — admin                                                              */
/* -------------------------------------------------------------------------- */

/** The case studies the post form can point an article at. */
export const listProjectOptions = async (): Promise<PostProjectOption[]> => {
  const result = await getDb().query<{ id: string; slug: string; name: string | null }>(
    `SELECT
        p.id,
        p.slug,
        title.name
       FROM projects p
       LEFT JOIN LATERAL (
         SELECT pt.name FROM project_translations pt
          WHERE pt.project_id = p.id
          ORDER BY CASE pt.language WHEN 'en' THEN 1 WHEN 'de' THEN 2 ELSE 3 END
          LIMIT 1
       ) title ON true
      ORDER BY p.sort_order, p.created_at;`,
  )

  return result.rows.map((row) => ({ id: row.id, slug: row.slug, name: row.name ?? row.slug }))
}

/** The WHERE clause shared by the list and its count, so both see the same rows. */
const buildListFilter = (filter: PostFilterInput) => {
  const conditions: string[] = []
  const values: unknown[] = []

  if (filter.search) {
    values.push(`%${filter.search}%`)
    const placeholder = `$${values.length}`

    conditions.push(`(
      p.slug ILIKE ${placeholder}
      OR EXISTS (
        SELECT 1 FROM post_translations pt
         WHERE pt.post_id = p.id AND (pt.title ILIKE ${placeholder} OR pt.excerpt ILIKE ${placeholder})
      )
    )`)
  }

  if (filter.published !== 'all') {
    values.push(filter.published === 'published')
    conditions.push(`p.is_published = $${values.length}`)
  }

  if (filter.tag) {
    values.push(filter.tag)
    conditions.push(`EXISTS (
      SELECT 1 FROM post_tags ptag
        JOIN tags t ON t.id = ptag.tag_id
       WHERE ptag.post_id = p.id AND t.slug = $${values.length}
    )`)
  }

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values }
}

/**
 * Tags in the visitor's language, ordered as the writer arranged them. Written
 * once because the admin list, the public list, and the article all need it.
 */
const tagsFor = (languageParam: string) => `(
  SELECT json_agg(json_build_object('slug', t.slug, 'name', tt.name) ORDER BY ptag.sort_order)
    FROM post_tags ptag
    JOIN tags t ON t.id = ptag.tag_id
    JOIN tag_translations tt ON tt.tag_id = t.id AND tt.language = ${languageParam}
   WHERE ptag.post_id = p.id
)`

export const listPostsForAdmin = async (filter: PostFilterInput): Promise<AdminPostList> => {
  const db = getDb()
  const { where, values } = buildListFilter(filter)

  const totalResult = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM posts p ${where};`,
    values,
  )

  const total = Number(totalResult.rows[0]?.count ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / POST_PAGE_SIZE))
  // A filter that shrinks the list must not strand the user on a page that no
  // longer exists, so the requested page is clamped rather than empty.
  const page = Math.min(filter.page, pageCount)

  const rows = await db.query<{
    id: string
    slug: string
    display_title: string | null
    is_published: boolean
    published_on: string | null
    languages: PostLanguage[] | null
    tags: PublicTag[] | null
    project_slug: string | null
    updated_at: Date
  }>(
    `SELECT
        p.id,
        p.slug,
        p.is_published,
        ${PUBLISHED_ON} AS published_on,
        title.title AS display_title,
        (
          SELECT array_agg(pt.language ORDER BY pt.language)
            FROM post_translations pt WHERE pt.post_id = p.id
        ) AS languages,
        ${tagsFor(`'en'`)} AS tags,
        (SELECT pr.slug FROM projects pr WHERE pr.id = p.project_id) AS project_slug,
        p.updated_at
       FROM posts p
       LEFT JOIN LATERAL (
         SELECT pt.title FROM post_translations pt
          WHERE pt.post_id = p.id
          ORDER BY ${TITLE_LANGUAGE_ORDER}
          LIMIT 1
       ) title ON true
       ${where}
      ORDER BY p.published_at DESC NULLS FIRST, p.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2};`,
    [...values, POST_PAGE_SIZE, (page - 1) * POST_PAGE_SIZE],
  )

  const items: AdminPostListItem[] = rows.rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    // A post with no translation at all still has to be identifiable.
    displayTitle: row.display_title ?? row.slug,
    isPublished: row.is_published,
    publishedOn: row.published_on,
    languages: row.languages ?? [],
    tags: row.tags ?? [],
    projectSlug: row.project_slug,
    updatedAt: row.updated_at.toISOString(),
  }))

  return { items, total, page, pageCount }
}

export const getPostForAdmin = async (id: string): Promise<AdminPostDetail> => {
  const db = getDb()

  const result = await db.query<{
    id: string
    slug: string
    project_id: string | null
    cover_src: string | null
    cover_width: number | null
    cover_height: number | null
    is_published: boolean
    published_on: string | null
    created_at: Date
    updated_at: Date
  }>(
    `SELECT
        p.id, p.slug, p.project_id, p.cover_src, p.cover_width, p.cover_height,
        p.is_published, ${PUBLISHED_ON} AS published_on, p.created_at, p.updated_at
       FROM posts p WHERE p.id = $1;`,
    [id],
  )

  const post = result.rows[0]
  if (!post) throw notFoundError('That post does not exist')

  const [translations, tags] = await Promise.all([
    db.query<{
      language: PostLanguage
      title: string
      excerpt: string
      body: RichTextDoc
      cover_alt: string
    }>(
      `SELECT language, title, excerpt, body, cover_alt
         FROM post_translations WHERE post_id = $1;`,
      [id],
    ),
    db.query<{ tag_id: string }>(
      'SELECT tag_id FROM post_tags WHERE post_id = $1 ORDER BY sort_order;',
      [id],
    ),
  ])

  return {
    id: post.id,
    slug: post.slug,
    projectId: post.project_id,
    cover:
      post.cover_src !== null && post.cover_width !== null && post.cover_height !== null
        ? { src: post.cover_src, width: post.cover_width, height: post.cover_height }
        : null,
    isPublished: post.is_published,
    publishedOn: post.published_on,
    tagIds: tags.rows.map((row) => row.tag_id),
    translations: Object.fromEntries(
      translations.rows.map((row) => [
        row.language,
        {
          title: row.title,
          excerpt: row.excerpt,
          body: row.body ?? emptyRichTextDoc(),
          coverAlt: row.cover_alt,
        },
      ]),
    ) as AdminPostDetail['translations'],
    createdAt: post.created_at.toISOString(),
    updatedAt: post.updated_at.toISOString(),
  }
}

/**
 * A published post is one a visitor can read in any of the three languages.
 * Refusing here rather than in the form is what keeps that true for anything
 * written straight to the API.
 */
const assertPublishable = (input: PostWriteInput) => {
  if (!input.isPublished) return

  const missing = missingPublishRequirements(input)

  if (missing.length > 0) {
    throw validationError('This post cannot be published yet', { missing })
  }
}

/** Children are replaced wholesale on every save; see `PostWriteSchema`. */
const writePostChildren = async (postId: string, input: PostWriteInput) => {
  const db = getDb()

  await db.query('DELETE FROM post_translations WHERE post_id = $1;', [postId])
  await db.query('DELETE FROM post_tags WHERE post_id = $1;', [postId])

  for (const language of POST_LANGUAGES) {
    const copy = input.translations[language]
    if (!copy) continue

    await db.query(
      `INSERT INTO post_translations
         (post_id, language, title, excerpt, body, cover_alt, reading_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [
        postId,
        language,
        copy.title,
        copy.excerpt,
        JSON.stringify(copy.body),
        copy.coverAlt,
        readingMinutes(copy.body),
      ],
    )
  }

  for (const [index, tagId] of input.tagIds.entries()) {
    await db.query(
      'INSERT INTO post_tags (post_id, tag_id, sort_order) VALUES ($1, $2, $3);',
      [postId, tagId, index],
    )
  }
}

/**
 * The publication date the row should carry. An explicit date always wins, so
 * an article can be backdated; otherwise publishing for the first time stamps
 * today, and a post that has been published once keeps the date it had —
 * editing an article is not republishing it.
 */
const resolvePublishedAt = (input: PostWriteInput, current: Date | null): Date | null => {
  if (input.publishedOn) return toInstant(input.publishedOn)
  if (current) return current

  return input.isPublished ? new Date() : null
}

export const createPost = async (input: PostWriteInput): Promise<AdminPostDetail> => {
  assertPublishable(input)

  const id = await withTransaction(async (db) => {
    const created = await db
      .query<{ id: string }>(
        `INSERT INTO posts (slug, project_id, cover_src, cover_width, cover_height, is_published, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id;`,
        [
          input.slug,
          input.projectId,
          input.cover?.src ?? null,
          input.cover?.width ?? null,
          input.cover?.height ?? null,
          input.isPublished,
          resolvePublishedAt(input, null),
        ],
      )
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw conflictError('A post with that slug already exists')
        throw error
      })

    const postId = created.rows[0]?.id
    if (!postId) throw notFoundError('The post could not be created')

    await writePostChildren(postId, input)

    return postId
  })

  return getPostForAdmin(id)
}

export const updatePost = async (id: string, input: PostWriteInput): Promise<AdminPostDetail> => {
  assertPublishable(input)

  await withTransaction(async (db) => {
    const existing = await db.query<{ published_at: Date | null }>(
      'SELECT published_at FROM posts WHERE id = $1 FOR UPDATE;',
      [id],
    )

    const current = existing.rows[0]
    if (!current) throw notFoundError('That post does not exist')

    await db
      .query(
        `UPDATE posts
            SET slug = $2,
                project_id = $3,
                cover_src = $4,
                cover_width = $5,
                cover_height = $6,
                is_published = $7,
                published_at = $8,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;`,
        [
          id,
          input.slug,
          input.projectId,
          input.cover?.src ?? null,
          input.cover?.width ?? null,
          input.cover?.height ?? null,
          input.isPublished,
          resolvePublishedAt(input, current.published_at),
        ],
      )
      .catch((error: unknown) => {
        if (isUniqueViolation(error)) throw conflictError('A post with that slug already exists')
        throw error
      })

    await writePostChildren(id, input)
  })

  return getPostForAdmin(id)
}

export const deletePost = async (id: string): Promise<void> => {
  const result = await getDb().query('DELETE FROM posts WHERE id = $1;', [id])

  if (result.rowCount === 0) throw notFoundError('That post does not exist')
}

/* -------------------------------------------------------------------------- */
/* Posts — public                                                             */
/* -------------------------------------------------------------------------- */

type PublicRow = {
  slug: string
  title: string
  excerpt: string
  body: RichTextDoc | null
  cover_alt: string
  reading_minutes: number
  published_on: string
  cover_src: string | null
  cover_width: number | null
  cover_height: number | null
  tags: PublicTag[] | null
  project_slug: string | null
  project_name: string | null
}

const toSummary = (row: PublicRow): PublicPostSummary => ({
  slug: row.slug,
  title: row.title,
  excerpt: row.excerpt,
  publishedOn: row.published_on,
  readingMinutes: row.reading_minutes,
  cover:
    row.cover_src !== null && row.cover_width !== null && row.cover_height !== null
      ? { src: row.cover_src, width: row.cover_width, height: row.cover_height, alt: row.cover_alt }
      : null,
  tags: row.tags ?? [],
})

/**
 * The public projection. `$1` picks the language for the copy and the tag
 * names; nothing unpublished, and no column the visitor has no business
 * seeing, is selected.
 */
const publicSelect = `
  SELECT
    p.slug,
    t.title,
    t.excerpt,
    t.body,
    t.cover_alt,
    t.reading_minutes,
    ${PUBLISHED_ON} AS published_on,
    p.cover_src,
    p.cover_width,
    p.cover_height,
    ${tagsFor('$1')} AS tags,
    project.slug AS project_slug,
    project.name AS project_name
   FROM posts p
   JOIN post_translations t ON t.post_id = p.id AND t.language = $1
   LEFT JOIN LATERAL (
     SELECT pr.slug, prt.name
       FROM projects pr
       LEFT JOIN project_translations prt ON prt.project_id = pr.id AND prt.language = $1
      WHERE pr.id = p.project_id AND pr.is_published
   ) project ON true
`

export const listPublishedPosts = async (
  language: PostLanguage,
  tagSlug?: string,
): Promise<PublicPostSummary[]> => {
  const values: unknown[] = [language]
  let filter = ''

  if (tagSlug) {
    values.push(tagSlug)
    filter = `AND EXISTS (
      SELECT 1 FROM post_tags ptag
        JOIN tags tg ON tg.id = ptag.tag_id
       WHERE ptag.post_id = p.id AND tg.slug = $${values.length}
    )`
  }

  const result = await getDb().query<PublicRow>(
    `${publicSelect} WHERE p.is_published ${filter} ORDER BY p.published_at DESC, p.created_at DESC;`,
    values,
  )

  return result.rows.map(toSummary)
}

export const getPublishedPost = async (
  language: PostLanguage,
  slug: string,
): Promise<PublicPost | null> => {
  const result = await getDb().query<PublicRow>(
    `${publicSelect} WHERE p.is_published AND p.slug = $2 LIMIT 1;`,
    [language, slug],
  )

  const row = result.rows[0]
  if (!row) return null

  return {
    ...toSummary(row),
    body: row.body ?? emptyRichTextDoc(),
    project:
      row.project_slug !== null
        ? { slug: row.project_slug, name: row.project_name ?? row.project_slug }
        : null,
  }
}

/** Every tag that has at least one published post, for the archive filter. */
export const listPublishedTags = async (language: PostLanguage): Promise<PublicTag[]> => {
  const result = await getDb().query<PublicTag>(
    `SELECT t.slug, tt.name
       FROM tags t
       JOIN tag_translations tt ON tt.tag_id = t.id AND tt.language = $1
      WHERE EXISTS (
        SELECT 1 FROM post_tags ptag
          JOIN posts p ON p.id = ptag.post_id
         WHERE ptag.tag_id = t.id AND p.is_published
      )
      ORDER BY tt.name;`,
    [language],
  )

  return result.rows
}

/** Just the slugs, for the sitemap. */
export const listPublishedPostSlugs = async (): Promise<string[]> => {
  const result = await getDb().query<{ slug: string }>(
    `SELECT slug FROM posts WHERE is_published ORDER BY published_at DESC;`,
  )

  return result.rows.map((row) => row.slug)
}
