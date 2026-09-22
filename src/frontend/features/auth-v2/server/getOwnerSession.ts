import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { isDatabaseConfigured, withRequestScope } from '#/backend2/db/client'
import { readSessionFromRequest } from '#/backend2/auth/session'
import { ownerAuthRequired } from '#/backend2/security/local-only'

/**
 * Whether the Dashboard is guarded by the V2 session yet, and if so, who is at
 * the door.
 *
 * Two answers rather than one, because the switch matters to the caller.
 * `legacy` means Auth V2 is built but not in force, so the route keeps asking
 * the existing admin session exactly as it did — that is the state
 * `docs/v2/auth.md` describes until the cutover. `v2` means this session is
 * the boundary, and a missing one sends the browser to `/dashboard/login`.
 *
 * `withRequestScope` for the same reason the legacy loader uses it: on a
 * Worker a query outside the scope lands on a module-level pool holding
 * sockets Cloudflare already tore down.
 */
export type OwnerRouteSession =
  | { mode: 'legacy' }
  | { mode: 'v2'; session: { email: string; expiresAt: string } | null }

export const getOwnerRouteSession = createServerFn({ method: 'GET' }).handler(
  async (): Promise<OwnerRouteSession> => {
    if (!ownerAuthRequired()) return { mode: 'legacy' }

    /*
     * The flag is on but the database is not configured: fail closed. Treating
     * that as "no session" shuts the Dashboard, which is the safe direction —
     * the alternative would quietly hand the surface back to the legacy guard
     * after someone had decided it should not be.
     */
    if (!isDatabaseConfigured()) return { mode: 'v2', session: null }

    return withRequestScope(async () => {
      const session = await readSessionFromRequest(getRequest())

      if (!session || !session.enrolled) return { mode: 'v2', session: null }

      return {
        mode: 'v2',
        session: { email: session.email, expiresAt: session.expiresAt.toISOString() },
      }
    })
  },
)
