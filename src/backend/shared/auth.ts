import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { captcha } from 'better-auth/plugins'
import * as v from 'valibot'
import { env } from '#/shared/env'
import { PasswordSchema } from '#/shared/validation/auth.validation'
import { getDb, livePool } from '../db/client'
import { consumeRateLimit } from './rate-limit'
import { getTurnstileAllowedHostnames } from './turnstile'

const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA'

const turnstileSecret =
  env.TURNSTILE_SECRET_KEY ??
  (process.env.NODE_ENV !== 'production' ? TURNSTILE_TEST_SECRET : 'missing-production-secret')

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
