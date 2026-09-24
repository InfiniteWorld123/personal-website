import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { contactFormV2 } from '#/frontend/features/contact/contact-v2-lazy'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { ContactPage } from '#/frontend/pages/public/contact/ContactPage'

export const Route = createFileRoute('/$lang/contact')({
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage
    const { meta } = getContent(language).contact
    return buildHead({ language, path: '/contact', ...meta })
  },
  // Backend2's form (`docs/v2/public-cutover.md`, step 6), in its own chunk.
  loader: async () => {
    await contactFormV2.preload()
  },
  component: ContactRoute,
})

function ContactRoute() {
  return <ContactPage />
}
