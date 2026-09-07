import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { AboutPage } from '#/frontend/pages/public/about/AboutPage'

export const Route = createFileRoute('/$lang/about')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).about
    return buildHead({ language, path: '/about', ...meta })
  },
  component: AboutPage,
})
