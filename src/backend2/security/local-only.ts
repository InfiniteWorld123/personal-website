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
  (environment.BACKEND2_OWNER_API?.trim() === 'local' && !isProductionEnvironment(environment)) ||
  remoteOwnerConfig(environment) !== null

/* -------------------------------------------------------------- remote mode */

/**
 * `BACKEND2_OWNER_API=remote` — the Dashboard reachable from the internet at
 * the site's own address (`docs/v2/remote-access.md`; the owner chose no
 * Cloudflare Access and no separate host on 24 Sep 2026). Every piece must be
 * configured or the answer is `null` and the owner routes stay unmounted,
 * exactly as without the flag:
 *
 * - a strong `AUTH_V2_SECRET` (the key for stored authenticator secrets);
 * - an `https://` `AUTH_V2_ORIGIN` (the site's own address) and
 *   `AUTH_V2_RP_ID` for passkeys.
 *
 * A V2 session — passkey, or password with an authenticator code — is then
 * required on every owner route (`ownerAuthRequired`), whatever
 * `BACKEND2_OWNER_AUTH` says, and a stranger still gets 404, not 401.
 */
export type RemoteOwnerConfig = { host: string }

export const remoteOwnerConfig = (
  environment: Record<string, string | undefined> = process.env,
): RemoteOwnerConfig | null => {
  if (environment.BACKEND2_OWNER_API?.trim() !== 'remote') return null

  const secret = environment.AUTH_V2_SECRET?.trim() ?? ''
  const rpId = environment.AUTH_V2_RP_ID?.trim() ?? ''
  let origin: URL

  try {
    origin = new URL(environment.AUTH_V2_ORIGIN?.trim() ?? '')
  } catch {
    return null
  }

  if (secret.length < 32 || !rpId) return null
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash) return null

  return { host: origin.host.toLowerCase() }
}

/**
 * The per-request rule in either mode. `local`: this machine only. `remote`:
 * the request is for the site's configured host (a `workers.dev` address or
 * any other hostname pointing at the same Worker is refused); the session
 * guard then decides who it is.
 */
export const decideOwnerRequest = async (
  request: Request,
  environment: Record<string, string | undefined> = process.env,
): Promise<{ allowed: true } | { allowed: false; reason: string }> => {
  const remote = remoteOwnerConfig(environment)

  if (!remote) return isLocalOwnerRequest(request, environment)

  let host: string

  try {
    host = new URL(request.url).host.toLowerCase()
  } catch {
    return { allowed: false, reason: 'host' }
  }

  return host === remote.host ? { allowed: true } : { allowed: false, reason: 'host' }
}

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
): boolean => environment.BACKEND2_OWNER_AUTH?.trim() === 'required' || remoteOwnerConfig(environment) !== null

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
