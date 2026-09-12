import type { PublicPostSummary } from '#/shared/types/post.types'

/** How many articles the archive shows before the reader asks for more. */
export const POST_BATCH_SIZE = 9

export function parsePostPage(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 1

  const page = Number(value)

  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

/**
 * "Load more" grows one list rather than paging between several, so the page
 * number is a count of batches shown, clamped to what actually exists.
 */
export function getPostBatch(items: PublicPostSummary[], requestedPage?: number) {
  const page = Math.min(
    parsePostPage(requestedPage),
    Math.max(1, Math.ceil(items.length / POST_BATCH_SIZE)),
  )
  const visible = items.slice(0, page * POST_BATCH_SIZE)

  return { page, visible, hasMore: visible.length < items.length }
}
