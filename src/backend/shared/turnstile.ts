import { env } from '#/shared/env'
import { botCheckFailedError, isAppError } from './error'

export type TurnstileAction = 'admin_login' | 'booking_create' | 'contact_submit'

export type TurnstileResponse = {
  success?: boolean
  hostname?: string
  action?: string
  /** Cloudflare marks an answer that came from one of its testing keys. */
  metadata?: { result_with_testing_key?: boolean }
}

const TEST_SECRET = '1x0000000000000000000000000000000AA'
const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export const getTurnstileAllowedHostnames = (): string[] => {
  const hostname = new URL(env.BASE_URL).hostname.toLowerCase()
  const hostnames = new Set([hostname])

  if (hostname.startsWith('www.')) hostnames.add(hostname.slice(4))
  else hostnames.add(`www.${hostname}`)

  return [...hostnames]
}

export const isTurnstileResponseValid = (
  result: TurnstileResponse,
  action: TurnstileAction,
  enforceHostname = process.env.NODE_ENV === 'production',
): boolean => {
  if (result.success !== true) return false

  /**
   * The testing keys answer `success` without echoing the action and with
   * `example.com` as the hostname, so a machine with no keys of its own — a
   * development checkout, a preview — would fail every booking and every
   * contact submission at the last step. It is only ever accepted where the
   * hostname is not enforced, and the hostname is enforced in production.
   */
  if (result.metadata?.result_with_testing_key === true && !enforceHostname) return true

  const hostnameAllowed =
    !enforceHostname ||
    (Boolean(result.hostname) && getTurnstileAllowedHostnames().includes(result.hostname!.toLowerCase()))

  return result.action === action && hostnameAllowed
}

const getSecret = (): string => {
  if (env.TURNSTILE_SECRET_KEY) return env.TURNSTILE_SECRET_KEY
  if (process.env.NODE_ENV !== 'production') return TEST_SECRET

  throw new Error('Environment variable TURNSTILE_SECRET_KEY is missing')
}

export const assertTurnstile = async ({
  token,
  action,
  clientIp,
}: {
  token: string
  action: TurnstileAction
  clientIp?: string
}): Promise<void> => {
  if (!token.trim()) throw botCheckFailedError()

  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 8_000)

  try {
    const response = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: getSecret(),
        response: token,
        remoteip: clientIp,
        idempotency_key: crypto.randomUUID(),
      }),
      signal: abort.signal,
    })

    if (!response.ok) throw new Error(`Turnstile returned HTTP ${response.status}`)

    const result = (await response.json()) as TurnstileResponse

    if (!isTurnstileResponseValid(result, action)) {
      /*
       * Say why. A refused check used to leave nothing behind, so the only
       * way to tell a wrong secret from a wrong hostname from an expected
       * action that never arrived was to guess — which cost an afternoon on
       * the live site. None of these four values is a secret.
       */
      console.error('Turnstile refused a token', {
        success: result.success,
        expectedAction: action,
        returnedAction: result.action,
        returnedHostname: result.hostname,
        allowedHostnames: getTurnstileAllowedHostnames(),
        errorCodes: (result as { 'error-codes'?: string[] })['error-codes'],
      })

      throw botCheckFailedError()
    }
  } catch (error) {
    if (isAppError(error)) throw error

    console.error('Turnstile verification unavailable', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
    throw botCheckFailedError('Security verification is temporarily unavailable. Please retry.')
  } finally {
    clearTimeout(timeout)
  }
}
