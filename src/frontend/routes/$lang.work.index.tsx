import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { parseProjectPage, toStructuredProject } from '#/frontend/features/work/project-list'
import { fetchProjectsPage } from '#/frontend/features/work/server/published-projects'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { WorkPage } from '#/frontend/pages/public/work/WorkPage'

export const Route = createFileRoute('/$lang/work/')({
  /* Same as the blog archive: a default that is written into the URL turns
     every canonical and hreflang for this page into a redirect. */
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = parseProjectPage(search.page)

    return { page: page > 1 ? page : undefined }
  },
  /* The page is read from the location rather than declared as a loader
     dependency: a dependency would make every "Load more" a new match that
     waits for its data, where today the list stays on screen and grows. */
  loader: async ({ params, location }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const page = parseProjectPage((location.search as { page?: unknown }).page)

    return fetchProjectsPage({ data: { language, page } })
  },
  head: ({ params, loaderData }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).work

    return buildHead({
      language,
      path: '/work',
      ...meta,
      // The head is built before the loader resolves on the first render, so
      // the list node is simply absent then rather than wrong.
      projects: loaderData?.entries.map(toStructuredProject) ?? [],
    })
  },
  component: WorkRoute,
})

function WorkRoute() {
  const { entries, total } = Route.useLoaderData()

  return <WorkPage entries={entries} total={total} />
}
