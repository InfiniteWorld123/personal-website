import { createFileRoute } from '@tanstack/react-router'
import dashboardCss from '#/frontend/dashboard/dashboard.css?url'
import { ResetPage } from '#/frontend/pages/dashboard/auth/ResetPage'

/**
 * Forgotten password: the request form with no token, the new-password form
 * with one.
 *
 * `login_` escapes the sign-in route's own component as well as the Dashboard
 * layout, so this is a leaf at `/dashboard/login/reset` rather than something
 * rendered inside the sign-in card.
 */
export const Route = createFileRoute('/dashboard_/login_/reset')({
  head: () => ({
    meta: [
      { title: 'Reset your password · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
      // The token is in the query string. This keeps it out of the Referer
      // header of anything this page links to.
      { name: 'referrer', content: 'no-referrer' },
    ],
    links: [{ rel: 'stylesheet', href: dashboardCss }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ResetRoute,
})

function ResetRoute() {
  const { token } = Route.useSearch()

  return <ResetPage token={token ?? null} />
}
