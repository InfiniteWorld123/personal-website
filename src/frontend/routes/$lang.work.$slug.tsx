import { createFileRoute, notFound } from '@tanstack/react-router'
import { getContent, isProjectSlug } from '#/frontend/content'
import type { ProjectSlug } from '#/frontend/content/types'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { ProjectPage } from '#/frontend/pages/public/work/ProjectPage'

export const Route = createFileRoute('/$lang/work/$slug')({
  beforeLoad: ({ params }) => {
    if (!isProjectSlug(params.slug)) throw notFound()
  },
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    if (!isProjectSlug(params.slug)) return {}

    const { work } = getContent(language)
    const project = work.items[params.slug]

    return buildHead({
      language,
      path: `/work/${params.slug}`,
      title: `${project.name} · ${work.meta.title}`,
      description: project.summary,
    })
  },
  component: ProjectRoute,
})

function ProjectRoute() {
  const { slug } = Route.useParams()

  return <ProjectPage slug={slug as ProjectSlug} />
}
