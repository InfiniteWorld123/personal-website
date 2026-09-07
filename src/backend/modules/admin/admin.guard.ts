import { Elysia } from 'elysia'
import { auth } from '#/backend/shared/auth'
import { forbiddenError, unauthorizedError } from '#/backend/shared/error'

export const adminGuard = new Elysia({ name: 'admin-guard' }).resolve(
  { as: 'scoped' },
  async ({ request }) => {
    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    })

    if (!session) throw unauthorizedError('Authentication required')
    if (session.user.role !== 'ADMIN') throw forbiddenError('Admin access required')

    return { adminUser: session.user, adminSession: session.session }
  },
)
