import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { LegalPage } from '#/frontend/pages/public/legal/LegalPage'

export const Route = createFileRoute('/$lang/datenschutz')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).legal.privacy
    return buildHead({ language, path: '/datenschutz', ...meta })
  },
  component: () => <LegalPage document="privacy" />,
})
