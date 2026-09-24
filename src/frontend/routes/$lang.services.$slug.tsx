import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { fetchPublishedService } from '#/frontend/features/services-public/server/published-services'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { ServiceDetailPage } from '#/frontend/pages/public/services/ServiceDetailPage'

/**
 * One service's own page, approved in the Services Design Lab
 * (`docs/v2/services.md`). It exists only while the switch reads services
 * from Backend2; with it off every address here is a 404, as it is today.
 */
export const Route = createFileRoute('/$lang/services/$slug')({
  loader: async ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const service = await fetchPublishedService({ data: { language, slug: params.slug } })

    // A draft, a service that was taken down and a deleted one are all a 404.
    if (!service) throw notFound()

    // An address the service was published under before moves to the current one.
    if (service.canonicalSlug !== params.slug) {
      throw redirect({
        to: '/$lang/services/$slug',
        params: { lang: language, slug: service.canonicalSlug },
        statusCode: 301,
      })
    }

    return { service }
  },
  head: ({ params, loaderData }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    if (!loaderData) return {}

    const { service } = loaderData
    // The owner's own search title stands as written; the fallback — the
    // service's name — is placed the way the blog places an article's title.
    const title =
      service.seo.title === service.name
        ? `${service.name} · ${getContent(language).services.eyebrow}`
        : service.seo.title

    return buildHead({
      language,
      path: `/services/${service.canonicalSlug}`,
      title,
      description: service.seo.description,
    })
  },
  component: ServiceRoute,
})

function ServiceRoute() {
  return <ServiceDetailPage service={Route.useLoaderData().service} />
}
