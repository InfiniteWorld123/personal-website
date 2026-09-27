import { createFileRoute, redirect } from '@tanstack/react-router'
import { getPreferredLanguage } from '#/frontend/features/i18n/server/getPreferredLanguage'

/**
 * The bare root has no content of its own; it sends visitors to their
 * language. The redirect is temporary (302) because the answer depends on the
 * visitor, so neither browsers nor search engines should remember it.
 */
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const lang = await getPreferredLanguage()
    throw redirect({ to: '/$lang', params: { lang }, statusCode: 302 })
  },
})
