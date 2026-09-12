import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { fetchPublishedProjects } from '#/frontend/features/work/server/published-projects'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { HomePage } from '#/frontend/pages/public/home/HomePage'

export const Route = createFileRoute('/$lang/')({
  loader: async ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    return { entries: await fetchPublishedProjects({ data: { language } }) }
  },
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).home
    return buildHead({ language, path: '/', ...meta })
  },
  component: HomeRoute,
})

function HomeRoute() {
  return <HomePage entries={Route.useLoaderData().entries} />
}
