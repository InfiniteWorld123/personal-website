import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { listPageHead, parsePostPage } from '#/frontend/features/blog/post-list'
import { fetchPublishedPostPage, fetchPublishedTags } from '#/frontend/features/blog/server/published-posts'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { BlogPage } from '#/frontend/pages/public/blog/BlogPage'

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
  // The tag and the page are both part of what the loader fetches — the
  // archive is paged on the server — so a change to either re-runs it.
  loaderDeps: ({ search }) => ({ tag: search.tag, page: search.page ?? 1 }),
  loader: async ({ params, deps }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const [list, tags] = await Promise.all([
      fetchPublishedPostPage({ data: { language, tag: deps.tag, page: deps.page } }),
      fetchPublishedTags({ data: { language } }),
    ])

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
