import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { isDatabaseConfigured, withRequestScope } from '#/backend2/db/client'
import { readSessionFromRequest } from '#/backend2/auth/session'

/**
 * Who is at the Dashboard's door: the V2 owner session, or nobody.
 *
 * The V2 session is the only boundary, whatever `BACKEND2_OWNER_AUTH` says;
 * a missing one sends the browser to `/dashboard/login`. Without a configured
 * database there is no session at all, which shuts the Dashboard — the safe
 * direction.
 *
 * `withRequestScope` because on a Worker a query outside the scope lands on a
 * module-level pool holding sockets Cloudflare already tore down.
 */
export type OwnerRouteSession = { session: { email: string; expiresAt: string } | null }

export const getOwnerRouteSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<OwnerRouteSession> => {
    if (!isDatabaseConfigured()) return { session: null }

    return withRequestScope(async () => {
      const session = await readSessionFromRequest(getRequest())

      if (!session || !session.enrolled) return { session: null }

      return { session: { email: session.email, expiresAt: session.expiresAt.toISOString() } }
    })
  },
)
