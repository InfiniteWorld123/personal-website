import type { PublicServiceCard, PublicServiceDetail } from '#/backend2/contracts/service.contract'
import { readsFromV2 } from '#/backend2/public-source'
import {
  readV2HomeServices,
  readV2ServiceBatch,
  readV2Service,
  readV2ServiceSlugs,
  readV2ServicesPage,
} from './v2-services'

/**
 * Where the public services come from, decided per request
 * (`docs/v2/public-cutover.md` step 2, PUBLIC_V2_MODULES=services).
 *
 * Plain functions so the switch can be tested without the server-function
 * runtime; `published-services.ts` wraps each one for the pages. Off — the
 * default — they answer `{ source: 'legacy' }` (or nothing) and the pages draw
 * today's static services exactly as before.
 */

type Language = 'de' | 'en' | 'ar'

export type ServicesPageData =
  | { source: 'legacy' }
  | { source: 'v2'; status: 'ok'; items: PublicServiceCard[]; total: number }
  /** The list could not be read: `/services` says so and offers a retry. */
  | { source: 'v2'; status: 'error' }

export type HomeServicesData = { source: 'legacy' } | { source: 'v2'; items: PublicServiceCard[] }

export const loadServicesPage = async (input: { language: Language; page: number }): Promise<ServicesPageData> => {
  if (!readsFromV2('services')) return { source: 'legacy' }

  try {
    return { source: 'v2', status: 'ok', ...(await readV2ServicesPage(input.language, input.page)) }
  } catch (error) {
    console.error('Public services could not be read from Backend2', error)

    return { source: 'v2', status: 'error' }
  }
}

/**
 * One further batch for "Load more": `offset` is how many are on screen.
 * Legacy has no list to page, so it has nothing to add.
 */
export const loadServicesBatch = async (input: {
  language: Language
  offset: number
  limit: number
}): Promise<{ items: PublicServiceCard[]; total: number }> => {
  if (!readsFromV2('services')) return { items: [], total: 0 }

  return readV2ServiceBatch(input.language, input.offset, input.limit)
}

/**
 * The homepage section. A failure hides the section silently, like an empty
 * one: the homepage does not tell a visitor that something broke (Design Lab).
 */
export const loadHomeServices = async (input: { language: Language }): Promise<HomeServicesData> => {
  if (!readsFromV2('services')) return { source: 'legacy' }

  try {
    return { source: 'v2', items: await readV2HomeServices(input.language) }
  } catch (error) {
    console.error('Homepage services could not be read from Backend2', error)

    return { source: 'v2', items: [] }
  }
}

/** One service page, or null for a 404. Legacy has no service pages: always null. */
export const loadPublishedService = async (input: {
  language: Language
  slug: string
}): Promise<PublicServiceDetail | null> => {
  if (!readsFromV2('services')) return null

  return readV2Service(input.language, input.slug)
}

/** Every published service address, for the sitemap. Legacy has none. */
export const loadPublishedServiceSlugs = async (): Promise<string[]> => {
  if (!readsFromV2('services')) return []

  return readV2ServiceSlugs()
}
