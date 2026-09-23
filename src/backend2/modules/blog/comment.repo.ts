import { getDb } from '../../db/client'
import type { CommentAuthor, OwnerCommentQuery } from '../../contracts/blog.contract'

/**
 * Every statement about comments. No business rule lives here — the service
 * decides whether a comment may exist; this decides how it is written down
 * and read back, one bounded page at a time.
 *
 * A row holds the text, where it sits in the tree and when it arrived.
 * Nothing about who sent it: there is nothing to select.
 */

export type CommentRow = {
  id: string
  post_id: string
  parent_id: string | null
  depth: number
  author: CommentAuthor
  body: string
  created_at: Date
  seen_at: Date | null
  /**
   * `created_at` to the microsecond, as text. JavaScript dates stop at the
   * millisecond, and a page marker that loses precision can skip a comment
   * or show one twice; PostgreSQL parses this back exactly.
   */
  cursor_at: string
  reply_count: number
}

const CURSOR_AT = `to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`
const REPLY_COUNT = '(SELECT count(*)::int FROM v2_blog_comments r WHERE r.parent_id = c.id)'
const SELECT = `SELECT c.*, ${CURSOR_AT} AS cursor_at, ${REPLY_COUNT} AS reply_count
  FROM v2_blog_comments c`

/** Where a page stopped: the last row's time and id. */
export type Cursor = { at: string; id: string }

export const insertComment = async (input: {
  postId: string
  parentId: string | null
  depth: number
  author: CommentAuthor
  body: string
  /** The owner's own replies are never "new" to the owner. */
  seen: boolean
}): Promise<CommentRow> => {
  const { rows } = await getDb().query<CommentRow>(
    `INSERT INTO v2_blog_comments AS c (post_id, parent_id, depth, author, body, seen_at)
          VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN CURRENT_TIMESTAMP ELSE NULL END)
       RETURNING c.*, ${CURSOR_AT} AS cursor_at, 0 AS reply_count`,
    [input.postId, input.parentId, input.depth, input.author, input.body, input.seen],
  )

  return rows[0]!
}

export const findComment = async (id: string): Promise<CommentRow | null> => {
  const { rows } = await getDb().query<CommentRow>(`${SELECT} WHERE c.id = $1`, [id])

  return rows[0] ?? null
}

/**
 * One page of an article's threads, newest first.
 *
 * Keyset rather than offset: comments keep arriving at the top, and an offset
 * would slide under a reader paging down, repeating what they just read. The
 * caller asks for one row more than it shows, which is how it knows whether
 * there is a next page without counting.
 */
export const listRoots = async (input: {
  postId: string
  after: Cursor | null
  limit: number
}): Promise<CommentRow[]> => {
  const { rows } = await getDb().query<CommentRow>(
    `${SELECT}
      WHERE c.post_id = $1 AND c.parent_id IS NULL
        AND ($2::timestamptz IS NULL OR (c.created_at, c.id) < ($2::timestamptz, $3::uuid))
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT $4`,
    [input.postId, input.after?.at ?? null, input.after?.id ?? null, input.limit],
  )

  return rows
}

/** One page of one comment's direct replies, oldest first — the order a conversation is read in. */
export const listReplies = async (input: {
  parentId: string
  after: Cursor | null
  limit: number
}): Promise<CommentRow[]> => {
  const { rows } = await getDb().query<CommentRow>(
    `${SELECT}
      WHERE c.parent_id = $1
        AND ($2::timestamptz IS NULL OR (c.created_at, c.id) > ($2::timestamptz, $3::uuid))
      ORDER BY c.created_at, c.id
      LIMIT $4`,
    [input.parentId, input.after?.at ?? null, input.after?.id ?? null, input.limit],
  )

  return rows
}

/** Every comment and how many are new, for a page of articles, in one query. */
export const countsForPosts = async (
  postIds: string[],
): Promise<Map<string, { total: number; unseen: number }>> => {
  const counts = new Map<string, { total: number; unseen: number }>()

  if (postIds.length === 0) return counts

  const { rows } = await getDb().query<{ post_id: string; total: number; unseen: number }>(
    `SELECT post_id, count(*)::int AS total,
            (count(*) FILTER (WHERE seen_at IS NULL))::int AS unseen
       FROM v2_blog_comments
      WHERE post_id = ANY($1::uuid[])
      GROUP BY post_id`,
    [postIds],
  )

  for (const row of rows) counts.set(row.post_id, { total: row.total, unseen: row.unseen })

  return counts
}

export const countUnseen = async (): Promise<number> => {
  const { rows } = await getDb().query<{ total: number }>(
    'SELECT count(*)::int AS total FROM v2_blog_comments WHERE seen_at IS NULL',
  )

  return rows[0]?.total ?? 0
}

/** The same words on the same article since `since`, from any visitor. */
export const visitorDuplicateSince = async (input: {
  postId: string
  body: string
  since: Date
}): Promise<boolean> => {
  const { rows } = await getDb().query<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM v2_blog_comments
        WHERE post_id = $1 AND author = 'visitor' AND body = $2 AND created_at > $3
     ) AS found`,
    [input.postId, input.body, input.since],
  )

  return rows[0]?.found === true
}

/**
 * The conversation above a comment, from the thread's first comment down to
 * the direct parent. Bounded by the depth limit the table itself enforces.
 */
export const ancestors = async (
  commentId: string,
): Promise<Array<Pick<CommentRow, 'id' | 'author' | 'body' | 'created_at' | 'depth'>>> => {
  const { rows } = await getDb().query<
    Pick<CommentRow, 'id' | 'author' | 'body' | 'created_at' | 'depth'>
  >(
    `WITH RECURSIVE chain AS (
       SELECT p.id, p.parent_id, p.author, p.body, p.created_at, p.depth
         FROM v2_blog_comments c
         JOIN v2_blog_comments p ON p.id = c.parent_id
        WHERE c.id = $1
       UNION ALL
       SELECT p.id, p.parent_id, p.author, p.body, p.created_at, p.depth
         FROM v2_blog_comments p
         JOIN chain ON p.id = chain.parent_id
     )
     SELECT id, author, body, created_at, depth FROM chain ORDER BY depth`,
    [commentId],
  )

  return rows
}

/** Every reply beneath a comment at any depth: what deleting it also deletes. */
export const descendantCount = async (commentId: string): Promise<number> => {
  const { rows } = await getDb().query<{ total: number }>(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM v2_blog_comments WHERE parent_id = $1
       UNION ALL
       SELECT c.id FROM v2_blog_comments c JOIN subtree ON c.parent_id = subtree.id
     )
     SELECT count(*)::int AS total FROM subtree`,
    [commentId],
  )

  return rows[0]?.total ?? 0
}

/** The comment and, through the cascading key, every reply beneath it. */
export const deleteComment = async (commentId: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_blog_comments WHERE id = $1', [commentId])
}

/** Marks comments as seen by the owner. Returns how many were new until now. */
export const markSeen = async (input: {
  ids: string[]
  postId?: string
  all: boolean
}): Promise<number> => {
  const db = getDb()

  if (input.all) {
    const { rows } = await db.query<{ id: string }>(
      'UPDATE v2_blog_comments SET seen_at = CURRENT_TIMESTAMP WHERE seen_at IS NULL RETURNING id',
    )

    return rows.length
  }

  if (input.postId) {
    const { rows } = await db.query<{ id: string }>(
      `UPDATE v2_blog_comments SET seen_at = CURRENT_TIMESTAMP
        WHERE seen_at IS NULL AND post_id = $1 RETURNING id`,
      [input.postId],
    )

    return rows.length
  }

  if (input.ids.length === 0) return 0

  const { rows } = await db.query<{ id: string }>(
    `UPDATE v2_blog_comments SET seen_at = CURRENT_TIMESTAMP
      WHERE seen_at IS NULL AND id = ANY($1::uuid[]) RETURNING id`,
    [input.ids],
  )

  return rows.length
}

/* ------------------------------------------------------------ the dashboard */

export type OwnerCommentRow = CommentRow & {
  post_slug: string | null
  post_comments_enabled: boolean
  post_draft_version_id: string | null
  post_published_version_id: string | null
  post_scheduled_version_id: string | null
  post_first_published_at: Date | null
  post_draft_revision: number
  post_published_draft_revision: number | null
  parent_author: CommentAuthor | null
  parent_excerpt: string | null
}

const OWNER_SELECT = `SELECT c.*, ${CURSOR_AT} AS cursor_at, ${REPLY_COUNT} AS reply_count,
       p.slug AS post_slug, p.comments_enabled AS post_comments_enabled,
       p.draft_version_id AS post_draft_version_id,
       p.published_version_id AS post_published_version_id,
       p.scheduled_version_id AS post_scheduled_version_id,
       p.first_published_at AS post_first_published_at,
       p.draft_revision AS post_draft_revision,
       p.published_draft_revision AS post_published_draft_revision,
       parent.author AS parent_author, left(parent.body, 160) AS parent_excerpt
  FROM v2_blog_comments c
  JOIN v2_blog_posts p ON p.id = c.post_id
  LEFT JOIN v2_blog_comments parent ON parent.id = c.parent_id`

/** `%` and `_` typed by the owner are letters to find, not wildcards. */
const likeTerm = (search: string): string =>
  `%${search.toLowerCase().replace(/[\\%_]/g, (character) => `\\${character}`)}%`

/**
 * One page of the owner's comment list.
 *
 * Without a parent it is the activity list — every comment, newest first.
 * With `root` it is one article's threads, newest first; with a comment id,
 * that comment's replies, oldest first, as a visitor reads them.
 */
export const listOwnerComments = async (
  query: OwnerCommentQuery,
): Promise<{ rows: OwnerCommentRow[]; total: number }> => {
  const conditions: string[] = []
  const values: unknown[] = []
  const bind = (value: unknown): string => `$${values.push(value)}`

  if (query.postId) conditions.push(`c.post_id = ${bind(query.postId)}`)
  if (query.parentId === 'root') conditions.push('c.parent_id IS NULL')
  else if (query.parentId) conditions.push(`c.parent_id = ${bind(query.parentId)}`)
  if (query.status === 'new') conditions.push('c.seen_at IS NULL')
  if (query.search !== '') conditions.push(`LOWER(c.body) LIKE ${bind(likeTerm(query.search))} ESCAPE '\\'`)

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const order =
    query.parentId && query.parentId !== 'root'
      ? 'c.created_at, c.id'
      : 'c.created_at DESC, c.id DESC'

  const db = getDb()

  const { rows: counted } = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM v2_blog_comments c ${where}`,
    values,
  )

  const limit = bind(query.pageSize)
  const offset = bind((query.page - 1) * query.pageSize)

  const { rows } = await db.query<OwnerCommentRow>(
    `${OWNER_SELECT} ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: counted[0]?.total ?? 0 }
}

export const findOwnerComment = async (id: string): Promise<OwnerCommentRow | null> => {
  const { rows } = await getDb().query<OwnerCommentRow>(`${OWNER_SELECT} WHERE c.id = $1`, [id])

  return rows[0] ?? null
}
