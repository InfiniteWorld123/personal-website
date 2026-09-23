import { createServerFn } from '@tanstack/react-start'
import { withRequestScope } from '#/backend/db/client'
import { listPublishedContent } from '#/backend/modules/content/content.service'
import { withRequestScope as withV2RequestScope } from '#/backend2/db/client'
import { readPublishedOverrides } from '#/backend2/modules/content/content.published'
import { readsFromV2 } from '#/backend2/public-source'
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

let cached: { at: number; source: 'legacy' | 'v2'; value: PublishedContent } | undefined

const readPublishedContent = async (): Promise<PublishedContent> => {
  const now = Date.now()
  // `docs/v2/public-cutover.md` step 1, switched by PUBLIC_V2_MODULES.
  const source = readsFromV2('content') ? 'v2' : 'legacy'

  /*
   * Backend2 is not cached here: its Dashboard reports a save as "live", and a
   * Worker cannot tell another isolate to drop a copy. One small indexed read
   * of the owner's saved rows per render keeps that promise.
   */
  if (source === 'v2') return withV2RequestScope(readPublishedOverrides)

  if (cached && cached.source === source && now - cached.at < CACHE_MS) return cached.value

  const value = await withRequestScope(() => listPublishedContent())
  cached = { at: now, source, value }

  return value
}

export const fetchPublishedContent = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublishedContent> => readPublishedContent(),
)

/** Drops the cache so the next render sees what was just published. */
export const forgetPublishedContent = () => {
  cached = undefined
}
