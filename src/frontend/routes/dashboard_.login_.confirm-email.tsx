import { createFileRoute } from '@tanstack/react-router'
import dashboardCss from '#/frontend/dashboard/dashboard.css?url'
import { ConfirmEmailPage } from '#/frontend/pages/dashboard/auth/ResetPage'

/**
 * Where the confirmation link for a new sign-in address lands.
 *
 * Outside the Dashboard guard, like the reset page: confirming revokes every
 * session, and the owner may well be reading the mail on a device that was
 * never signed in.
 */
export const Route = createFileRoute('/dashboard_/login_/confirm-email')({
  head: () => ({
    meta: [
      { title: 'Confirm your email · Dashboard' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'referrer', content: 'no-referrer' },
    ],
    links: [{ rel: 'stylesheet', href: dashboardCss }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ConfirmEmailRoute,
})

function ConfirmEmailRoute() {
  const { token } = Route.useSearch()

  return <ConfirmEmailPage token={token ?? null} />
}
