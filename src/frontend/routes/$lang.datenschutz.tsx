import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { fetchPublicV2Active } from '#/frontend/features/content/server/public-v2'
import { LegalPage } from '#/frontend/pages/public/legal/LegalPage'

export const Route = createFileRoute('/$lang/datenschutz')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).legal.privacy
    return buildHead({ language, path: '/datenschutz', ...meta })
  },
  // `docs/v2/privacy-v2.md`: the V2 wording as soon as any public module reads Backend2.
  loader: async () => ({ v2: await fetchPublicV2Active() }),
  component: PrivacyRoute,
})

function PrivacyRoute() {
  const { v2 } = Route.useLoaderData()

  return <LegalPage document="privacy" v2Privacy={v2} />
}
