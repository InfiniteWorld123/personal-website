import { createFileRoute } from '@tanstack/react-router'
import { BlogCommentsPage } from '#/frontend/pages/dashboard/blog/BlogCommentsPage'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every comment, newest first. `?post=` narrows to one article, `?status=new` to the unseen. */
export const Route = createFileRoute('/dashboard/blog/comments')({
  validateSearch: (search: Record<string, unknown>): { post?: string; status?: 'new' } => ({
    post: typeof search.post === 'string' && UUID.test(search.post) ? search.post : undefined,
    status: search.status === 'new' ? 'new' : undefined,
  }),
  head: () => ({
    meta: [
      { title: 'Comments · Blog · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: BlogCommentsPage,
})
