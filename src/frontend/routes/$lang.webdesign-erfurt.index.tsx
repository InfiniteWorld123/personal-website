import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { industryHead } from '#/frontend/features/industries/industry-head'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { IndustriesHubPage } from '#/frontend/pages/public/industries/IndustryPages'

/** The hub of the industry landing pages (owner brief, 29 Sep 2026). */
export const Route = createFileRoute('/$lang/webdesign-erfurt/')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { industries } = getContent(language)
    return industryHead(language, industries.hub.meta, undefined)
  },
  component: IndustriesHubPage,
})
