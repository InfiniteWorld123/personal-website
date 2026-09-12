import { createFileRoute } from '@tanstack/react-router'
import { PostEditPage } from '#/frontend/pages/admin/blog/PostEditPage'

export const Route = createFileRoute('/admin/blog/$id')({
  component: PostEditRoute,
})

function PostEditRoute() {
  return <PostEditPage id={Route.useParams().id} />
}
