import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#/backend/shared/auth'
import { withRequestScope } from '#/backend/db/client'
import type { AuthUser } from '#/frontend/api/auth.api'

export type AuthRouteSession = { user: AuthUser }

/**
 * Reads the session on the server during route loading, so a protected route
 * never renders before the session is known.
 *
 * The body runs inside `withRequestScope` for the same reason the public page
 * loaders do: Better Auth reads the session from the database, and on a Worker
 * a query outside the scope lands on the module-level pool — sockets Cloudflare
 * tore down after the previous request, and no Hyperdrive. That pool has no
 * connect timeout, so the request did not fail, it hung, and the runtime killed
 * it with `Error 1101`. It looked exactly like a sleeping database.
 */
export const getAuthRouteSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthRouteSession | null> =>
    withRequestScope(async () => {
      const request = getRequest()

      const session = await auth.api.getSession({
        headers: request.headers,
        query: { disableCookieCache: true },
      })

      if (!session) return null

      return {
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          emailVerified: session.user.emailVerified,
          image: session.user.image ?? null,
          role: session.user.role === 'ADMIN' ? 'ADMIN' : 'USER',
        },
      }
    }),
)
