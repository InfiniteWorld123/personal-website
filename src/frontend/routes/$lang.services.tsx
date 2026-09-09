import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { ServicesPage } from '#/frontend/pages/public/services/ServicesPage'

export const Route = createFileRoute('/$lang/services')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).services
    return buildHead({ language, path: '/services', ...meta })
  },
  component: ServicesPage,
})
