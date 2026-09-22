import { createFileRoute } from '@tanstack/react-router'
import { ProjectEditorPage } from '#/frontend/pages/dashboard/projects/ProjectEditorPage'

/** One project, and everything about it, on one page. */
export const Route = createFileRoute('/dashboard/projects/$projectId')({
  head: () => ({
    meta: [
      { title: 'Edit project · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ProjectEditorPage,
})
