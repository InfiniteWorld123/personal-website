import { createFileRoute } from '@tanstack/react-router'
import { BlogTagsPage } from '#/frontend/pages/dashboard/blog/BlogTagsPage'

/** The curated tag set, named in all three languages. */
export const Route = createFileRoute('/dashboard/blog/tags')({
  head: () => ({
    meta: [
      { title: 'Tags · Blog · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: BlogTagsPage,
})
