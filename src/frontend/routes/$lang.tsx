import { Outlet, createFileRoute, notFound, useRouter, useRouterState } from '@tanstack/react-router'
import { PublicShell, useInsidePublicShell } from '#/frontend/components/layout/public/PublicShell'
import { fetchPublishedContent } from '#/frontend/features/content/server/published-content'
import { useContentOverrides } from '#/frontend/features/content/use-published-content'
import {
  CloudflareBeacon,
  loadBeaconToken,
  rememberBeaconToken,
} from '#/frontend/features/web-analytics/CloudflareBeacon'
import { getContent } from '#/frontend/content'
import { site } from '#/frontend/content/site'
import { defaultLanguage, isLanguage } from '#/frontend/i18n/language'
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
  loader: async () => {
    const [published, beacon] = await Promise.all([fetchPublishedContent(), loadBeaconToken()])

    return { published, beacon }
  },
  component: LanguageLayout,
  notFoundComponent: LanguageNotFound,
  /*
   * A 404 with an empty `<title>` is a soft-404 signal and an unreadable tab.
   * The wording is the page's own, already written in all three languages.
   * `noindex` matters more than the title: without it a mistyped URL that
   * still returns markup is a candidate for the index.
   */
  head: ({ params }) => {
    const language = isLanguage(params.lang) ? params.lang : defaultLanguage

    return {
      meta: [
        { title: `${getContent(language).notFound.title} · ${site.name}` },
        { name: 'robots', content: 'noindex, follow' },
      ],
    }
  },
})

function LanguageLayout() {
  const { published, beacon } = Route.useLoaderData()
  const router = useRouter()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const nonce = typeof router.options.ssr === 'object' ? router.options.ssr.nonce : undefined

  useContentOverrides(published)
  rememberBeaconToken(beacon)

  return (
    <>
      <PublicShell>
        <Outlet />
      </PublicShell>
      <CloudflareBeacon token={beacon} pathname={pathname} nonce={nonce} />
    </>
  )
}

/*
 * Two ways to land here. An unknown page below a known language renders inside
 * the layout's `<Outlet />`, already in the shell — a second one would repeat
 * the header and footer. An unknown language, or a page whose loader found
 * nothing, renders instead of the layout and has to bring the shell itself.
 */
function LanguageNotFound() {
  const { lang } = Route.useParams()
  const page = <NotFoundPage language={lang} />

  return useInsidePublicShell() ? page : <PublicShell>{page}</PublicShell>
}
