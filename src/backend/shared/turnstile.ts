import { env } from '#/shared/env'
import { botCheckFailedError, isAppError } from './error'

export type TurnstileAction = 'admin_login' | 'booking_create' | 'contact_submit'

export type TurnstileResponse = {
  success?: boolean
  hostname?: string
  action?: string
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
  const hostnameAllowed =
    !enforceHostname ||
    (Boolean(result.hostname) && getTurnstileAllowedHostnames().includes(result.hostname!.toLowerCase()))

  return result.success === true && result.action === action && hostnameAllowed
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
    if (!isTurnstileResponseValid(result, action)) throw botCheckFailedError()
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
