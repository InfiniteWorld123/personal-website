import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { contactFormV2 } from '#/frontend/features/contact/contact-v2-lazy'
import { fetchContactSource } from '#/frontend/features/contact/server/contact-source'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { ContactPage } from '#/frontend/pages/public/contact/ContactPage'

export const Route = createFileRoute('/$lang/contact')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).contact
    return buildHead({ language, path: '/contact', ...meta })
  },
  // Legacy `/api/contact` or Backend2 (`docs/v2/public-cutover.md`, step 6), decided by the server.
  loader: async () => {
    const source = await fetchContactSource()

    if (source.v2) await contactFormV2.preload()

    return source
  },
  component: ContactRoute,
})

function ContactRoute() {
  return <ContactPage v2={Route.useLoaderData().v2} />
}
