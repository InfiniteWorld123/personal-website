import { createServerFn } from '@tanstack/react-start'
import * as v from 'valibot'
import type { PublicPostSummary, PublicTag } from '#/shared/types/post.types'
import { POST_LANGUAGES } from '#/shared/validation/post.validation'
import type { PublicArticle } from '../public-article'
import {
  BLOG_BATCH,
  readV2Article,
  readV2PostPage,
  readV2Posts,
  readV2Slugs,
  readV2Tags,
} from './v2-reader'

/**
 * The public pages read their posts on the server, straight from Backend2's
 * published articles (`v2-reader.ts`), mapped into the shapes the accepted
 * pages draw. There is no HTTP round trip back to our own API: the page is
 * being rendered on the machine that owns the database.
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

/**
 * One batch of the newest: the home section shows three of them, and the
 * feeds read their own longer stretch (`rss-feed.ts`).
 */
export const fetchPublishedPosts = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(LanguageInput, input))
  .handler(
    async ({ data }): Promise<PublicPostSummary[]> =>
      readV2Posts({ language: data.language, tag: data.tag || undefined, limit: BLOG_BATCH }),
  )

/**
 * The archive: what `/blog?page=N` shows. Exactly the first N batches and the
 * count, so nothing is fetched merely to be cut off in the browser.
 */
export type PostPage = {
  posts: PublicPostSummary[]
  total: number
  page: number
}

export const fetchPublishedPostPage = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(PageInput, input))
  .handler(async ({ data }): Promise<PostPage> => readV2PostPage({ ...data, tag: data.tag || undefined }))

export const fetchPublishedTags = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(v.object({ language: v.picklist(POST_LANGUAGES) }), input))
  .handler(async ({ data }): Promise<PublicTag[]> => readV2Tags(data.language))

export const fetchPublishedPost = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(SlugInput, input))
  .handler(async ({ data }): Promise<PublicArticle | null> => readV2Article(data))

/** Just the slugs, for the sitemap. */
export const fetchPublishedPostSlugs = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string[]> => readV2Slugs(),
)
