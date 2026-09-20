import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { captcha } from 'better-auth/plugins'
import * as v from 'valibot'
import { PasswordSchema } from '#/shared/validation/auth.validation'
import { getDb, livePool } from '../db/client'
import { consumeRateLimit } from './rate-limit'
import { getTurnstileAllowedHostnames, getTurnstileSecret } from './turnstile'

/**
 * The same secret the rest of the app verifies against, rather than a second
 * copy of the rule. It hands back Cloudflare's testing key off production and
 * refuses to return anything at all when the real key is missing in it.
 *
 * Read here at startup on purpose. The previous fallback was the literal
 * string `missing-production-secret`, which Cloudflare rejects — so a missing
 * key did not stop the deploy, it locked the owner out of his own admin and
 * called it `Security verification failed`.
 */
const turnstileSecret = getTurnstileSecret()

const passwordFieldByPath = new Map<string, string>([
  ['/reset-password', 'newPassword'],
  ['/change-password', 'newPassword'],
  ['/set-password', 'newPassword'],
])

const validatePassword = (value: unknown) => {
  const result = v.safeParse(PasswordSchema, value)

  if (!result.success) {
    throw APIError.fromStatus('UNPROCESSABLE_ENTITY', {
      code: 'VALIDATION_ERROR',
      message: result.issues[0]?.message ?? 'Invalid password',
    })
  }
}

export const auth = betterAuth({
  database: livePool,
  advanced: {
    ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
  },
  rateLimit: {
    enabled: true,
    customRules: {
      '/sign-in/email': { window: 15 * 60, max: 10 },
    },
    customStorage: {
      consume: async (key, rule) =>
        consumeRateLimit(getDb(), {
          scope: 'auth-login',
          identity: key,
          limit: rule.max,
          windowSeconds: rule.window,
        }),
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        required: true,
        defaultValue: 'USER',
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
  },
  hooks: {
    before: createAuthMiddleware(async (context) => {
      if (!context.body || typeof context.body !== 'object') return

      const body = context.body as Record<string, unknown>

      const passwordField = passwordFieldByPath.get(context.path)

      if (passwordField) validatePassword(body[passwordField])
    }),
  },
  plugins: [
    captcha({
      provider: 'cloudflare-turnstile',
      secretKey: turnstileSecret,
      endpoints: ['/sign-in/email'],
      /**
       * Demanded in production, waived everywhere else — the same trade
       * `isTurnstileResponseValid` already makes, and for the same reason:
       * Cloudflare's testing keys answer `success` without echoing the action,
       * so requiring it locked the owner out of his own admin on every machine
       * without real keys. Production has real keys, which do echo it, and the
       * hostname is enforced there too.
       */
      expectedAction: process.env.NODE_ENV === 'production' ? 'admin_login' : undefined,
      allowedHostnames:
        process.env.NODE_ENV === 'production' ? getTurnstileAllowedHostnames() : undefined,
    }),
    tanstackStartCookies(),
  ],
})
