import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { type PlanValue, parsePlan, parseServicePage } from '#/frontend/features/services-public/service-page'
import { fetchServicesPage } from '#/frontend/features/services-public/server/published-services'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { structuredPackagesOf } from '#/frontend/lib/structured-data'
import { ServicesPage } from '#/frontend/pages/public/services/ServicesPage'

export const Route = createFileRoute('/$lang/services/')({
  /* As `/work`: a default written into the URL would turn every canonical and
     hreflang for this page into a redirect. */
  validateSearch: (search: Record<string, unknown>): { page?: number; plan?: PlanValue } => {
    const page = parseServicePage(search.page)
    const plan = parsePlan(search.plan)

    // `?plan=kaufen` is the page's own default, so it is not written back.
    return { page: page > 1 ? page : undefined, plan: plan === 'kaufen' ? undefined : plan }
  },
  /* The page is read from the location rather than declared as a loader
     dependency, for the reason `/work` gives: "Load more" keeps the list on
     screen and lets it grow. */
  loader: async ({ params, location }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const page = parseServicePage((location.search as { page?: unknown }).page)

    return { data: await fetchServicesPage({ data: { language, page } }) }
  },
  /* The canonical address is always the bare `/services`: `buildHead` takes a
     path, never the query, so `?plan=` and `?page=` variants all point back to
     it and no new URL is announced. The packages' prices go into the JSON-LD. */
  head: ({ params, loaderData }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).services
    const data = loaderData?.data
    const packages = data?.status === 'ok' ? structuredPackagesOf(data.items) : []

    return buildHead({ language, path: '/services', ...meta, packages })
  },
  component: ServicesRoute,
})

function ServicesRoute() {
  const { data } = Route.useLoaderData()
  const { page, plan } = Route.useSearch()

  return <ServicesPage data={data} page={page ?? 1} plan={plan ?? 'kaufen'} />
}
