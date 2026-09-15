import { createFileRoute } from '@tanstack/react-router'
import { fetchPublishedPosts } from '#/frontend/features/blog/server/published-posts'
import { fetchPublishedProjects } from '#/frontend/features/work/server/published-projects'
import { ContentPage } from '#/frontend/pages/admin/content/ContentPage'

/**
 * The canvas is the real landing page, so it needs what the real landing page
 * is given: the published case studies and articles. Loaded in German because
 * the editor opens there; switching language swaps the copy, and a project's
 * own name and screenshots are the same in all three.
 */
export const Route = createFileRoute('/admin/content')({
  loader: async () => {
    const [entries, posts] = await Promise.all([
      fetchPublishedProjects({ data: { language: 'de' } }),
      fetchPublishedPosts({ data: { language: 'de' } }),
    ])

    return { entries, posts }
  },
  component: ContentRoute,
})

function ContentRoute() {
  const { entries, posts } = Route.useLoaderData()

  return <ContentPage entries={entries} posts={posts} />
}
