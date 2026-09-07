import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { PublicShell } from '#/frontend/components/layout/public/PublicShell'
import { isLanguage } from '#/frontend/i18n/language'
import { NotFoundPage } from '#/frontend/pages/public/NotFoundPage'

/**
 * Every public page lives under a language segment. An unknown segment is a
 * 404, not a fallback, so `/foo` never renders German content at a wrong URL.
 */
export const Route = createFileRoute('/$lang')({
  beforeLoad: ({ params }) => {
    if (!isLanguage(params.lang)) throw notFound()
  },
  component: LanguageLayout,
  notFoundComponent: LanguageNotFound,
})

function LanguageLayout() {
  return (
    <PublicShell>
      <Outlet />
    </PublicShell>
  )
}

function LanguageNotFound() {
  const { lang } = Route.useParams()

  return (
    <PublicShell>
      <NotFoundPage language={lang} />
    </PublicShell>
  )
}
