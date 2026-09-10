import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { StackPage } from '#/frontend/pages/public/stack/StackPage'

export const Route = createFileRoute('/$lang/stack')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).stack
    return buildHead({ language, path: '/stack', ...meta })
  },
  component: StackPage,
})
