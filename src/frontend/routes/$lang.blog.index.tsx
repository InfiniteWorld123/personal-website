import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { clampPostPage, listPageHead, parsePostPage } from '#/frontend/features/blog/post-list'
import {
  type PostPage,
  fetchPublishedPostPage,
  fetchPublishedTags,
} from '#/frontend/features/blog/server/published-posts'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import type { PublicTag } from '#/shared/types/post.types'
import { BlogPage } from '#/frontend/pages/public/blog/BlogPage'

/**
 * The last legacy list this browser loaded.
 *
 * Legacy hands the archive every post at once and "Load more" only reveals
 * more of it, so a page change must not cost a round trip it never used to.
 * Backend2 pages on the server, so there a page change is a new request.
 * Browser only: on the server a module variable would be shared between
 * visitors.
 */
let lastLegacy: { key: string; list: PostPage; tags: PublicTag[] } | undefined

export const Route = createFileRoute('/$lang/blog/')({
  /*
   * `page` is left OFF the search when it is the first page.
   *
   * Returning 1 here made the router rewrite `/de/blog` to `/de/blog?page=1`
   * with a 307 — so the canonical, all three hreflang alternates and the
   * sitemap entry all pointed at a URL that redirected, which Search Console
   * reads as "page with redirect" and as a canonical disagreeing with itself.
   * `parsePostPage` still floors everything else at 1 for the page component.
   */
  validateSearch: (search: Record<string, unknown>): { page?: number; tag?: string } => {
    const page = parsePostPage(search.page)

    return {
      page: page > 1 ? page : undefined,
      tag: typeof search.tag === 'string' && search.tag.trim() !== '' ? search.tag.trim() : undefined,
    }
  },
  // The tag and the page are both part of what the loader fetches when the
  // archive is paged on the server, so a change to either re-runs it.
  loaderDeps: ({ search }) => ({ tag: search.tag, page: search.page ?? 1 }),
  loader: async ({ params, deps }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const key = `${language}|${deps.tag ?? ''}`

    // Only for "Load more" (page 2 onwards): arriving at the archive afresh
    // still asks the server, so a newly published post is not kept out.
    if (typeof window !== 'undefined' && deps.page > 1 && lastLegacy?.key === key) {
      const page = clampPostPage(deps.page, lastLegacy.list.posts.length)

      return { list: { ...lastLegacy.list, page }, tags: lastLegacy.tags }
    }

    const [list, tags] = await Promise.all([
      fetchPublishedPostPage({ data: { language, tag: deps.tag, page: deps.page } }),
      fetchPublishedTags({ data: { language } }),
    ])

    if (typeof window !== 'undefined') {
      lastLegacy = list.source === 'legacy' ? { key, list, tags } : undefined
    }

    return { list, tags }
  },
  head: ({ params, loaderData, match }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).blog

    return listPageHead(buildHead({ language, path: '/blog', ...meta }), {
      page: loaderData?.list.page ?? match.search.page ?? 1,
      tag: match.search.tag,
    })
  },
  component: BlogRoute,
})

function BlogRoute() {
  const { list, tags } = Route.useLoaderData()

  return <BlogPage posts={list.posts} total={list.total} tags={tags} />
}
