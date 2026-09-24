import { createServerFn } from '@tanstack/react-start'
import { withRequestScope } from '#/backend2/db/client'
import { readPublishedOverrides } from '#/backend2/modules/content/content.published'
import type { PublishedContent } from '#/shared/types/content.types'

/**
 * The owner's saved wording from Backend2, read on the server while the page
 * renders — the machine rendering the page owns the database, so there is no
 * HTTP round trip back to our own API.
 *
 * Not cached: the Dashboard reports a save as "live", and a Worker cannot
 * tell another isolate to drop a copy. One small indexed read of the owner's
 * saved rows per render keeps that promise.
 */
export const fetchPublishedContent = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PublishedContent> => withRequestScope(readPublishedOverrides),
)
