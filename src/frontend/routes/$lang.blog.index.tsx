import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { parsePostPage } from '#/frontend/features/blog/post-list'
import {
  fetchPublishedPosts,
  fetchPublishedTags,
} from '#/frontend/features/blog/server/published-posts'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { BlogPage } from '#/frontend/pages/public/blog/BlogPage'

export const Route = createFileRoute('/$lang/blog/')({
  validateSearch: (search: Record<string, unknown>): { page?: number; tag?: string } => ({
    page: parsePostPage(search.page),
    tag: typeof search.tag === 'string' && search.tag.trim() !== '' ? search.tag.trim() : undefined,
  }),
  // The tag is part of what the loader fetches, so a change to it has to
  // re-run the loader rather than only re-render the page.
  loaderDeps: ({ search }) => ({ tag: search.tag }),
  loader: async ({ params, deps }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    const [posts, tags] = await Promise.all([
      fetchPublishedPosts({ data: { language, tag: deps.tag } }),
      fetchPublishedTags({ data: { language } }),
    ])

    return { posts, tags }
  },
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).blog

    return buildHead({ language, path: '/blog', ...meta })
  },
  component: BlogRoute,
})

function BlogRoute() {
  const { posts, tags } = Route.useLoaderData()

  return <BlogPage posts={posts} tags={tags} />
}
