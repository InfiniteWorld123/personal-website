import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { ContactPage } from '#/frontend/pages/public/contact/ContactPage'

export const Route = createFileRoute('/$lang/contact')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).contact
    return buildHead({ language, path: '/contact', ...meta })
  },
  component: ContactPage,
})
