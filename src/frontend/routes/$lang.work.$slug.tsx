import { createFileRoute, notFound } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { toStructuredProject } from '#/frontend/features/work/project-list'
import { fetchPublishedProject } from '#/frontend/features/work/server/published-projects'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { ProjectPage } from '#/frontend/pages/public/work/ProjectPage'

export const Route = createFileRoute('/$lang/work/$slug')({
  loader: async ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const entry = await fetchPublishedProject({ data: { language, slug: params.slug } })

    // An unpublished or deleted project is a 404, not an empty page.
    if (!entry) throw notFound()

    return { entry }
  },
  head: ({ params, loaderData }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    if (!loaderData) return {}

    const { work } = getContent(language)
    const { copy } = loaderData.entry

    return buildHead({
      language,
      path: `/work/${params.slug}`,
      title: `${copy.name} · ${work.meta.title}`,
      description: copy.summary,
      projects: [toStructuredProject(loaderData.entry)],
    })
  },
  component: ProjectRoute,
})

function ProjectRoute() {
  return <ProjectPage entry={Route.useLoaderData().entry} />
}
