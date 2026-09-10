import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { FaqPage } from '#/frontend/pages/public/faq/FaqPage'

export const Route = createFileRoute('/$lang/faq')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).faq
    return buildHead({ language, path: '/faq', ...meta })
  },
  component: FaqPage,
})
