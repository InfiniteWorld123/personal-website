import { isProductionEnvironment } from './runtime-mode'

/**
 * The fence around every owner-only Backend2 route.
 *
 * `AGENTS.md` is explicit that a Git branch, hidden UI, Origin/CORS check or
 * URL hostname *alone* is not a security boundary. This is what replaces those:
 * three independent conditions, all required, failing closed.
 *
 * It is a development-time fence, not authentication. It is the reason the
 * Projects module can be built before V2 authentication exists, and it is
 * replaced wholesale by that module — with MFA — before any owner route is
 * reachable from a deployment (`docs/v2/projects-backend.md` §9).
 */

/** Hosts that can only be reached from this machine. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

export type LocalOnlyDecision =
  | { allowed: true }
  | { allowed: false; reason: 'flag' | 'production' | 'host' }

/**
 * The whole rule, as a pure function so every combination can be tested
 * without a server.
 *
 * Condition 1 is the boundary: an explicit opt-in that is absent by default,
 * never written into `wrangler.jsonc`, and never set as a Worker secret.
 * Conditions 2 and 3 are there so that a flag set by accident in the wrong
 * place still does not open a remote door.
 */
export const decideLocalOnly = (input: {
  flag: string | undefined
  nodeEnv: string | undefined
  hostname: string | undefined
}): LocalOnlyDecision => {
  if (input.flag?.trim() !== 'local') return { allowed: false, reason: 'flag' }
  if (input.nodeEnv === 'production') return { allowed: false, reason: 'production' }

  const hostname = (input.hostname ?? '').toLowerCase()

  if (!LOOPBACK_HOSTS.has(hostname)) return { allowed: false, reason: 'host' }

  return { allowed: true }
}

/**
 * Condition 1 on its own, read at start-up.
 *
 * `app.ts` uses this to decide whether to mount the owner routes at all. On a
 * production build they do not exist; the per-request guard is the second
 * layer, and either one alone refuses a stranger.
 */
export const ownerRoutesEnabled = (
  environment: Record<string, string | undefined> = process.env,
): boolean =>
  environment.BACKEND2_OWNER_API?.trim() === 'local' && !isProductionEnvironment(environment)

/**
 * Whether the Projects and media owner routes demand a V2 session on top of
 * the fence.
 *
 * Read at start-up, opt-in, and absent by default — which keeps the fence
 * exactly as it was while Auth V2 is being built and verified. Turning it on
 * is the "switch to V2 session authorization" step in `docs/v2/auth.md`; it
 * strictly adds a requirement and can never remove one.
 *
 * The new `/owner/security/**` routes do not consult this. They require a
 * session unconditionally, because they never had a reason not to.
 */
export const ownerAuthRequired = (
  environment: Record<string, string | undefined> = process.env,
): boolean => environment.BACKEND2_OWNER_AUTH?.trim() === 'required'

/** The per-request half. Reads the environment fresh every time. */
export const isLocalOwnerRequest = (
  request: Request,
  environment: Record<string, string | undefined> = process.env,
): LocalOnlyDecision => {
  let hostname: string | undefined

  try {
    hostname = new URL(request.url).hostname
  } catch {
    hostname = undefined
  }

  return decideLocalOnly({
    flag: environment.BACKEND2_OWNER_API,
    nodeEnv: isProductionEnvironment(environment) ? 'production' : environment.NODE_ENV,
    hostname,
  })
}
