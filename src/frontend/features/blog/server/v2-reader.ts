import { PUBLIC_BLOG_BATCH } from '#/backend2/contracts/blog.contract'
import { withRequestScope } from '#/backend2/db/client'
import { isApiError } from '#/backend2/http/error'
import { catchUpSchedules } from '#/backend2/modules/blog/post.due'
import { listPublished } from '#/backend2/modules/blog/post.repo'
import { listPublicPosts, readPublicPost } from '#/backend2/modules/blog/post.service'
import { listPublicTags } from '#/backend2/modules/blog/tag.service'
import type { Language } from '#/frontend/i18n/language'
import type { PublicPostSummary, PublicTag } from '#/shared/types/post.types'
import { type PublicArticle, toArticle, toPostSummary } from '../public-article'

/**
 * The public blog, read from Backend2.
 *
 * Server only: the handlers in `published-posts.ts` and the feed call these
 * inside the render, straight into the Backend2 services (the machine
 * rendering the page owns the database). Every call opens its own request scope, so on a Worker
 * no socket outlives the request.
 *
 * Only the live snapshot is ever read: the services join the published
 * version and nothing else, so a draft sentence cannot reach these shapes.
 */

export const BLOG_BATCH = PUBLIC_BLOG_BATCH.default

/**
 * One bounded stretch of the list: `count` articles from `offset`, fetched in
 * requests of at most the public ceiling. The archive's "Load more" keeps its
 * page number in the address, so page 3 is the first 27 articles — asked for
 * in one request, never by loading the whole blog and slicing it.
 */
const readRange = async (input: {
  language: Language
  tag: string
  offset: number
  count: number
}): Promise<{ posts: PublicPostSummary[]; total: number }> => {
  const posts: PublicPostSummary[] = []
  let total = 0
  let offset = input.offset
  const end = Math.min(input.offset + input.count, PUBLIC_BLOG_BATCH.maxOffset + PUBLIC_BLOG_BATCH.max)

  while (offset < end && offset <= PUBLIC_BLOG_BATCH.maxOffset) {
    const limit = Math.min(PUBLIC_BLOG_BATCH.max, end - offset)
    const batch = await listPublicPosts({ language: input.language, offset, limit, tag: input.tag })

    posts.push(...batch.items.map(toPostSummary))
    total = batch.total

    if (!batch.hasMore || batch.items.length === 0) break

    offset += batch.items.length
  }

  return { posts, total }
}

/** The newest articles, for the home section and the feeds. */
export const readV2Posts = (input: {
  language: Language
  tag?: string
  limit: number
}): Promise<PublicPostSummary[]> =>
  withRequestScope(async () => {
    const { posts } = await readRange({
      language: input.language,
      tag: input.tag ?? '',
      offset: 0,
      count: input.limit,
    })

    return posts
  })

/**
 * The archive at `?page=N`: the first N batches, and how many there are in
 * all. A page past the end shows what exists, as the legacy archive did.
 */
export const readV2PostPage = (input: {
  language: Language
  tag?: string
  page: number
}): Promise<{ posts: PublicPostSummary[]; total: number; page: number }> =>
  withRequestScope(async () => {
    const wanted = Math.max(1, Math.floor(input.page))
    const { posts, total } = await readRange({
      language: input.language,
      tag: input.tag ?? '',
      offset: 0,
      count: wanted * BLOG_BATCH,
    })
    const lastPage = Math.max(1, Math.ceil(total / BLOG_BATCH))

    return { posts, total, page: Math.min(wanted, lastPage) }
  })

export const readV2Tags = (language: Language): Promise<PublicTag[]> =>
  withRequestScope(async () =>
    (await listPublicTags(language)).map((tag) => ({ slug: tag.slug, name: tag.name })),
  )

/** One live article in one language, or null for anything else — a 404 either way. */
export const readV2Article = (input: { language: Language; slug: string }): Promise<PublicArticle | null> =>
  withRequestScope(async () => {
    try {
      return toArticle(await readPublicPost({ slug: input.slug, language: input.language }))
    } catch (error) {
      if (isApiError(error) && error.status === 404) return null

      throw error
    }
  })

/**
 * Every live address, for the sitemap: bounded pages of bare rows, no texts.
 * An article is live in all three languages or in none, so one list serves
 * every language's entry.
 */
const SLUG_PAGE = 200
const SLUG_CEILING = 5000

export const readV2Slugs = (): Promise<string[]> =>
  withRequestScope(async () => {
    await catchUpSchedules()

    const slugs: string[] = []

    for (let offset = 0; offset < SLUG_CEILING; offset += SLUG_PAGE) {
      const { rows, total } = await listPublished({ offset, limit: SLUG_PAGE, tagSlug: '' })

      for (const row of rows) if (row.slug) slugs.push(row.slug)

      if (offset + SLUG_PAGE >= total || rows.length === 0) break
    }

    return slugs
  })
