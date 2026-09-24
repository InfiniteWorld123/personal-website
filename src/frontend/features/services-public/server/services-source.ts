import type { PublicServiceCard, PublicServiceDetail } from '#/backend2/contracts/service.contract'
import {
  readV2HomeServices,
  readV2ServiceBatch,
  readV2Service,
  readV2ServiceSlugs,
  readV2ServicesPage,
} from './v2-services'

/**
 * The public services, read from Backend2.
 *
 * Plain functions so they can be tested without the server-function runtime;
 * `published-services.ts` wraps each one for the pages.
 */

type Language = 'de' | 'en' | 'ar'

export type ServicesPageData =
  | { source: 'v2'; status: 'ok'; items: PublicServiceCard[]; total: number }
  /** The list could not be read: `/services` says so and offers a retry. */
  | { source: 'v2'; status: 'error' }

export type HomeServicesData = { source: 'v2'; items: PublicServiceCard[] }

export const loadServicesPage = async (input: { language: Language; page: number }): Promise<ServicesPageData> => {
  try {
    return { source: 'v2', status: 'ok', ...(await readV2ServicesPage(input.language, input.page)) }
  } catch (error) {
    console.error('Public services could not be read from Backend2', error)

    return { source: 'v2', status: 'error' }
  }
}

/** One further batch for "Load more": `offset` is how many are on screen. */
export const loadServicesBatch = async (input: {
  language: Language
  offset: number
  limit: number
}): Promise<{ items: PublicServiceCard[]; total: number }> => {
  return readV2ServiceBatch(input.language, input.offset, input.limit)
}

/**
 * The homepage section. A failure hides the section silently, like an empty
 * one: the homepage does not tell a visitor that something broke (Design Lab).
 */
export const loadHomeServices = async (input: { language: Language }): Promise<HomeServicesData> => {
  try {
    return { source: 'v2', items: await readV2HomeServices(input.language) }
  } catch (error) {
    console.error('Homepage services could not be read from Backend2', error)

    return { source: 'v2', items: [] }
  }
}

/** One service page, or null for a 404. */
export const loadPublishedService = async (input: {
  language: Language
  slug: string
}): Promise<PublicServiceDetail | null> => {
  return readV2Service(input.language, input.slug)
}

/** Every published service address, for the sitemap. */
export const loadPublishedServiceSlugs = async (): Promise<string[]> => {
  return readV2ServiceSlugs()
}
