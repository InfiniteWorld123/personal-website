import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { HomePage } from '#/frontend/pages/public/home/HomePage'

export const Route = createFileRoute('/$lang/')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).home
    return buildHead({ language, path: '/', ...meta })
  },
  component: HomePage,
})
