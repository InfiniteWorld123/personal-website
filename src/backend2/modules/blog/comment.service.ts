import { consumeRateLimit, sweepRateLimits } from '../../auth/rate-limit'
import { withTransaction } from '../../db/client'
import {
  COMMENT_LIMITS,
  COMMENT_RATE_LIMITS,
  COMMENT_REFUSALS,
  type OwnerComment,
  type OwnerCommentPage,
  type OwnerCommentQuery,
  type OwnerCommentThread,
  type PublicComment,
  type PublicCommentPage,
  blogDisplayTitle,
  commentProblem,
  isValidBlogSlug,
  normalizeCommentText,
} from '../../contracts/blog.contract'
import {
  badRequest,
  commentRejected,
  commentsClosed,
  duplicateComment,
  notFound,
  rateLimited,
  validationFailed,
} from '../../http/error'
import * as repo from './comment.repo'
import { catchUpSchedules } from './post.due'
import { blogState } from './post.mapper'
import * as posts from './post.repo'

/**
 * Anonymous comments, and the owner's answers.
 *
 * `docs/v2/blog.md`: a visitor sends text and nothing else, an ordinary valid
 * comment is published at once, and what is refused is refused for its
 * *shape* — too frequent, repeated, oversized, stuffed with links, carrying
 * markup — never for its opinion. Every refusal says why, with a stable reason
 * the website translates, so a person can fix it and try again.
 *
 * The limits that need to know who is sending work on a keyed hash of the
 * address in the shared rate-limit table, which forgets it within two days.
 * The comment itself never learns anything about its sender.
 */

const iso = (value: Date): string => new Date(value).toISOString()

/* ------------------------------------------------------------ page markers */

const CURSOR_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Opaque to the visitor, and meaningless without the query that made it. */
const encodeCursor = (row: repo.CommentRow): string =>
  btoa(`${row.cursor_at}|${row.id}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const decodeCursor = (value: string): repo.Cursor | null => {
  if (value === '') return null

  let decoded = ''

  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/')

    decoded = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  } catch {
    decoded = ''
  }

  const [at, id] = decoded.split('|')

  if (!at || !id || !CURSOR_AT.test(at) || !UUID.test(id)) {
    throw badRequest('That page marker is not valid. Load the comments again.')
  }

  return { at, id }
}

/* ------------------------------------------------------------------ shapes */

/** Built field by field: the row's `seen_at` and ids beyond the tree never leave. */
const toPublicComment = (row: repo.CommentRow): PublicComment => ({
  id: row.id,
  parentId: row.parent_id,
  level: row.depth + 1,
  author: row.author,
  body: row.body,
  createdAt: iso(row.created_at),
  replyCount: Number(row.reply_count),
})

const toOwnerComment = (
  row: repo.OwnerCommentRow,
  titles: Map<string, Record<'de' | 'en' | 'ar', { title: string }>>,
): OwnerComment => ({
  id: row.id,
  postId: row.post_id,
  parentId: row.parent_id,
  level: row.depth + 1,
  author: row.author,
  body: row.body,
  createdAt: iso(row.created_at),
  isNew: row.seen_at === null,
  replyCount: Number(row.reply_count),
  post: {
    id: row.post_id,
    title: blogDisplayTitle(
      titles.get(row.post_draft_version_id ?? '') ?? {
        de: { title: '' },
        en: { title: '' },
        ar: { title: '' },
      },
      'en',
    ),
    state: blogState({
      published_version_id: row.post_published_version_id,
      scheduled_version_id: row.post_scheduled_version_id,
      first_published_at: row.post_first_published_at,
      draft_revision: row.post_draft_revision,
      published_draft_revision: row.post_published_draft_revision,
    }),
    publicSlug: row.post_slug,
    commentsEnabled: row.post_comments_enabled,
  },
  parent:
    row.parent_id && row.parent_author
      ? { id: row.parent_id, author: row.parent_author, excerpt: row.parent_excerpt ?? '' }
      : null,
})

const titlesFor = async (rows: repo.OwnerCommentRow[]) =>
  posts.loadListTexts([
    ...new Set(
      rows.map((row) => row.post_draft_version_id).filter((id): id is string => id !== null),
    ),
  ])

/* ------------------------------------------------------------------ public */

/** The live article a comment belongs to, or the same 404 as any unknown address. */
const findLiveArticle = async (slug: string): Promise<posts.PublishedRow> => {
  const found = isValidBlogSlug(slug) ? await posts.findPublishedBySlug(slug) : null

  if (!found) throw notFound('That article does not exist')

  return found
}

const CLOSED: PublicCommentPage = { enabled: false, total: 0, items: [], nextCursor: null }

/**
 * One page of an article's threads, newest first. Each carries its number of
 * direct replies, which the page fetches separately — the whole tree is never
 * sent to be paginated in the browser.
 */
export const listPublicComments = async (input: {
  slug: string
  cursor: string
  limit: number
}): Promise<PublicCommentPage> => {
  await catchUpSchedules()

  const article = await findLiveArticle(input.slug)

  if (!article.comments_enabled) return CLOSED

  const rows = await repo.listRoots({
    postId: article.id,
    after: decodeCursor(input.cursor),
    limit: input.limit + 1,
  })
  const shown = rows.slice(0, input.limit)
  const counts = await repo.countsForPosts([article.id])

  return {
    enabled: true,
    total: counts.get(article.id)?.total ?? 0,
    items: shown.map(toPublicComment),
    nextCursor: rows.length > input.limit ? encodeCursor(shown[shown.length - 1]!) : null,
  }
}

/** One page of one comment's direct replies, oldest first. */
export const listPublicReplies = async (input: {
  slug: string
  commentId: string
  cursor: string
  limit: number
}): Promise<PublicCommentPage> => {
  const article = await findLiveArticle(input.slug)

  if (!article.comments_enabled) return CLOSED

  const parent = await repo.findComment(input.commentId)

  if (!parent || parent.post_id !== article.id) throw notFound('That comment does not exist')

  const rows = await repo.listReplies({
    parentId: parent.id,
    after: decodeCursor(input.cursor),
    limit: input.limit + 1,
  })
  const shown = rows.slice(0, input.limit)

  return {
    enabled: true,
    total: Number(parent.reply_count),
    items: shown.map(toPublicComment),
    nextCursor: rows.length > input.limit ? encodeCursor(shown[shown.length - 1]!) : null,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A visitor's comment or reply. Published at once when it passes; refused
 * with a reason when it does not. The checks run cheapest first, and nothing
 * is written unless all of them pass.
 */
export const submitComment = async (input: {
  slug: string
  body: string
  parentId: string | null
  website: string
  identity: string
  now?: Date
}): Promise<PublicComment> => {
  const now = input.now ?? new Date()
  const article = await findLiveArticle(input.slug)

  if (!article.comments_enabled) throw commentsClosed(COMMENT_REFUSALS.closed, { reason: 'closed' })

  // The hidden field. A person never sees it; a script that fills in every
  // field it finds does. Told nothing more than that it failed.
  if (input.website.trim() !== '') {
    throw commentRejected(COMMENT_REFUSALS.rejected, { reason: 'rejected' })
  }

  const body = normalizeCommentText(input.body)
  const problem = commentProblem(body)

  if (problem === 'empty' || problem === 'too_long') {
    throw validationFailed(COMMENT_REFUSALS[problem], {
      reason: problem,
      issues: [{ field: 'body', message: COMMENT_REFUSALS[problem] }],
      missing: [],
    })
  }

  if (problem) throw commentRejected(COMMENT_REFUSALS[problem], { reason: problem })

  let depth = 0

  if (input.parentId) {
    const parent = await repo.findComment(input.parentId)

    // Deleted meanwhile, or never on this article: the reply has nowhere to go.
    if (!parent || parent.post_id !== article.id) {
      throw notFound(COMMENT_REFUSALS.gone, { reason: 'gone' })
    }

    depth = parent.depth + 1

    if (depth >= COMMENT_LIMITS.depth) {
      throw validationFailed(COMMENT_REFUSALS.too_deep, { reason: 'too_deep', issues: [], missing: [] })
    }
  }

  // The same long text on the same article within a day, from anyone: a copy.
  if (
    body.length >= COMMENT_LIMITS.duplicateMinLength &&
    (await repo.visitorDuplicateSince({
      postId: article.id,
      body,
      since: new Date(now.getTime() - DAY_MS),
    }))
  ) {
    throw duplicateComment(COMMENT_REFUSALS.duplicate, { reason: 'duplicate' })
  }

  for (const rule of COMMENT_RATE_LIMITS) {
    const result = await consumeRateLimit({
      scope: rule.scope,
      identity: rule.per === 'source' ? input.identity : article.id,
      rule: { limit: rule.limit, windowSeconds: rule.windowSeconds },
    })

    if (!result.allowed) {
      throw rateLimited(COMMENT_REFUSALS.too_fast, {
        reason: 'too_fast',
        retryAfter: result.retryAfter,
      })
    }
  }

  /*
   * The same sender, the same words, the same article, within a day — even a
   * short "Thanks!". That is a double click or a script, not a second
   * opinion. Remembered as one keyed hash of all three together, which says
   * nothing on its own and is forgotten within two days.
   */
  const repeat = await consumeRateLimit({
    scope: 'blog-comment-repeat',
    identity: `${input.identity}\u0000${article.id}\u0000${body}`,
    rule: { limit: 1, windowSeconds: DAY_MS / 1000 },
  })

  if (!repeat.allowed) throw duplicateComment(COMMENT_REFUSALS.duplicate, { reason: 'duplicate' })

  const row = await repo.insertComment({
    postId: article.id,
    parentId: input.parentId,
    depth,
    author: 'visitor',
    body,
    seen: false,
  })

  // Nothing schedules the rate-limit table's cleanup; a new comment is as good
  // a moment as any, and a failure here is no reason to fail the comment.
  await sweepRateLimits().catch(() => {})

  return toPublicComment(row)
}

/* --------------------------------------------------------------- the owner */

export const listOwnerComments = async (query: OwnerCommentQuery): Promise<OwnerCommentPage> => {
  const first = await repo.listOwnerComments(query)
  const pageCount = Math.max(1, Math.ceil(first.total / query.pageSize))
  const page = Math.min(query.page, pageCount)
  const result = page === query.page ? first : await repo.listOwnerComments({ ...query, page })
  const titles = await titlesFor(result.rows)

  return {
    items: result.rows.map((row) => toOwnerComment(row, titles)),
    page,
    pageSize: query.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
    newTotal: await repo.countUnseen(),
  }
}

/**
 * One comment with the conversation above it and the size of what hangs
 * below — the context `docs/v2/blog.md` asks for before a reply or a delete.
 */
export const getOwnerComment = async (id: string): Promise<OwnerCommentThread> => {
  const row = await repo.findOwnerComment(id)

  if (!row) throw notFound('That comment does not exist')

  const ancestors = await repo.ancestors(id)

  return {
    comment: toOwnerComment(row, await titlesFor([row])),
    ancestors: ancestors.map((entry) => ({
      id: entry.id,
      author: entry.author,
      body: entry.body,
      createdAt: iso(entry.created_at),
      level: entry.depth + 1,
    })),
    descendantCount: await repo.descendantCount(id),
  }
}

/**
 * The owner answers, marked as Yaman Warda. Held to the length rule only —
 * the owner may link to their own work — and allowed whatever state the
 * article is in: a reply to a hidden thread simply waits with it. Answering a
 * comment is also having seen it.
 */
export const replyAsOwner = async (input: {
  commentId: string
  body: string
}): Promise<OwnerComment> => {
  const id = await withTransaction(async () => {
    const parent = await repo.findComment(input.commentId)

    if (!parent) throw notFound('That comment does not exist')

    const body = normalizeCommentText(input.body)
    const problem = commentProblem(body, 'owner')

    if (problem) {
      throw validationFailed(COMMENT_REFUSALS[problem], {
        reason: problem,
        issues: [{ field: 'body', message: COMMENT_REFUSALS[problem] }],
        missing: [],
      })
    }

    const depth = parent.depth + 1

    if (depth >= COMMENT_LIMITS.depth) {
      throw validationFailed(COMMENT_REFUSALS.too_deep, { reason: 'too_deep', issues: [], missing: [] })
    }

    const row = await repo.insertComment({
      postId: parent.post_id,
      parentId: parent.id,
      depth,
      author: 'owner',
      body,
      seen: true,
    })

    await repo.markSeen({ ids: [parent.id], all: false })

    return row.id
  })

  return (await getOwnerComment(id)).comment
}

/**
 * A comment and every reply beneath it, at any depth — `docs/v2/blog.md`:
 * "Deleting a comment deletes its entire descendant subtree." Returns how many
 * comments went, which the dashboard showed before asking.
 */
export const deleteOwnerComment = async (id: string): Promise<{ deleted: number }> =>
  withTransaction(async () => {
    const comment = await repo.findComment(id)

    if (!comment) throw notFound('That comment does not exist')

    const below = await repo.descendantCount(id)

    await repo.deleteComment(id)

    return { deleted: below + 1 }
  })

export const markCommentsSeen = async (input: {
  ids: string[]
  postId?: string
  all: boolean
}): Promise<{ marked: number; newTotal: number }> => {
  const marked = await repo.markSeen(input)

  return { marked, newTotal: await repo.countUnseen() }
}
