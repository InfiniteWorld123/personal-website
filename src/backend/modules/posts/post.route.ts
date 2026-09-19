import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { getTrustedClientIp } from '#/backend/shared/client-ip'
import { notFoundError } from '#/backend/shared/error'
import { HttpStatusCode } from '#/backend/shared/http'
import { responseOk } from '#/backend/shared/response'
import { enforceRateLimit } from '#/backend/shared/rate-limit'
import { parseInput } from '#/backend/shared/validate'
import {
  POST_LANGUAGES,
  PostFilterSchema,
  PostWriteSchema,
  TagWriteSchema,
} from '#/shared/validation/post.validation'
import * as v from 'valibot'
import {
  countPostView,
  createPost,
  createTag,
  deletePost,
  deleteTag,
  getPostForAdmin,
  getPublishedPost,
  listPostsForAdmin,
  listProjectOptions,
  listPublishedPosts,
  likePost,
  listPublishedTags,
  listTags,
  unlikePost,
  updatePost,
  updateTag,
} from './post.service'

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

const LanguageSchema = v.optional(v.picklist(POST_LANGUAGES), 'de')

const TagSlugSchema = v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(100))

/** Behind the admin guard: full read and write over drafts and published work. */
export const adminPostRoutes = new Elysia({ prefix: '/blog' })
  .use(adminGuard)
  .get('/posts', async ({ query }) =>
    responseOk({
      data: await listPostsForAdmin(parseInput(PostFilterSchema, query)),
      message: 'Posts listed',
    }),
  )
  .get('/tags', async () => responseOk({ data: await listTags(), message: 'Tags listed' }))
  .post('/tags', async ({ body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({ data: await createTag(parseInput(TagWriteSchema, body)), message: 'Tag created' }),
    ),
  )
  .put('/tags/:id', async ({ params, body }) =>
    responseOk({
      data: await updateTag(parseInput(IdSchema, params.id), parseInput(TagWriteSchema, body)),
      message: 'Tag saved',
    }),
  )
  .delete('/tags/:id', async ({ params }) => {
    await deleteTag(parseInput(IdSchema, params.id))

    return responseOk({ data: { deleted: true }, message: 'Tag deleted' })
  })
  // The case studies an article can be tied to. Read-only here; projects are
  // written through their own module.
  .get('/projects', async () =>
    responseOk({ data: await listProjectOptions(), message: 'Projects listed' }),
  )
  .get('/posts/:id', async ({ params }) =>
    responseOk({
      data: await getPostForAdmin(parseInput(IdSchema, params.id)),
      message: 'Post loaded',
    }),
  )
  .post('/posts', async ({ body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({ data: await createPost(parseInput(PostWriteSchema, body)), message: 'Post created' }),
    ),
  )
  .put('/posts/:id', async ({ params, body }) =>
    responseOk({
      data: await updatePost(parseInput(IdSchema, params.id), parseInput(PostWriteSchema, body)),
      message: 'Post saved',
    }),
  )
  .delete('/posts/:id', async ({ params }) => {
    await deletePost(parseInput(IdSchema, params.id))

    return responseOk({ data: { deleted: true }, message: 'Post deleted' })
  })

/**
 * How often one address may move a blog counter in an hour.
 *
 * Returns without limiting when the address is unknown — behind a proxy that
 * strips it, refusing every reader is worse than counting a few too many.
 */
const limitBy = async (request: Request, scope: string, perHour: number): Promise<void> => {
  const clientIp = getTrustedClientIp(request)

  if (!clientIp) return

  await enforceRateLimit({
    scope,
    identity: clientIp,
    limit: perHour,
    windowSeconds: 60 * 60,
    message: 'That is a lot of clicking. Give it a minute.',
  })
}

/**
 * Public read surface. Only published posts, one language at a time, and the
 * explicit projection built in the service — never a table row.
 */
export const publicPostRoutes = new Elysia({ prefix: '/blog' })
  .get('/posts', async ({ query }) =>
    responseOk({
      data: await listPublishedPosts(
        parseInput(LanguageSchema, query.language),
        parseInput(TagSlugSchema, query.tag) || undefined,
      ),
      message: 'Posts listed',
    }),
  )
  .get('/tags', async ({ query }) =>
    responseOk({
      data: await listPublishedTags(parseInput(LanguageSchema, query.language)),
      message: 'Tags listed',
    }),
  )
  .get('/posts/:slug', async ({ params, query }) => {
    const post = await getPublishedPost(parseInput(LanguageSchema, query.language), params.slug)

    if (!post) throw notFoundError('That post does not exist')

    return responseOk({ data: post, message: 'Post loaded' })
  })

  /*
   * Reading and liking.
   *
   * Three writes that take no body, set no cookie and return two integers.
   * There is no visitor id anywhere in this flow: whether *this* reader has
   * already read or liked the article is remembered by their own browser, and
   * the only thing the server keeps is the total.
   *
   * The address is used and not stored. `enforceRateLimit` keeps an HMAC of it
   * in `request_rate_limits`, which prunes itself within two days — the same
   * mechanism the sign-in form and the assistant already use. Without it these
   * would be three unauthenticated increment endpoints, which is a figure
   * anyone could write.
   *
   * The limits are deliberately loose. Somebody reading five articles in a row
   * is a good afternoon, not an attack, and a limit that fires on real reading
   * would make the numbers wrong in the one direction that matters.
   */
  .post('/posts/:slug/view', async ({ params, request }) => {
    await limitBy(request, 'blog-view', 120)

    return responseOk({ data: await countPostView(params.slug), message: 'Read counted' })
  })

  .post('/posts/:slug/like', async ({ params, request }) => {
    await limitBy(request, 'blog-like', 60)

    return responseOk({ data: await likePost(params.slug), message: 'Liked' })
  })

  .delete('/posts/:slug/like', async ({ params, request }) => {
    await limitBy(request, 'blog-like', 60)

    return responseOk({ data: await unlikePost(params.slug), message: 'Like taken back' })
  })
