import type { PublicPostSummary } from '#/shared/types/post.types'

/** How many articles the archive shows before the reader asks for more. */
export const POST_BATCH_SIZE = 9

export function parsePostPage(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 1

  const page = Number(value)

  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

/** A requested page, clamped to the pages `count` articles actually fill. */
export const clampPostPage = (requested: number | undefined, count: number): number =>
  Math.min(parsePostPage(requested), Math.max(1, Math.ceil(count / POST_BATCH_SIZE)))

/**
 * "Load more" grows one list rather than paging between several, so the page
 * number is a count of batches shown, clamped to what actually exists.
 *
 * The server already paged the list: `items` is exactly what to show, and
 * only the count says whether more exist.
 */
export function getPostBatch(items: PublicPostSummary[], requestedPage: number | undefined, total: number) {
  return {
    page: clampPostPage(requestedPage, total),
    visible: items,
    total,
    hasMore: items.length < total,
  }
}

type Head = {
  meta: Array<{ property?: string; content?: string }>
  links: Array<{ rel?: string; hrefLang?: string; href?: string }>
}

/**
 * The archive's head for `?page=N`.
 *
 * Page 2 onwards is its own page — a longer list the server paged — so its
 * canonical, its alternates and `og:url` name that page instead of pointing at
 * the first one, which search engines read as "this page is a copy of page 1"
 * and drop the older articles it lists. A tag view keeps pointing at the plain
 * archive, as it always has: the tag chips are a filter, not landing pages.
 */
export const listPageHead = <THead extends Head>(head: THead, input: { page: number; tag?: string }): THead => {
  if (input.page <= 1 || input.tag) return head

  const paged = (href: string) => `${href}?page=${input.page}`

  return {
    ...head,
    meta: head.meta.map((entry) =>
      entry.property === 'og:url' && entry.content ? { ...entry, content: paged(entry.content) } : entry,
    ) as THead['meta'],
    links: head.links.map((link) =>
      (link.rel === 'canonical' || (link.rel === 'alternate' && link.hrefLang)) && link.href
        ? { ...link, href: paged(link.href) }
        : link,
    ) as THead['links'],
  }
}
