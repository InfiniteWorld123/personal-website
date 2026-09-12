import { createFileRoute } from '@tanstack/react-router'
import { PostEditPage } from '#/frontend/pages/admin/blog/PostEditPage'

export const Route = createFileRoute('/admin/blog/new')({
  component: () => <PostEditPage id={null} />,
})
