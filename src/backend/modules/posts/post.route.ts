import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { notFoundError } from '#/backend/shared/error'
import { HttpStatusCode } from '#/backend/shared/http'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import {
  POST_LANGUAGES,
  PostFilterSchema,
  PostWriteSchema,
  TagWriteSchema,
} from '#/shared/validation/post.validation'
import * as v from 'valibot'
import {
  createPost,
  createTag,
  deletePost,
  deleteTag,
  getPostForAdmin,
  getPublishedPost,
  listPostsForAdmin,
  listProjectOptions,
  listPublishedPosts,
  listPublishedTags,
  listTags,
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
