import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  BLOG_LIMITS,
  BlogCommentsSettingSchema,
  BlogDeleteSchema,
  BlogListQuerySchema,
  BlogPatchSchema,
  BlogPreviewQuerySchema,
  BlogRevisionSchema,
  BlogScheduleSchema,
  CreateBlogPostSchema,
  CreateTagSchema,
  MarkCommentsSeenSchema,
  OwnerCommentQuerySchema,
  OwnerReplySchema,
  PatchTagSchema,
  TagListQuerySchema,
} from '../../contracts/blog.contract'
import { readJsonBody } from '../../http/body'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import {
  deleteOwnerComment,
  getOwnerComment,
  listOwnerComments,
  markCommentsSeen,
  replyAsOwner,
} from './comment.service'
import {
  cancelSchedule,
  deletePost,
  discardPendingPost,
  publishPost,
  schedulePost,
  setCommentsEnabled,
  unpublishPost,
} from './post.publish'
import {
  createPost,
  isSlugAvailable,
  listPosts,
  previewPost,
  readOwnerPost,
  savePost,
} from './post.service'
import { createTag, deleteTag, listOwnerTags, patchTag } from './tag.service'

/**
 * The owner's blog, over HTTP.
 *
 * Thin: parse, delegate, respond. The whole group sits behind `ownerGuard` —
 * the deployment fence, plus a real V2 owner session wherever
 * `BACKEND2_OWNER_AUTH=required` — and nothing here repeats that check. Every
 * reply is `no-store`: a private draft and a comment that is not public must
 * not survive in any cache.
 */

const PostId = v.pipe(v.string(), v.uuid('That is not a valid article id'))
const TagId = v.pipe(v.string(), v.uuid('That is not a valid tag id'))
const CommentId = v.pipe(v.string(), v.uuid('That is not a valid comment id'))

export const ownerBlogRoutes = new Elysia({ prefix: '/blog' })
  .use(ownerGuard)

  /* ------------------------------------------------------------- articles */

  .get('/posts', async ({ query }) =>
    ownerJson({
      data: await listPosts(parseInput(BlogListQuerySchema, query)),
      message: 'Articles loaded',
    }),
  )

  .post('/posts', async ({ request }) =>
    ownerJson({
      data: await createPost(parseInput(CreateBlogPostSchema, await readJsonBody(request))),
      message: 'Article created',
      status: HttpStatus.CREATED,
    }),
  )

  /** Is an address free? Asked while the owner types. */
  .get('/posts/slug-available', async ({ query }) => {
    const parsed = parseInput(
      v.object({
        slug: v.pipe(v.string(), v.trim(), v.maxLength(BLOG_LIMITS.slug)),
        postId: v.optional(PostId, '00000000-0000-4000-8000-000000000000'),
      }),
      query,
    )

    const available = await isSlugAvailable({ slug: parsed.slug, postId: parsed.postId })

    return ownerJson({
      data: {
        available,
        reason: available
          ? undefined
          : parsed.slug === ''
            ? 'A web address is needed before publishing'
            : 'Another article already uses that web address',
      },
      message: 'Checked',
    })
  })

  .get('/posts/:id', async ({ params }) =>
    ownerJson({ data: await readOwnerPost(parseInput(PostId, params.id)), message: 'Article loaded' }),
  )

  /**
   * **Save**. Only what is sent changes, and nothing a visitor sees changes
   * at all — that waits for **Publish** or **Publish update**.
   */
  .patch('/posts/:id', async ({ params, request }) => {
    const id = parseInput(PostId, params.id)
    const { draftRevision, ...patch } = parseInput(BlogPatchSchema, await readJsonBody(request))

    return ownerJson({
      data: await savePost({ postId: id, draftRevision, patch }),
      message: 'Draft saved',
    })
  })

  /** Permanent, and it asks for the article's own id back. */
  .delete('/posts/:id', async ({ params, request }) => {
    const id = parseInput(PostId, params.id)
    const { confirm } = parseInput(BlogDeleteSchema, await readJsonBody(request))

    return ownerJson({ data: await deletePost({ postId: id, confirm }), message: 'Deleted' })
  })

  /** A version, through the same projection the live site uses. */
  .get('/posts/:id/preview', async ({ params, query }) => {
    const id = parseInput(PostId, params.id)
    const { language, version } = parseInput(BlogPreviewQuerySchema, query)

    return ownerJson({
      data: await previewPost({ postId: id, language, version }),
      message: 'Preview',
    })
  })

  .post('/posts/:id/publish', async ({ params, request }) => {
    const id = parseInput(PostId, params.id)
    const { draftRevision } = parseInput(BlogRevisionSchema, await readJsonBody(request))

    return ownerJson({ data: await publishPost({ postId: id, draftRevision }), message: 'Published' })
  })

  .post('/posts/:id/schedule', async ({ params, request }) => {
    const id = parseInput(PostId, params.id)
    const body = parseInput(BlogScheduleSchema, await readJsonBody(request))

    return ownerJson({ data: await schedulePost({ postId: id, ...body }), message: 'Scheduled' })
  })

  .post('/posts/:id/cancel-schedule', async ({ params }) =>
    ownerJson({
      data: await cancelSchedule(parseInput(PostId, params.id)),
      message: 'Schedule cancelled',
    }),
  )

  .post('/posts/:id/unpublish', async ({ params }) =>
    ownerJson({ data: await unpublishPost(parseInput(PostId, params.id)), message: 'Unpublished' }),
  )

  .post('/posts/:id/discard-pending', async ({ params, request }) => {
    const id = parseInput(PostId, params.id)
    const { draftRevision } = parseInput(BlogRevisionSchema, await readJsonBody(request))

    return ownerJson({
      data: await discardPendingPost({ postId: id, draftRevision }),
      message: 'Pending changes discarded',
    })
  })

  /** Comments on or off, at once — a setting, not content. */
  .post('/posts/:id/comment-setting', async ({ params, request }) => {
    const id = parseInput(PostId, params.id)
    const { enabled } = parseInput(BlogCommentsSettingSchema, await readJsonBody(request))

    return ownerJson({
      data: await setCommentsEnabled({ postId: id, enabled }),
      message: enabled ? 'Comments switched on' : 'Comments switched off',
    })
  })

  /* ----------------------------------------------------------------- tags */

  .get('/tags', async ({ query }) =>
    ownerJson({
      data: await listOwnerTags(parseInput(TagListQuerySchema, query)),
      message: 'Tags loaded',
    }),
  )

  .post('/tags', async ({ request }) =>
    ownerJson({
      data: await createTag(parseInput(CreateTagSchema, await readJsonBody(request))),
      message: 'Tag created',
      status: HttpStatus.CREATED,
    }),
  )

  .patch('/tags/:id', async ({ params, request }) => {
    const id = parseInput(TagId, params.id)
    const body = parseInput(PatchTagSchema, await readJsonBody(request))

    return ownerJson({ data: await patchTag({ id, ...body }), message: 'Tag saved' })
  })

  /** Only a tag no article carries. The refusal names the ones that do. */
  .delete('/tags/:id', async ({ params }) =>
    ownerJson({ data: await deleteTag(parseInput(TagId, params.id)), message: 'Tag deleted' }),
  )

  /* ------------------------------------------------------------- comments */

  .get('/comments', async ({ query }) =>
    ownerJson({
      data: await listOwnerComments(parseInput(OwnerCommentQuerySchema, query)),
      message: 'Comments loaded',
    }),
  )

  .post('/comments/seen', async ({ request }) =>
    ownerJson({
      data: await markCommentsSeen(parseInput(MarkCommentsSeenSchema, await readJsonBody(request))),
      message: 'Marked as seen',
    }),
  )

  .get('/comments/:id', async ({ params }) =>
    ownerJson({
      data: await getOwnerComment(parseInput(CommentId, params.id)),
      message: 'Comment loaded',
    }),
  )

  .post('/comments/:id/replies', async ({ params, request }) => {
    const id = parseInput(CommentId, params.id)
    const { body } = parseInput(OwnerReplySchema, await readJsonBody(request))

    return ownerJson({
      data: await replyAsOwner({ commentId: id, body }),
      message: 'Reply posted',
      status: HttpStatus.CREATED,
    })
  })

  /** The comment and every reply beneath it. */
  .delete('/comments/:id', async ({ params }) =>
    ownerJson({
      data: await deleteOwnerComment(parseInput(CommentId, params.id)),
      message: 'Deleted',
    }),
  )

/** Every owner route, for the tests that walk the fence. */
export const ownerBlogPaths = [
  { method: 'GET', path: '/api/v2/owner/blog/posts' },
  { method: 'POST', path: '/api/v2/owner/blog/posts' },
  { method: 'GET', path: '/api/v2/owner/blog/posts/slug-available?slug=x' },
  { method: 'GET', path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111' },
  { method: 'PATCH', path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111' },
  { method: 'DELETE', path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111' },
  { method: 'GET', path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111/preview' },
  { method: 'POST', path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111/publish' },
  { method: 'POST', path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111/schedule' },
  {
    method: 'POST',
    path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111/cancel-schedule',
  },
  { method: 'POST', path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111/unpublish' },
  {
    method: 'POST',
    path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111/discard-pending',
  },
  {
    method: 'POST',
    path: '/api/v2/owner/blog/posts/11111111-1111-4111-8111-111111111111/comment-setting',
  },
  { method: 'GET', path: '/api/v2/owner/blog/tags' },
  { method: 'POST', path: '/api/v2/owner/blog/tags' },
  { method: 'PATCH', path: '/api/v2/owner/blog/tags/22222222-2222-4222-8222-222222222222' },
  { method: 'DELETE', path: '/api/v2/owner/blog/tags/22222222-2222-4222-8222-222222222222' },
  { method: 'GET', path: '/api/v2/owner/blog/comments' },
  { method: 'POST', path: '/api/v2/owner/blog/comments/seen' },
  { method: 'GET', path: '/api/v2/owner/blog/comments/33333333-3333-4333-8333-333333333333' },
  {
    method: 'POST',
    path: '/api/v2/owner/blog/comments/33333333-3333-4333-8333-333333333333/replies',
  },
  { method: 'DELETE', path: '/api/v2/owner/blog/comments/33333333-3333-4333-8333-333333333333' },
] as const
