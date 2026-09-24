import { createServerFn } from '@tanstack/react-start'
import * as v from 'valibot'
import type { PublicServiceCard, PublicServiceDetail } from '#/backend2/contracts/service.contract'
import {
  type HomeServicesData,
  type ServicesPageData,
  loadHomeServices,
  loadPublishedService,
  loadPublishedServiceSlugs,
  loadServicesBatch,
  loadServicesPage,
} from './services-source'

export type { HomeServicesData, ServicesPageData }

/**
 * The public services, read on the server while the page renders — the same
 * shortcut the projects and posts loaders take: no HTTP round trip back to our
 * own API. Which backend answers is decided in `services-source.ts`.
 */

/* Spelled out rather than imported, so this file's client stub does not pull a
   validation module into the public bundle. */
const LANGUAGES = ['de', 'en', 'ar'] as const

const LanguageInput = v.object({ language: v.picklist(LANGUAGES) })

const PageInput = v.object({
  language: v.picklist(LANGUAGES),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 1),
})

const BatchInput = v.object({
  language: v.picklist(LANGUAGES),
  offset: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(600)),
  limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(36)),
})

const SlugInput = v.object({
  language: v.picklist(LANGUAGES),
  slug: v.pipe(v.string(), v.maxLength(200)),
})

export const fetchServicesPage = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(PageInput, input))
  .handler(({ data }): Promise<ServicesPageData> => loadServicesPage(data))

/** One further batch for "Load more", from `offset`. */
export const fetchServicesBatch = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(BatchInput, input))
  .handler(({ data }): Promise<{ items: PublicServiceCard[]; total: number }> => loadServicesBatch(data))

export const fetchHomeServices = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(LanguageInput, input))
  .handler(({ data }): Promise<HomeServicesData> => loadHomeServices(data))

/** With the switch off every address answers 404, as it does today. */
export const fetchPublishedService = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(SlugInput, input))
  .handler(({ data }): Promise<PublicServiceDetail | null> => loadPublishedService(data))

/**
 * Every published service address, for the sitemap's `/services/:slug`
 * entries. Legacy has no service pages, so it has none.
 */
export const fetchPublishedServiceSlugs = createServerFn({ method: 'GET' }).handler(
  (): Promise<string[]> => loadPublishedServiceSlugs(),
)
