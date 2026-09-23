import { createFileRoute } from '@tanstack/react-router'
import { BlogArticlesPage } from '#/frontend/pages/dashboard/blog/BlogArticlesPage'

/** The owner's articles. `docs/v2/blog.md` owns what they do. */
export const Route = createFileRoute('/dashboard/blog/')({
  head: () => ({
    meta: [
      { title: 'Blog · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: BlogArticlesPage,
})
