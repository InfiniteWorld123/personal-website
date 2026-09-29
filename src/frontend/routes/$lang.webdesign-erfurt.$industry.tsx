import { createFileRoute, notFound } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { industryBySlug } from '#/frontend/features/industries/industries'
import { industryHead } from '#/frontend/features/industries/industry-head'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { IndustryPage } from '#/frontend/pages/public/industries/IndustryPages'

/** One industry landing page; the four slugs are fixed in code. */
export const Route = createFileRoute('/$lang/webdesign-erfurt/$industry')({
  loader: ({ params }) => {
    const id = industryBySlug(params.industry)
    if (!id) throw notFound()
    return { id }
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) return {}
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { industries } = getContent(language)
    return industryHead(language, industries.pages[loaderData.id].meta, loaderData.id)
  },
  component: IndustryRoute,
})

function IndustryRoute() {
  return <IndustryPage id={Route.useLoaderData().id} />
}
