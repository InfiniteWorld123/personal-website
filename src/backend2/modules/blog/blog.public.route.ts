import { Elysia } from 'elysia'
import * as v from 'valibot'
import { requestIdentity } from '../../auth/rate-limit'
import {
  CommentSubmitSchema,
  LikeSchema,
  PublicBlogDetailQuerySchema,
  PublicBlogListQuerySchema,
  PublicCommentQuerySchema,
  PublicReplyQuerySchema,
  PublicTagQuerySchema,
} from '../../contracts/blog.contract'
import { readJsonBody, readLimited } from '../../http/body'
import { badRequest, notFound } from '../../http/error'
import { responseOk } from '../../http/response'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { listPublicComments, listPublicReplies, submitComment } from './comment.service'
import { countPublicRead, listPublicPosts, readPublicPost, setPublicLike } from './post.service'
import { listPublicTags } from './tag.service'

/**
 * What the public website reads, and the three things a visitor may write:
 * a comment, a read and a like.
 *
 * Mounted only where the V2 database is configured, like the Projects and
 * Services reads.
 *
 * Every answer is built by the projections in `post.mapper.ts` from the live
 * snapshot alone. A draft sentence or a scheduled article is not filtered out
 * here — it is never read.
 *
 * The writes need no session and are not cached. `src/start.ts` already
 * refuses any `/api` write whose `Origin` is not this site, which is what
 * stops another page from posting comments through a visitor's browser.
 */

/**
 * One minute, as Projects and Services: an article is exactly the thing the
 * owner publishes and then checks on the live page, and an hour-long cache
 * would make **Publish update** look like it did nothing.
 */
const PUBLIC_CACHE = 'public, max-age=60'

/**
 * Comments are not cached at all. A reader who posts and reloads must see
 * their comment, and one the owner deleted must not linger — the queries are
 * bounded pages, so answering them fresh costs little.
 */
const NO_STORE = 'no-store'

const publicJson = <T>(
  data: T,
  message: string,
  options: { cache?: string; status?: number } = {},
): Response =>
  new Response(JSON.stringify(responseOk({ data, message })), {
    status: options.status ?? HttpStatus.OK,
    headers: {
      'content-type': 'application/json',
      'cache-control': options.cache ?? PUBLIC_CACHE,
      'x-content-type-options': 'nosniff',
    },
  })

/** A comment is a few thousand characters of text; its request has no reason to be larger. */
const MAX_COMMENT_BODY_BYTES = 16 * 1024

const readCommentBody = async (request: Request): Promise<unknown> => {
  const bytes = await readLimited(request, MAX_COMMENT_BODY_BYTES)

  if (bytes.byteLength === 0) return {}

  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw badRequest('The request body is not valid JSON')
  }
}

const CommentId = v.pipe(v.string(), v.uuid())

export const publicBlogRoutes = new Elysia({ prefix: '/blog' })
  /**
   * One batch of live articles, newest first. The `/blog` "Load more" asks for
   * `offset = alreadyShown, limit = 9`; a deep link asks for more at once, up
   * to the ceiling; `tag` narrows to one tag's articles. A feed or a sitemap
   * pages through the same endpoint — nothing can ask for the whole blog.
   */
  .get('/posts', async ({ query }) =>
    publicJson(await listPublicPosts(parseInput(PublicBlogListQuerySchema, query)), 'Articles loaded'),
  )

  /** The filter chips: tags at least one live article carries, in one language. */
  .get('/tags', async ({ query }) => {
    const { language } = parseInput(PublicTagQuerySchema, query)

    return publicJson(await listPublicTags(language), 'Tags loaded')
  })

  .get('/posts/:slug', async ({ params, query }) => {
    const { language } = parseInput(PublicBlogDetailQuerySchema, query)

    return publicJson(
      await readPublicPost({ slug: String(params.slug), language }),
      'Article loaded',
    )
  })

  /** One page of an article's threads, newest first. */
  .get('/posts/:slug/comments', async ({ params, query }) => {
    const { cursor, limit } = parseInput(PublicCommentQuerySchema, query)

    return publicJson(
      await listPublicComments({ slug: String(params.slug), cursor, limit }),
      'Comments loaded',
      { cache: NO_STORE },
    )
  })

  /** A comment or a reply. Published at once when it passes. */
  .post('/posts/:slug/comments', async ({ params, request }) => {
    const input = parseInput(CommentSubmitSchema, await readCommentBody(request))

    return publicJson(
      await submitComment({
        slug: String(params.slug),
        body: input.body,
        parentId: input.parentId,
        website: input.website,
        identity: requestIdentity(request),
      }),
      'Comment posted',
      { cache: NO_STORE, status: HttpStatus.CREATED },
    )
  })

  /** One page of one comment's direct replies, oldest first. */
  .get('/posts/:slug/comments/:id/replies', async ({ params, query }) => {
    const parsed = v.safeParse(CommentId, params.id)

    // A malformed id is "not found", not "invalid", like any other unknown id.
    if (!parsed.success) throw notFound('That comment does not exist')

    const { cursor, limit } = parseInput(PublicReplyQuerySchema, query)

    return publicJson(
      await listPublicReplies({
        slug: String(params.slug),
        commentId: parsed.output,
        cursor,
        limit,
      }),
      'Replies loaded',
      { cache: NO_STORE },
    )
  })

  /** One more read. The browser remembers it counted; the server remembers only the total. */
  .post('/posts/:slug/read', async ({ params, request }) =>
    publicJson(
      await countPublicRead({ slug: String(params.slug), identity: requestIdentity(request) }),
      'Read counted',
      { cache: NO_STORE },
    ),
  )

  /** A like, or a like taken back: `{ liked: true }` or `{ liked: false }`. */
  .post('/posts/:slug/like', async ({ params, request }) => {
    const { liked } = parseInput(LikeSchema, await readJsonBody(request))

    return publicJson(
      await setPublicLike({ slug: String(params.slug), liked, identity: requestIdentity(request) }),
      liked ? 'Liked' : 'Like taken back',
      { cache: NO_STORE },
    )
  })
