import { createFileRoute } from '@tanstack/react-router'
import { getContent } from '#/frontend/content'
import { contactFormV2 } from '#/frontend/features/contact/contact-v2-lazy'
import { type PlanValue, parsePlan } from '#/frontend/features/services-public/service-page'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
import { buildHead } from '#/frontend/lib/seo'
import { ContactPage } from '#/frontend/pages/public/contact/ContactPage'

/** A service address: what `/services` appends when a visitor asks about a package. */
const PACKAGE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const Route = createFileRoute('/$lang/contact')({
  /*
   * `/services` links here with `?package=gefunden-werden&plan=mieten`, the
   * package and payment model the visitor was looking at. The form does not
   * read them yet — they ride along in the address — so anything that is not a
   * service address or one of the three plans is dropped rather than rejected.
   */
  validateSearch: (search: Record<string, unknown>): { package?: string; plan?: PlanValue } => {
    const selected = search.package

    return {
      package: typeof selected === 'string' && selected.length <= 80 && PACKAGE_PATTERN.test(selected) ? selected : undefined,
      plan: search.plan === undefined ? undefined : parsePlan(search.plan),
    }
  },
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
