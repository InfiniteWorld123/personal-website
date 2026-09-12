import { createFileRoute } from '@tanstack/react-router'
import { TagsPage } from '#/frontend/pages/admin/blog/TagsPage'

export const Route = createFileRoute('/admin/blog/tags')({
  component: TagsPage,
})
