import * as v from 'valibot'

/**
 * The Auth contract, shared by the server and the Dashboard.
 *
 * Pure like the Projects contract: valibot and plain TypeScript only. The
 * sign-in screen imports exactly the rules the server enforces, and
 * `backend2-contracts.test.ts` asserts that nothing server-only sneaks in.
 *
 * Every rule here is enforced again on the server. Client-side validation is
 * for the owner's benefit, never a boundary (`docs/v2/auth.md`).
 */

/* ------------------------------------------------------------------ limits */

export const AUTH_LIMITS = {
  email: 254,
  /** Long enough to matter, short enough that a paste is not a body-size attack. */
  passwordMin: 12,
  passwordMax: 200,
  passkeyName: 60,
  /** Base32, no padding. */
  totpDigits: 6,
  recoveryCodeCount: 10,
} as const

/**
 * Every deadline in the module, in seconds, in one place.
 *
 * `docs/v2/auth.md` fixes each of these, so they are constants rather than
 * configuration: a deployment cannot quietly lengthen a session by setting an
 * environment variable.
 */
export const AUTH_TTL = {
  /** Exactly seven days from full sign-in. Never extended by activity. */
  sessionSeconds: 7 * 24 * 60 * 60,
  /** A WebAuthn ceremony, and the pending MFA step a correct password buys. */
  challengeSeconds: 5 * 60,
  /** A step-up capability, scoped to one action. */
  stepUpSeconds: 5 * 60,
  passwordResetSeconds: 30 * 60,
  emailChangeSeconds: 24 * 60 * 60,
} as const

/**
 * Server-enforced attempt ceilings. Named here so the contract test and the
 * integration suite assert the same numbers the routes use.
 */
export const AUTH_RATE_LIMITS = {
  /** Password attempts, per source address. */
  password: { limit: 10, windowSeconds: 15 * 60 },
  /** Second-factor attempts, per pending challenge. */
  secondFactor: { limit: 5, windowSeconds: 15 * 60 },
  /** WebAuthn ceremonies started, per source address. */
  webauthn: { limit: 30, windowSeconds: 15 * 60 },
  /** Reset and email-change requests, per source address. */
  recovery: { limit: 5, windowSeconds: 60 * 60 },
  /** Step-up proofs, per session. */
  stepUp: { limit: 10, windowSeconds: 15 * 60 },
} as const

/* ------------------------------------------------------------------ shapes */

export type SignInMethod = 'passkey' | 'password_totp' | 'password_recovery'

/**
 * What the owner may be, from the server's point of view.
 *
 * `enrolling` is the state a correct first password reaches. It is deliberately
 * not access: no Dashboard, no Projects, no private media until TOTP is
 * verified and the recovery codes have been shown once.
 */
export type OwnerAccessState = 'enrolling' | 'active'

export type OwnerProfile = {
  email: string
  accessState: OwnerAccessState
  /** Never a secret — only whether each factor is set up. */
  factors: {
    password: boolean
    totp: boolean
    passkeys: number
    recoveryCodesRemaining: number
  }
}

export type PasskeySummary = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string | null
  /** True when the credential syncs through a provider's keychain. */
  syncedAcrossDevices: boolean
}

export type SessionSummary = {
  id: string
  method: SignInMethod
  authenticatedAt: string
  expiresAt: string
  lastSeenAt: string | null
  /**
   * Read from the request's own User-Agent and nothing else. Inferred, and
   * labelled as inferred: `docs/v2/auth.md` forbids claiming a device name is
   * exact when it was guessed from a header.
   */
  inferredDevice: string
  isCurrent: boolean
}

export type SecurityEventSummary = {
  id: string
  kind: string
  createdAt: string
  inferredDevice: string
}

export type SessionPage = {
  items: SessionSummary[]
  page: number
  pageSize: number
  total: number
  pageCount: number
  hasMore: boolean
}

/**
 * Everything Security Settings shows, in one answer.
 *
 * The first page of sessions rides along rather than being fetched beside it.
 * Two requests would be two snapshots that can disagree — and, more plainly,
 * the local development database serves one connection at a time, so a screen
 * that opens with two parallel calls does not open at all.
 */
export type SecurityOverview = {
  owner: OwnerProfile
  passkeys: PasskeySummary[]
  sessions: SessionPage
  pendingEmailChange: { newEmail: string; expiresAt: string } | null
  recentEvents: SecurityEventSummary[]
}

/* ----------------------------------------------------------------- schemas */

const trimmed = (max: number, message: string) =>
  v.pipe(v.string(message), v.trim(), v.maxLength(max, message))

export const EmailSchema = v.pipe(
  trimmed(AUTH_LIMITS.email, 'That email address is not valid'),
  v.toLowerCase(),
  v.email('That email address is not valid'),
)

/**
 * The password rule.
 *
 * Length is the requirement, not a character-class puzzle: a long passphrase
 * beats `P@ssw0rd!` and the owner is the only person who will ever type it.
 */
export const PasswordSchema = v.pipe(
  v.string('Enter your password'),
  v.minLength(AUTH_LIMITS.passwordMin, `Use at least ${AUTH_LIMITS.passwordMin} characters`),
  v.maxLength(AUTH_LIMITS.passwordMax, 'That password is too long'),
)

/** Six digits, with spaces tolerated because authenticator apps display them. */
export const TotpCodeSchema = v.pipe(
  v.string('Enter the 6-digit code'),
  v.transform((value) => value.replace(/[\s-]/g, '')),
  v.regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app'),
)

/** Ten characters in two groups, case-insensitive, dashes optional. */
export const RecoveryCodeSchema = v.pipe(
  v.string('Enter a recovery code'),
  v.transform((value) => value.replace(/[\s-]/g, '').toLowerCase()),
  v.regex(/^[a-z0-9]{10}$/, 'That is not a recovery code'),
)

/** An opaque server-issued handle. Never a session, never decodable. */
export const ChallengeIdSchema = v.pipe(
  v.string('That request is missing its challenge'),
  v.regex(/^[A-Za-z0-9_-]{32,128}$/, 'That challenge is not valid'),
)

export const OpaqueTokenSchema = v.pipe(
  v.string('That link is not valid'),
  v.regex(/^[A-Za-z0-9_-]{32,128}$/, 'That link is not valid'),
)

export const PasskeyNameSchema = v.pipe(
  trimmed(AUTH_LIMITS.passkeyName, 'That name is too long'),
  v.minLength(1, 'Give this passkey a name'),
)

/** The WebAuthn response object, kept opaque: the library validates its shape. */
const WebAuthnResponseSchema = v.record(v.string(), v.unknown())

export const PasskeyStartSchema = v.object({})

export const PasskeyFinishSchema = v.object({
  challengeId: ChallengeIdSchema,
  credential: WebAuthnResponseSchema,
})

export const PasswordStartSchema = v.object({
  email: EmailSchema,
  password: v.pipe(v.string('Enter your password'), v.maxLength(AUTH_LIMITS.passwordMax)),
})

/**
 * Exactly one second factor, never both.
 *
 * Accepting both would let a caller spend two guesses against one rate-limit
 * tick, which is the opposite of what a second factor is for.
 */
export const PasswordFinishSchema = v.pipe(
  v.object({
    challengeId: ChallengeIdSchema,
    totpCode: v.optional(TotpCodeSchema),
    recoveryCode: v.optional(RecoveryCodeSchema),
  }),
  v.check(
    (input) => Boolean(input.totpCode) !== Boolean(input.recoveryCode),
    'Send either an authenticator code or a recovery code',
  ),
)

export const EmailOnlySchema = v.object({ email: EmailSchema })

export const PasswordResetCompleteSchema = v.object({
  token: OpaqueTokenSchema,
  newPassword: PasswordSchema,
})

export const TokenOnlySchema = v.object({ token: OpaqueTokenSchema })

/** First-time setup is reached with the challenge a correct password bought. */
export const EnrollmentStartSchema = v.object({ challengeId: ChallengeIdSchema })

export const TotpConfirmSchema = v.object({
  challengeId: ChallengeIdSchema,
  code: TotpCodeSchema,
})

export const PasskeyRegisterFinishSchema = v.object({
  challengeId: ChallengeIdSchema,
  credential: WebAuthnResponseSchema,
  name: PasskeyNameSchema,
})

/**
 * Proving it is the owner again, for one action.
 *
 * Either a fresh passkey assertion or the full password + second factor. A
 * still-valid cookie is explicitly not enough: `docs/v2/auth.md` requires the
 * proof, not the session.
 */
export const ReverifySchema = v.pipe(
  v.object({
    scope: v.picklist(
      [
        'passkeys',
        'totp',
        'recovery-codes',
        'password',
        'email',
        'sessions',
      ],
      'That is not something that can be confirmed',
    ),
    challengeId: v.optional(ChallengeIdSchema),
    credential: v.optional(WebAuthnResponseSchema),
    password: v.optional(v.pipe(v.string(), v.maxLength(AUTH_LIMITS.passwordMax))),
    totpCode: v.optional(TotpCodeSchema),
    recoveryCode: v.optional(RecoveryCodeSchema),
  }),
  v.check(
    (input) =>
      Boolean(input.credential && input.challengeId) ||
      Boolean(input.password && (input.totpCode || input.recoveryCode)),
    'Confirm with a passkey, or with your password and a second factor',
  ),
)

export const PasswordChangeSchema = v.object({ newPassword: PasswordSchema })

export const EmailChangeRequestSchema = v.object({ newEmail: EmailSchema })

export const SessionListQuerySchema = v.object({
  page: v.optional(
    v.pipe(
      v.unknown(),
      v.transform((value) => {
        const parsed = Number(value)

        return Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1
      }),
    ),
    1,
  ),
})

/** Bounded server-side pagination, as `AGENTS.md` requires of every owner list. */
export const SESSION_PAGE_SIZE = 20
export const SECURITY_EVENT_LIMIT = 20

/* ------------------------------------------------------------------ helpers */

/**
 * A rough device label from a User-Agent, for the session list.
 *
 * Deliberately vague. The specification forbids presenting a guess as fact, so
 * this returns the shape of a claim the header made — nothing is looked up,
 * and no address is turned into a place.
 */
export const inferDevice = (userAgent: string | null | undefined): string => {
  const ua = (userAgent ?? '').toLowerCase()

  if (!ua) return 'Unknown device'

  const platform = ua.includes('iphone')
    ? 'iPhone'
    : ua.includes('ipad')
      ? 'iPad'
      : ua.includes('android')
        ? 'Android'
        : ua.includes('mac os') || ua.includes('macintosh')
          ? 'Mac'
          : ua.includes('windows')
            ? 'Windows'
            : ua.includes('linux')
              ? 'Linux'
              : null

  const browser = ua.includes('edg/')
    ? 'Edge'
    : ua.includes('chrome/') && !ua.includes('chromium')
      ? 'Chrome'
      : ua.includes('firefox/')
        ? 'Firefox'
        : ua.includes('safari/')
          ? 'Safari'
          : null

  if (!platform && !browser) return 'Unknown device'

  return [browser, platform].filter(Boolean).join(' on ')
}

/**
 * The one message every public sign-in failure uses.
 *
 * Wrong password, unknown address, missing account: all the same sentence, so
 * a stranger cannot learn which of those it was.
 */
export const GENERIC_SIGN_IN_ERROR = 'That email address and password do not match'

/** Reset and email-change requests always say this, whatever actually happened. */
export const NEUTRAL_RECOVERY_MESSAGE =
  'If that address belongs to this account, a link is on its way'
