import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import dashboardCss from '#/frontend/dashboard/dashboard.css?url'
import { DashboardShell } from '#/frontend/dashboard/DashboardShell'
import { getAuthRouteSession } from '#/frontend/features/auth/server/getAuthRouteSession'

/**
 * Dashboard V2.
 *
 * It lives beside `/admin`, not on top of it: the legacy admin, the legacy
 * backend and the legacy database all keep running untouched until a cutover
 * is planned and verified. Nothing under this route reads or writes anything
 * they own.
 *
 * Two things here are deliberately temporary, and both come out when Backend2
 * exists:
 *
 *  - **The guard.** V2 has no session of its own yet, and authentication
 *    ownership is one of the decisions the foundation leaves open. Rather than
 *    invent one, or — much worse — ship an unguarded private surface, this
 *    route asks the existing admin session whether the person at the door is
 *    the owner. It only reads; it creates nothing and stores nothing.
 *  - **The data.** Every screen behind this route draws from a fixture and
 *    says so on the page.
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
    const authSession = await getAuthRouteSession()

    if (!authSession) {
      throw redirect({ to: '/admin/login', search: { redirect: location.href } })
    }

    if (authSession.user.role !== 'ADMIN') {
      throw redirect({ to: '/' })
    }

    return { authSession }
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
