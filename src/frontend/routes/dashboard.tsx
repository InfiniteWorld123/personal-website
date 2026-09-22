import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import dashboardCss from '#/frontend/dashboard/dashboard.css?url'
import { DashboardShell } from '#/frontend/dashboard/DashboardShell'
import { getAuthRouteSession } from '#/frontend/features/auth/server/getAuthRouteSession'
import { getOwnerRouteSession } from '#/frontend/features/auth-v2/server/getOwnerSession'

/**
 * Dashboard V2.
 *
 * It lives beside `/admin`, not on top of it: the legacy admin, the legacy
 * backend and the legacy database all keep running untouched until a cutover
 * is planned and verified. Nothing under this route reads or writes anything
 * they own.
 *
 * **The guard has two positions.** Auth V2 exists and is tested, but
 * `docs/v2/auth.md` is explicit that the existing protection stays until a
 * reviewed switch replaces it — so `BACKEND2_OWNER_AUTH=required` is what
 * moves this route from the legacy admin session to the V2 owner session, and
 * it is absent by default. Both positions are guarded; neither is open.
 *
 * The data behind these screens is still a fixture, and every screen says so.
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

    if (owner.mode === 'v2') {
      if (!owner.session) {
        /*
         * `location.href` is this app's own path, and the sign-in screen
         * narrows it again before using it. `/dashboard/login` is outside this
         * route on purpose, so landing there cannot re-enter this guard.
         */
        throw redirect({ to: '/dashboard/login', search: { redirect: location.href } })
      }

      return {
        sessionKind: 'v2' as const,
        // The V2 owner record holds an address and no display name; the
        // configured application name is the honest thing to show beside it.
        authSession: { user: { name: 'Yaman Warda', email: owner.session.email } },
      }
    }

    const authSession = await getAuthRouteSession()

    if (!authSession) {
      throw redirect({ to: '/admin/login', search: { redirect: location.href } })
    }

    if (authSession.user.role !== 'ADMIN') {
      throw redirect({ to: '/' })
    }

    return {
      sessionKind: 'legacy' as const,
      authSession: { user: { name: authSession.user.name, email: authSession.user.email } },
    }
  },
  component: DashboardLayoutRoute,
})

function DashboardLayoutRoute() {
  const { authSession, sessionKind } = Route.useRouteContext()

  return (
    <DashboardShell
      userName={authSession.user.name}
      userEmail={authSession.user.email}
      sessionKind={sessionKind}
    >
      <Outlet />
    </DashboardShell>
  )
}
