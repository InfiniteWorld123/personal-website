import { Elysia } from 'elysia'
import type { OwnerSession } from '../auth/session'
import { assertCsrf, readSessionFromRequest } from '../auth/session'
import { enrollmentRequired, notFound, unauthorized } from '../http/error'
import { isLocalOwnerRequest, ownerAuthRequired } from './local-only'

/**
 * What stands between a stranger and the owner's data.
 *
 * Three layers now, each of which refuses on its own:
 *
 *  1. `app.ts` declines to register the owner routes at all without the
 *     development opt-in flag.
 *  2. `localOwnerGuard` re-checks that flag, the build mode and the hostname on
 *     every single request — so a deleted layer leaves a trace at runtime
 *     instead of being quietly covered for by the other.
 *  3. the session check below demands a real V2 owner session.
 *
 * The order matters. The deployment fence answers **404**, because a 401 tells
 * a stranger that a private API is there. Only a caller who is already past it
 * gets **401**, to whom the existence of the owner API is not news.
 */

/**
 * The deployment fence itself, as a plain function.
 *
 * Every guard below attaches this directly rather than reaching it through
 * `.use(localOwnerGuard)`, and that is not a style choice. `as: 'scoped'`
 * reaches exactly one level: a guard that *wraps* another guard is one level
 * too far, and the hook silently stops running. That is how the fence came off
 * every owner route once the session guards were introduced — nothing threw,
 * nothing logged, and the routes answered normally from any host.
 *
 * `as: 'global'` would fix the nesting and create a worse bug: the hook would
 * propagate up to the root application and refuse the *public* project routes
 * as well. So each guard states the fence for itself.
 */
const refuseNonLocal = ({ request }: { request: Request }): void => {
  if (isLocalOwnerRequest(request).allowed) return

  // 404, never 401 or 403: those confirm that a private API is there.
  throw notFound('Route not found')
}

export const localOwnerGuard = new Elysia({ name: 'backend2-local-owner-guard' }).onBeforeHandle(
  { as: 'scoped' },
  refuseNonLocal,
)

/**
 * The session requirement itself.
 *
 * `docs/v2/auth.md`: "every `/dashboard` loader/server action, every
 * `/api/v2/owner/**` route, private media, and preview is enforced on the
 * server."
 */
const requireSession = async (request: Request): Promise<OwnerSession> => {
  // Before the session is even looked up: a cross-site write must not reach
  // the database, however valid the cookie it rode in on.
  assertCsrf(request)

  const session = await readSessionFromRequest(request)

  if (!session) throw unauthorized()

  /*
   * An account that has not finished enrollment is not an account with
   * access. The Dashboard, the Projects API and private media all stay shut
   * until TOTP is verified and the recovery codes have been shown.
   */
  if (!session.enrolled) throw enrollmentRequired()

  return session
}

/**
 * The guard for routes that have always needed a session: Security Settings.
 *
 * It resolves the session into the handler's context, so a route cannot
 * accidentally act for the wrong account — there is no other way to obtain
 * one.
 */
export const ownerSessionGuard = new Elysia({ name: 'backend2-owner-session-guard' })
  .onBeforeHandle({ as: 'scoped' }, refuseNonLocal)
  .resolve({ as: 'scoped' }, async ({ request }): Promise<{ session: OwnerSession }> => ({
    session: await requireSession(request),
  }))

/**
 * The guard the Projects and media routes use.
 *
 * The fence alone until `BACKEND2_OWNER_AUTH=required` is set, and the fence
 * *plus* a session afterwards. The switch exists because `docs/v2/auth.md`
 * orders the two halves explicitly: "Keep the local-only Projects fence until
 * a verified authenticated owner-route replacement exists; do not accidentally
 * make owner APIs public by removing a guard first."
 *
 * So the replacement is built, tested in both positions, and turned on as one
 * reviewed change — rather than the fence being deleted and the replacement
 * hopefully arriving in the same commit. Note which way it fails: forgetting
 * the flag leaves the old fence in place, it does not open anything.
 *
 * Read per request, like every other condition in `local-only.ts`, so what the
 * tests observe is what a running server would do.
 */
export const ownerGuard = new Elysia({ name: 'backend2-owner-guard' })
  .onBeforeHandle({ as: 'scoped' }, refuseNonLocal)
  .resolve(
    { as: 'scoped' },
    async ({ request }): Promise<{ session: OwnerSession | null }> =>
      ownerAuthRequired() ? { session: await requireSession(request) } : { session: null },
  )
