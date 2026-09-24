import type {
  PublicBlogCard,
  PublicBlogDoc,
  PublicBlogPost,
} from '#/backend2/contracts/blog.contract'
import type { PublicPost, PublicPostSummary } from '#/shared/types/post.types'

/**
 * The shapes the public blog pages render, and the one place Backend2's
 * answers are turned into them (`docs/v2/public-cutover.md` step 4).
 *
 * The list, the home section and the feeds keep the accepted card shape
 * (`PublicPostSummary`) unchanged, so a card looks as it always did. The
 * article gets one shape of its own, because Backend2 brings things the old
 * site's article never had — tables, a click-to-load video, a "last updated"
 * date, per-language search texts and comments.
 *
 * Types only from the contracts: nothing here runs a query, so this file can
 * sit in the page bundle.
 */

/** An article body. */
export type ArticleDoc = PublicBlogDoc

export type PublicArticle = Omit<PublicPost, 'cover'> & {
  body: ArticleDoc
  /** Size is unknown for an image the library could not measure. */
  cover: { src: string; width?: number; height?: number; alt: string } | null
  /** The day of the last real published update (Berlin), or null. */
  updatedOn: string | null
  /** The owner's search title and description, already resolved. */
  seo: { title: string; description: string }
  commentsEnabled: boolean
  commentCount: number
}

/**
 * A calendar day on the owner's clock.
 *
 * Backend2 dates an article with an instant. The pages and the feeds show a
 * day, and an article published at 00:30 in Erfurt was published on that day,
 * not on the previous one that UTC would name.
 */
export const berlinDay = (iso: string): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso))

  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * The card needs a size for its `width`/`height` attributes. A cover
 * the library could not measure gets the card's own 16:9 box, which is what
 * the card crops every cover to anyway.
 */
const CARD_FALLBACK = { width: 1600, height: 900 }

export const toPostSummary = (card: PublicBlogCard): PublicPostSummary => ({
  slug: card.slug,
  title: card.title,
  excerpt: card.summary,
  publishedOn: berlinDay(card.publishedAt),
  readingMinutes: card.readingMinutes,
  cover: card.cover
    ? {
        src: card.cover.url,
        width: card.cover.width ?? CARD_FALLBACK.width,
        height: card.cover.height ?? CARD_FALLBACK.height,
        alt: card.cover.alt,
      }
    : null,
  tags: card.tags.map((tag) => ({ slug: tag.slug, name: tag.name })),
  viewCount: card.readCount,
  likeCount: card.likeCount,
})

export const toArticle = (post: PublicBlogPost): PublicArticle => ({
  slug: post.slug,
  title: post.title,
  excerpt: post.summary,
  publishedOn: berlinDay(post.publishedAt),
  updatedOn: post.updatedAt ? berlinDay(post.updatedAt) : null,
  readingMinutes: post.readingMinutes,
  cover: post.cover
    ? {
        src: post.cover.url,
        width: post.cover.width ?? undefined,
        height: post.cover.height ?? undefined,
        alt: post.cover.alt,
      }
    : null,
  tags: post.tags.map((tag) => ({ slug: tag.slug, name: tag.name })),
  viewCount: post.readCount,
  likeCount: post.likeCount,
  body: post.body,
  project: post.project ? { slug: post.project.slug, name: post.project.name } : null,
  seo: { title: post.seo.title, description: post.seo.description },
  commentsEnabled: post.commentsEnabled,
  commentCount: post.commentCount,
})
