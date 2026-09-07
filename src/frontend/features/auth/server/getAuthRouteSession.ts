import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '#/backend/shared/auth'
import type { AuthUser } from '#/frontend/api/auth.api'

export type AuthRouteSession = { user: AuthUser }

/**
 * Reads the session on the server during route loading, so a protected route
 * never renders before the session is known.
 */
export const getAuthRouteSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthRouteSession | null> => {
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
  },
)
