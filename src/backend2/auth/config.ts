/**
 * Everything Auth V2 reads from the environment, in one place, checked rather
 * than trusted — the same discipline `db/client.ts` applies to the connection
 * string.
 *
 * No value here is ever written into `wrangler.jsonc`; the deployment
 * prerequisites in `docs/v2/auth.md` cover setting them as encrypted secrets.
 */

export const V2_SESSION_COOKIE = 'v2_owner_session'

/** The header a step-up capability travels in. Never a cookie: it is not a session. */
export const V2_STEP_UP_HEADER = 'x-v2-step-up'

/** The double-submit CSRF pair. */
export const V2_CSRF_COOKIE = 'v2_csrf'
export const V2_CSRF_HEADER = 'x-v2-csrf'

type Env = Record<string, string | undefined>

const read = (environment: Env, name: string): string | undefined => {
  const value = environment[name]?.trim()

  return value === '' ? undefined : value
}

const isProduction = (environment: Env): boolean => environment.NODE_ENV === 'production'

/**
 * The key everything else is derived from: the TOTP secret's encryption key,
 * the rate-limit key HMAC, the address hash in the session list.
 *
 * Deliberately separate from `BETTER_AUTH_SECRET`. The legacy backend must be
 * deletable at cutover without taking V2's stored secrets with it.
 */
export const readAuthSecret = (environment: Env = process.env): string => {
  const secret = read(environment, 'AUTH_V2_SECRET')

  if (secret) {
    if (secret.length < 32) {
      throw new Error('AUTH_V2_SECRET is too short. Generate one with: openssl rand -base64 32')
    }

    return secret
  }

  if (isProduction(environment)) {
    throw new Error(
      'AUTH_V2_SECRET is missing. Auth V2 refuses to run in production without it ' +
        '(see docs/v2/auth.md).',
    )
  }

  /*
   * Development only, and constant on purpose: a value that changed per
   * process would invalidate every stored TOTP secret on each restart, which
   * looks exactly like a bug in the TOTP implementation.
   */
  return 'development-only-auth-v2-secret-not-for-production'
}

/**
 * The WebAuthn Relying Party ID: a registrable domain, never a URL and never a
 * port. A passkey registered under one RP ID cannot be used under another,
 * which is the whole reason the value is checked rather than guessed.
 */
export const readRpId = (environment: Env = process.env): string => {
  const explicit = read(environment, 'AUTH_V2_RP_ID')

  if (explicit) return explicit.toLowerCase()

  if (isProduction(environment)) {
    throw new Error('AUTH_V2_RP_ID is missing. Set it to the production domain, without a scheme.')
  }

  return 'localhost'
}

/**
 * The exact origin a WebAuthn assertion must claim. A list, because the laptop
 * may reach a development server on more than one loopback spelling.
 */
export const readExpectedOrigins = (environment: Env = process.env): string[] => {
  const explicit = read(environment, 'AUTH_V2_ORIGIN')

  if (explicit) {
    return explicit
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean)
  }

  if (isProduction(environment)) {
    throw new Error('AUTH_V2_ORIGIN is missing. Set it to the production https:// origin.')
  }

  return ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8788']
}

/**
 * Whether the session cookie carries `Secure`.
 *
 * True everywhere except a plain-HTTP development server, where a `Secure`
 * cookie is simply never stored and the owner cannot sign in at all.
 */
export const useSecureCookies = (environment: Env = process.env): boolean =>
  isProduction(environment) ||
  readExpectedOrigins(environment).every((origin) => origin.startsWith('https://'))

export type AuthConfig = {
  secret: string
  rpId: string
  rpName: string
  origins: string[]
  secureCookies: boolean
}

export const readAuthConfig = (environment: Env = process.env): AuthConfig => ({
  secret: readAuthSecret(environment),
  rpId: readRpId(environment),
  rpName: read(environment, 'APP_NAME') ?? 'Yaman Warda',
  origins: readExpectedOrigins(environment),
  secureCookies: useSecureCookies(environment),
})
