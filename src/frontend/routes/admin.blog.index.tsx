import { createFileRoute } from '@tanstack/react-router'
import { validatePostSearch } from '#/frontend/features/blog/post-filters'
import { PostsPage } from '#/frontend/pages/admin/blog/PostsPage'

export const Route = createFileRoute('/admin/blog/')({
  validateSearch: validatePostSearch,
  component: PostsRoute,
})

function PostsRoute() {
  return <PostsPage search={Route.useSearch()} />
}
