import { enforceRateLimit } from '../../auth/rate-limit'
import { internalError, rateLimited, verificationFailed } from '../../http/error'
import { isProductionEnvironment } from '../../security/runtime-mode'
import * as repo from './booking.repo'

/**
 * Anti-abuse for the public booking routes.
 *
 * `docs/v2/booking.md`: "Keep current public anti-abuse protection until a
 * separately approved replacement." The live form uses Turnstile, so the V2
 * route verifies it too wherever `TURNSTILE_SECRET_KEY` is set — and in
 * production refuses to run without it rather than quietly dropping the check.
 * Rate limits come on top: per network in the shared database table Auth
 * already uses, per address counted from the bookings actually made.
 */

type Env = Record<string, string | undefined>

export type TurnstileVerifier = (token: string, ip: string) => Promise<boolean>

let override: TurnstileVerifier | undefined

export const useTurnstileForTest = (verifier: TurnstileVerifier | undefined): void => {
  override = verifier
}

const siteverify: TurnstileVerifier = async (token, ip) => {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim()

  if (!secret) return false

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(10_000),
    })
    const body = (await response.json().catch(() => ({}))) as { success?: boolean }

    return body.success === true
  } catch {
    return false
  }
}

export const verifyHuman = async (token: string, ip: string, environment: Env = process.env): Promise<void> => {
  if (override) {
    if (!(await override(token, ip))) throw verificationFailed()

    return
  }

  if (!environment.TURNSTILE_SECRET_KEY?.trim()) {
    if (isProductionEnvironment(environment)) throw internalError('Human verification is not configured')

    return
  }

  if (!token || !(await siteverify(token, ip))) throw verificationFailed()
}

export const BOOKING_RATE_LIMITS = {
  createPerSource: { limit: 10, windowSeconds: 60 * 60 },
  createPerEmail: { limit: 5, windowSeconds: 24 * 60 * 60 },
  managePerSource: { limit: 60, windowSeconds: 10 * 60 },
  slotsPerSource: { limit: 240, windowSeconds: 10 * 60 },
} as const

/** Per network, checked after the human check so a failing token spends nothing. */
export const limitCreate = (ip: string): Promise<void> =>
  enforceRateLimit({ scope: 'booking:create', identity: ip, rule: BOOKING_RATE_LIMITS.createPerSource })

/**
 * Per address, counted from the appointments themselves: only a booking that
 * was made counts. A failed check or a time just taken costs the address
 * nothing, so nobody can lock someone else's address out with bad tokens.
 * Called under the calendar lock, so two submits cannot both slip under it.
 */
export const limitCreatePerEmail = async (email: string, now: Date): Promise<void> => {
  const rule = BOOKING_RATE_LIMITS.createPerEmail
  const made = await repo.countPublicBookingsSince(email, new Date(now.getTime() - rule.windowSeconds * 1000))

  if (made >= rule.limit) throw rateLimited('Too many attempts. Wait a few minutes and try again')
}

export const limitManage = (ip: string): Promise<void> =>
  enforceRateLimit({ scope: 'booking:manage', identity: ip, rule: BOOKING_RATE_LIMITS.managePerSource })

export const limitSlots = (ip: string): Promise<void> =>
  enforceRateLimit({ scope: 'booking:slots', identity: ip, rule: BOOKING_RATE_LIMITS.slotsPerSource })
