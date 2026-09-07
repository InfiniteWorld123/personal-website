import { createFileRoute, redirect } from '@tanstack/react-router'
import { getPreferredLanguage } from '#/frontend/features/i18n/server/getPreferredLanguage'

/** The bare root has no content of its own; it sends visitors to their language. */
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const lang = await getPreferredLanguage()
    throw redirect({ to: '/$lang', params: { lang } })
  },
})
