import { withRequestScope } from '#/backend2/db/client'
import { ApiError } from '#/backend2/http/error'
import {
  PUBLIC_SERVICE_BATCH,
  type Language,
  type PublicServiceCard,
  type PublicServiceDetail,
} from '#/backend2/contracts/service.contract'
import { listPublishedServiceSlugs } from '#/backend2/modules/services/service.public-slugs'
import { listPublicServices, readPublicService } from '#/backend2/modules/services/service.service'
import { HOME_SERVICE_LIMIT, SERVICE_BATCH_SIZE } from '../service-words'

/**
 * Backend2's published services for the public pages
 * (`docs/v2/public-cutover.md` step 2).
 *
 * Server only: the server functions in `published-services.ts` call these in
 * their handlers, which the client bundle never contains. Every read goes
 * through the module's public service functions, which join the published
 * version alone — a saved-but-unpublished price is never read, not filtered.
 */

/** `/services` up to and including `?page=`, in bounded batches, and how many exist. */
export const readV2ServicesPage = async (
  language: Language,
  page: number,
): Promise<{ items: PublicServiceCard[]; total: number }> => {
  const wanted = Math.min(page * SERVICE_BATCH_SIZE, PUBLIC_SERVICE_BATCH.maxOffset)
  const items: PublicServiceCard[] = []
  let total = 0

  for (let offset = 0; offset < wanted; offset += PUBLIC_SERVICE_BATCH.max) {
    const limit = Math.min(PUBLIC_SERVICE_BATCH.max, wanted - offset)
    const batch = await withRequestScope(() =>
      listPublicServices({ language, offset, limit, featured: 'all' }),
    )

    total = batch.total
    items.push(...batch.items)

    if (!batch.hasMore) break
  }

  return { items, total }
}

/** One further batch, for "Load more": only the services not yet on screen. */
export const readV2ServiceBatch = async (
  language: Language,
  offset: number,
  limit: number,
): Promise<{ items: PublicServiceCard[]; total: number }> => {
  const batch = await withRequestScope(() =>
    listPublicServices({
      language,
      offset: Math.min(offset, PUBLIC_SERVICE_BATCH.maxOffset),
      limit: Math.min(Math.max(limit, PUBLIC_SERVICE_BATCH.min), PUBLIC_SERVICE_BATCH.max),
      featured: 'all',
    }),
  )

  return { items: batch.items, total: batch.total }
}

/** The homepage: starred, published, in the owner's order, at most six (choice 1A). */
export const readV2HomeServices = async (language: Language): Promise<PublicServiceCard[]> => {
  const batch = await withRequestScope(() =>
    listPublicServices({ language, offset: 0, limit: HOME_SERVICE_LIMIT, featured: 'only' }),
  )

  return batch.items
}

/** One published service by any address it was published under, or null for a 404. */
export const readV2Service = async (
  language: Language,
  slug: string,
): Promise<PublicServiceDetail | null> => {
  try {
    return await withRequestScope(() => readPublicService({ language, slug }))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null

    throw error
  }
}

export const readV2ServiceSlugs = (): Promise<string[]> => withRequestScope(listPublishedServiceSlugs)
