import { Outlet, createFileRoute, notFound } from '@tanstack/react-router'
import { PublicShell } from '#/frontend/components/layout/public/PublicShell'
import { fetchPublishedContent } from '#/frontend/features/content/server/published-content'
import { useContentOverrides } from '#/frontend/features/content/use-published-content'
import { isLanguage } from '#/frontend/i18n/language'
import { NotFoundPage } from '#/frontend/pages/public/NotFoundPage'

/**
 * Every public page lives under a language segment. An unknown segment is a
 * 404, not a fallback, so `/foo` never renders German content at a wrong URL.
 *
 * This is also where the copy the owner has published is put in front of the
 * copy in the repository (B6). It loads here rather than per page because
 * every page under this route needs it, including the shell around them.
 */
export const Route = createFileRoute('/$lang')({
  beforeLoad: ({ params }) => {
    if (!isLanguage(params.lang)) throw notFound()
  },
  loader: async () => ({ published: await fetchPublishedContent() }),
  component: LanguageLayout,
  notFoundComponent: LanguageNotFound,
})

function LanguageLayout() {
  const { published } = Route.useLoaderData()

  useContentOverrides(published)

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
