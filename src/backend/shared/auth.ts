import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import * as v from 'valibot'
import { PasswordSchema } from '#/shared/validation/auth.validation'
import { getDb, livePool } from '../db/client'

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

/**
 * Only the seeded administrator may authenticate. Checked before the password
 * is verified so a non-admin address never reaches the credential path.
 */
const isAdminEmail = async (value: unknown) => {
  if (typeof value !== 'string') return false

  const result = await getDb().query<{ role: string }>(
    `SELECT role FROM "user" WHERE email = $1 LIMIT 1;`,
    [value.trim().toLowerCase()],
  )

  return result.rows[0]?.role === 'ADMIN'
}

export const auth = betterAuth({
  database: livePool,
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

      if (context.path === '/sign-in/email' && !(await isAdminEmail(body.email))) {
        throw APIError.fromStatus('UNAUTHORIZED', {
          code: 'INVALID_EMAIL_OR_PASSWORD',
          message: 'Invalid administrator credentials',
        })
      }

      const passwordField = passwordFieldByPath.get(context.path)

      if (passwordField) validatePassword(body[passwordField])
    }),
  },
  plugins: [tanstackStartCookies()],
})
