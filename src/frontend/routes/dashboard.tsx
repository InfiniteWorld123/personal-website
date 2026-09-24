import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import dashboardCss from '#/frontend/dashboard/dashboard.css?url'
import { DashboardShell } from '#/frontend/dashboard/DashboardShell'
import { getOwnerRouteSession } from '#/frontend/features/auth-v2/server/getOwnerSession'

/**
 * Dashboard V2, the owner's private application.
 *
 * **Guarded by the V2 owner session** (`docs/v2/auth.md`): passkey, or
 * password with an authenticator code. Without one the browser is sent to
 * `/dashboard/login`. The legacy `/admin` and its session were removed on
 * 24 Sep 2026.
 *
 * The stylesheet is linked here rather than imported by a component so the
 * server renders with it already in the document. Every rule inside is scoped
 * to `[data-dashboard]`, so linking it cannot reach the public pages.
 */
export const Route = createFileRoute('/dashboard')({
  head: () => ({
    meta: [
      { title: 'Dashboard · Yaman Warda' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
    links: [{ rel: 'stylesheet', href: dashboardCss }],
  }),
  beforeLoad: async ({ location }) => {
    const owner = await getOwnerRouteSession()

    if (!owner.session) {
      /*
       * `location.href` is this app's own path, and the sign-in screen
       * narrows it again before using it. `/dashboard/login` is outside this
       * route on purpose, so landing there cannot re-enter this guard.
       */
      throw redirect({ to: '/dashboard/login', search: { redirect: location.href } })
    }

    return {
      // The V2 owner record holds an address and no display name; the
      // configured application name is the honest thing to show beside it.
      authSession: { user: { name: 'Yaman Warda', email: owner.session.email } },
    }
  },
  component: DashboardLayoutRoute,
})

function DashboardLayoutRoute() {
  const { authSession } = Route.useRouteContext()

  return (
    <DashboardShell userName={authSession.user.name} userEmail={authSession.user.email}>
      <Outlet />
    </DashboardShell>
  )
}
