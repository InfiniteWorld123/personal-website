import { createServerFn } from '@tanstack/react-start'
import * as v from 'valibot'
import { withRequestScope } from '#/backend/db/client'
import {
  getPublishedPost,
  listPublishedPostSlugs,
  listPublishedPosts,
  listPublishedTags,
} from '#/backend/modules/posts/post.service'
import { readsFromV2 } from '#/backend2/public-source'
import type { PublicPostSummary, PublicTag } from '#/shared/types/post.types'
import { POST_LANGUAGES } from '#/shared/validation/post.validation'
import { clampPostPage } from '../post-list'
import { type PublicArticle, fromLegacyPost } from '../public-article'
import {
  BLOG_BATCH,
  readV2Article,
  readV2PostPage,
  readV2Posts,
  readV2Slugs,
  readV2Tags,
} from './v2-reader'

/**
 * The public pages read their posts on the server, straight from the service.
 * There is no HTTP round trip back to our own API: the page is being rendered
 * on the machine that owns the database.
 *
 * Every handler here goes through `withRequestScope` for the same reason
 * `handleApiRequest` does: this path renders on a Worker too, and without the
 * scope the query lands on the module-level pool, whose sockets Cloudflare has
 * already torn down between requests — and which never sees Hyperdrive.
 *
 * `docs/v2/public-cutover.md` step 4: with `blog` listed in
 * `PUBLIC_V2_MODULES` every handler reads Backend2's published articles
 * instead (`v2-reader.ts`), mapped into the same shapes, so the pages cannot
 * tell which backend answered. Unlisted — the default — nothing changes.
 */
const LanguageInput = v.object({
  language: v.picklist(POST_LANGUAGES),
  tag: v.optional(v.pipe(v.string(), v.maxLength(100))),
})

const PageInput = v.object({
  language: v.picklist(POST_LANGUAGES),
  tag: v.optional(v.pipe(v.string(), v.maxLength(100))),
  page: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(10_000)),
})

const SlugInput = v.object({
  language: v.picklist(POST_LANGUAGES),
  slug: v.pipe(v.string(), v.maxLength(100)),
})

export const fetchPublishedPosts = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(LanguageInput, input))
  .handler(async ({ data }): Promise<PublicPostSummary[]> => {
    // From Backend2, one batch of the newest: the home section shows three of
    // them, and the feeds read their own longer stretch (`rss-feed.ts`).
    if (readsFromV2('blog')) {
      return readV2Posts({ language: data.language, tag: data.tag || undefined, limit: BLOG_BATCH })
    }

    return withRequestScope(() => listPublishedPosts(data.language, data.tag || undefined))
  })

/**
 * The archive: what `/blog?page=N` shows.
 *
 * Legacy hands over every published post and the page slices it, as it always
 * has (`total` is null). Backend2 hands over exactly the first N batches and
 * the count, so nothing is fetched merely to be cut off in the browser.
 */
export type PostPage = {
  source: 'legacy' | 'v2'
  posts: PublicPostSummary[]
  total: number | null
  page: number
}

export const fetchPublishedPostPage = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(PageInput, input))
  .handler(async ({ data }): Promise<PostPage> => {
    if (readsFromV2('blog')) {
      return { source: 'v2', ...(await readV2PostPage({ ...data, tag: data.tag || undefined })) }
    }

    const posts = await withRequestScope(() => listPublishedPosts(data.language, data.tag || undefined))

    return { source: 'legacy', posts, total: null, page: clampPostPage(data.page, posts.length) }
  })

export const fetchPublishedTags = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(v.object({ language: v.picklist(POST_LANGUAGES) }), input))
  .handler(async ({ data }): Promise<PublicTag[]> => {
    if (readsFromV2('blog')) return readV2Tags(data.language)

    return withRequestScope(() => listPublishedTags(data.language))
  })

export const fetchPublishedPost = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(SlugInput, input))
  .handler(async ({ data }): Promise<PublicArticle | null> => {
    if (readsFromV2('blog')) return readV2Article(data)

    const post = await withRequestScope(() => getPublishedPost(data.language, data.slug))

    return post ? fromLegacyPost(post) : null
  })

/** Just the slugs, for the sitemap. */
export const fetchPublishedPostSlugs = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string[]> => {
    if (readsFromV2('blog')) return readV2Slugs()

    return withRequestScope(() => listPublishedPostSlugs())
  },
)
