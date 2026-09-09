import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAuthRouteSession } from '#/frontend/features/auth/server/getAuthRouteSession'
import { LoginPage } from '#/frontend/pages/admin/login/LoginPage'

type LoginSearch = { redirect?: string }

export const Route = createFileRoute('/admin_/login')({
  head: () => ({
    meta: [{ title: 'Admin sign in' }, { name: 'robots', content: 'noindex, nofollow' }],
  }),
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const value = search.redirect

    // Only same-origin paths. An absolute URL here would be an open redirect.
    if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
      return { redirect: value }
    }

    return {}
  },
  beforeLoad: async () => {
    const authSession = await getAuthRouteSession()

    if (authSession?.user.role === 'ADMIN') {
      throw redirect({ to: '/admin' })
    }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { redirect: redirectTo } = Route.useSearch()

  return <LoginPage redirectTo={redirectTo} />
}
