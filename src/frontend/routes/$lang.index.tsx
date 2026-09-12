import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { fetchPublishedPosts } from '#/frontend/features/blog/server/published-posts'
import { fetchPublishedProjects } from '#/frontend/features/work/server/published-projects'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { HomePage } from '#/frontend/pages/public/home/HomePage'

export const Route = createFileRoute('/$lang/')({
  loader: async ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    const [entries, posts] = await Promise.all([
      fetchPublishedProjects({ data: { language } }),
      fetchPublishedPosts({ data: { language } }),
    ])

    return { entries, posts }
  },
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).home
    return buildHead({ language, path: '/', ...meta })
  },
  component: HomeRoute,
})

function HomeRoute() {
  const { entries, posts } = Route.useLoaderData()

  return <HomePage entries={entries} posts={posts} />
}
