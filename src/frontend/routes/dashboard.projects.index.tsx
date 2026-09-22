import { createFileRoute } from '@tanstack/react-router'
import { ProjectsPage } from '#/frontend/pages/dashboard/projects/ProjectsPage'

/**
 * Projects, built. This route replaced the shared "not built yet" screen when
 * the module landed; `docs/v2/projects.md` owns what it does.
 */
export const Route = createFileRoute('/dashboard/projects/')({
  head: () => ({
    meta: [
      { title: 'Projects · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ProjectsPage,
})
