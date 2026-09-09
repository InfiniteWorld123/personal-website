import { Elysia } from 'elysia'
import { auth } from '#/backend/shared/auth'

/**
 * Better Auth owns the whole /api/auth surface. Sign-up is disabled in the
 * Better Auth configuration, so only the seeded administrator can sign in.
 */
export const authRoutes = new Elysia({ prefix: '/auth' }).all('/*', ({ request }) =>
  auth.handler(request),
)
