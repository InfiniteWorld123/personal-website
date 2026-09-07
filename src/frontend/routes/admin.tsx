import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { AdminShell } from '#/frontend/components/layout/admin/AdminShell'
import { getAuthRouteSession } from '#/frontend/features/auth/server/getAuthRouteSession'

export const Route = createFileRoute('/admin')({
  head: () => ({
    meta: [{ title: 'Admin · Yaman Warda' }, { name: 'robots', content: 'noindex, nofollow' }],
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
  component: AdminLayoutRoute,
})

function AdminLayoutRoute() {
  const { authSession } = Route.useRouteContext()

  return (
    <AdminShell user={authSession.user}>
      <Outlet />
    </AdminShell>
  )
}
