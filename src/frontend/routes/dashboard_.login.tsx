import { createFileRoute } from '@tanstack/react-router'
import dashboardCss from '#/frontend/dashboard/dashboard.css?url'
import { SignInPage, safeReturnPath } from '#/frontend/pages/dashboard/auth/SignInPage'

/**
 * V2 sign-in.
 *
 * The trailing underscore on `dashboard_` is what keeps this route out of the
 * `/dashboard` layout — and out of its `beforeLoad` guard. Without it the
 * sign-in screen would sit behind the very check it exists to satisfy, and a
 * signed-out visit would bounce between the two for ever.
 *
 * The stylesheet is linked here for the same reason the Dashboard shell links
 * it: the server should render with it already in the document. Every rule
 * inside is scoped to `[data-dashboard]`, which `AuthShell` sets, so linking
 * it cannot reach the public pages.
 */
export const Route = createFileRoute('/dashboard_/login')({
  head: () => ({
    meta: [
      { title: 'Sign in · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
    links: [{ rel: 'stylesheet', href: dashboardCss }],
  }),
  /**
   * `redirect` is narrowed here and again in `safeReturnPath`. This pass only
   * keeps it a string; the path rules are the component's, so a server render
   * and a client navigation cannot disagree about where a sign-in may land.
   */
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: typeof search.redirect === 'string' ? search.redirect : undefined,
  }),
  component: SignInRoute,
})

function SignInRoute() {
  const { redirect } = Route.useSearch()

  return <SignInPage returnTo={safeReturnPath(redirect)} />
}
