import { createServerFn } from '@tanstack/react-start'
import * as v from 'valibot'
import {
  getPublishedPost,
  listPublishedPostSlugs,
  listPublishedPosts,
  listPublishedTags,
} from '#/backend/modules/posts/post.service'
import type { PublicPost, PublicPostSummary, PublicTag } from '#/shared/types/post.types'
import { POST_LANGUAGES } from '#/shared/validation/post.validation'

/**
 * The public pages read their posts on the server, straight from the service.
 * There is no HTTP round trip back to our own API: the page is being rendered
 * on the machine that owns the database.
 */
const LanguageInput = v.object({
  language: v.picklist(POST_LANGUAGES),
  tag: v.optional(v.pipe(v.string(), v.maxLength(100))),
})

const SlugInput = v.object({
  language: v.picklist(POST_LANGUAGES),
  slug: v.pipe(v.string(), v.maxLength(100)),
})

export const fetchPublishedPosts = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(LanguageInput, input))
  .handler(async ({ data }): Promise<PublicPostSummary[]> =>
    listPublishedPosts(data.language, data.tag || undefined),
  )

export const fetchPublishedTags = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(v.object({ language: v.picklist(POST_LANGUAGES) }), input))
  .handler(async ({ data }): Promise<PublicTag[]> => listPublishedTags(data.language))

export const fetchPublishedPost = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(SlugInput, input))
  .handler(async ({ data }): Promise<PublicPost | null> =>
    getPublishedPost(data.language, data.slug),
  )

/** Just the slugs, for the sitemap. */
export const fetchPublishedPostSlugs = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string[]> => listPublishedPostSlugs(),
)
