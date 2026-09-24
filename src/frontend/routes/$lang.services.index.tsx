import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { parseServicePage } from '#/frontend/features/services-public/service-page'
import { fetchServicesPage } from '#/frontend/features/services-public/server/published-services'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { ServicesPage } from '#/frontend/pages/public/services/ServicesPage'

export const Route = createFileRoute('/$lang/services/')({
  /* As `/work`: a default written into the URL would turn every canonical and
     hreflang for this page into a redirect. */
  validateSearch: (search: Record<string, unknown>): { page?: number } => {
    const page = parseServicePage(search.page)

    return { page: page > 1 ? page : undefined }
  },
  /* The page is read from the location rather than declared as a loader
     dependency, for the reason `/work` gives: "Load more" keeps the list on
     screen and lets it grow. With the switch off the answer is only
     `{ source: 'legacy' }` and the page draws today's services. */
  loader: async ({ params, location }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const page = parseServicePage((location.search as { page?: unknown }).page)

    return { data: await fetchServicesPage({ data: { language, page } }) }
  },
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).services
    return buildHead({ language, path: '/services', ...meta })
  },
  component: ServicesRoute,
})

function ServicesRoute() {
  const { data } = Route.useLoaderData()
  const { page } = Route.useSearch()

  return <ServicesPage data={data} page={page ?? 1} />
}
