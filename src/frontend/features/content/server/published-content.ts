import { createServerFn } from '@tanstack/react-start'
import { withRequestScope } from '#/backend/db/client'
import { listPublishedContent } from '#/backend/modules/content/content.service'
import type { PublishedContent } from '#/shared/types/content.types'

/**
 * The published overrides, read on the server while the page renders — the
 * same shortcut the projects and posts loaders take, for the same reason: the
 * machine rendering the page owns the database, so there is no HTTP round trip
 * back to our own API.
 *
 * Cached for a few seconds because every public page render asks. Copy that
 * takes half a minute to appear is a fair trade for not putting a query in
 * front of every visitor; the admin's own preview does not come through here,
 * so the owner still sees his wording immediately.
 */
const CACHE_MS = 30_000

let cached: { at: number; value: PublishedContent } | undefined

const readPublishedContent = async (): Promise<PublishedContent> => {
  const now = Date.now()

  if (cached && now - cached.at < CACHE_MS) return cached.value

  const value = await withRequestScope(() => listPublishedContent())
  cached = { at: now, value }

  return value
}

export const fetchPublishedContent = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublishedContent> => readPublishedContent(),
)

/** Drops the cache so the next render sees what was just published. */
export const forgetPublishedContent = () => {
  cached = undefined
}
