import {
  AUTH_RATE_LIMITS,
  AUTH_TTL,
  GENERIC_SIGN_IN_ERROR,
  type SignInMethod,
} from '../../contracts/auth.contract'
import { recordSecurityEventSafely } from '../../auth/audit'
import {
  consumeChallenge,
  createChallenge,
  readChallenge,
  recordFailedAttempt,
  revokeChallenges,
  sweepChallenges,
} from '../../auth/challenges'
import { readAuthSecret } from '../../auth/config'
import {
  decryptSecret,
  encryptSecret,
  hashOpaqueSecret,
  hashPassword,
  newOpaqueSecret,
  verifyPassword,
} from '../../auth/crypto'
import {
  assertMailAvailable,
  emailChangeMail,
  emailChangeNoticeMail,
  passwordResetMail,
  securityNoticeMail,
  sendMail,
} from '../../auth/mail'
import { enforceRateLimit, sweepRateLimits } from '../../auth/rate-limit'
import { formatRecoveryCode, generateRecoveryCodes } from '../../auth/recovery'
import { createSession, revokeAllSessions, sweepSessions } from '../../auth/session'
import {
  currentTotpCode,
  formatSetupKey,
  generateTotpSecret,
  totpUri,
  verifyTotp,
} from '../../auth/totp'
import {
  buildAuthenticationOptions,
  credentialIdFrom,
  verifyAuthentication,
} from '../../auth/webauthn'
import { badRequest, conflict, unauthorized } from '../../http/error'
import {
  confirmTotp,
  consumeAuthToken,
  consumeRecoveryCode,
  countUnusedRecoveryCodes,
  findOwner,
  findOwnerByEmail,
  findPasskeyByCredentialId,
  issueAuthToken,
  markRecoveryCodesIssued,
  rememberTotpStep,
  replaceRecoveryCodes,
  setEmail,
  setPasswordHash,
  setPendingTotpSecret,
  touchPasskey,
} from './owner.repo'

/**
 * The sign-in flows.
 *
 * Two routes in, one destination. The passkey route is passwordless and
 * complete on its own; the fallback route buys only a pending challenge with a
 * correct password and needs a second factor to finish. Nothing here can
 * produce a session by any other path — `createSession` is called in exactly
 * three places below, each immediately after a factor was verified.
 */

export type SignInResult = {
  token: string
  csrfToken: string
  expiresAt: Date
  sessionId: string
  email: string
}

const SIGN_IN_SCOPE = {
  password: 'auth-password',
  passwordAccount: 'auth-password-account',
  webauthn: 'auth-webauthn',
  recovery: 'auth-recovery',
} as const

/**
 * Housekeeping, run from the sign-in paths rather than a scheduler.
 *
 * Auth V2 has no cron, these tables are tiny, and only the owner ever writes
 * to them — so the cheapest correct place is the request that was going to
 * touch the database anyway. A failure here must never fail a sign-in.
 */
const sweep = async (): Promise<void> => {
  // Sequential, like every other multi-query path in this module: a Worker
  // may hold only six sockets open at once, and housekeeping is the last
  // thing that should be competing for one.
  await sweepChallenges().catch(() => {})
  await sweepRateLimits().catch(() => {})
  await sweepSessions().catch(() => {})
}

/* ------------------------------------------------------------- passkey in */

/**
 * Starts the ceremony before anyone is identified.
 *
 * No email, no account lookup, no `allowCredentials`. The response is the same
 * whether or not an owner exists in this database, so the endpoint cannot be
 * used to find out.
 */
export const startPasskeySignIn = async (request: Request, ipAddress: string) => {
  await enforceRateLimit({
    scope: SIGN_IN_SCOPE.webauthn,
    identity: ipAddress,
    rule: AUTH_RATE_LIMITS.webauthn,
  })

  await sweep()

  const options = await buildAuthenticationOptions()
  const { challengeId } = await createChallenge({
    kind: 'webauthn_auth',
    data: { challenge: options.challenge },
    ttlSeconds: AUTH_TTL.challengeSeconds,
  })

  void request

  return { challengeId, options }
}

/**
 * Finishes it.
 *
 * A verified assertion with user verification is a complete sign-in: no
 * password, no TOTP. That is the owner's decision recorded in
 * `docs/v2/auth.md`, and it is sound precisely because `verifyAuthentication`
 * refuses a response whose `userVerified` flag is false.
 */
export const finishPasskeySignIn = async (options: {
  challengeId: string
  credential: Record<string, unknown>
  request: Request
  ipAddress: string
}): Promise<SignInResult> => {
  await enforceRateLimit({
    scope: SIGN_IN_SCOPE.webauthn,
    identity: options.ipAddress,
    rule: AUTH_RATE_LIMITS.webauthn,
  })

  // Spent before anything is verified: a replayed challenge is dead whatever
  // the credential turns out to be.
  const challenge = await consumeChallenge(options.challengeId, 'webauthn_auth')

  if (!challenge) throw unauthorized('That sign-in attempt expired. Try again')

  const credentialId = credentialIdFrom(options.credential)
  const stored = credentialId ? await findPasskeyByCredentialId(credentialId) : null

  if (!stored) {
    await recordSecurityEventSafely({
      kind: 'sign_in_failed',
      detail: { route: 'passkey', reason: 'unknown credential' },
      request: options.request,
      ipAddress: options.ipAddress,
    })

    throw unauthorized('That passkey did not work. Try again, or use your password')
  }

  const verification = await verifyAuthentication({
    response: options.credential as never,
    expectedChallenge: String(challenge.data.challenge ?? ''),
    credential: {
      credentialId: stored.credential_id,
      publicKey: new Uint8Array(stored.public_key as Uint8Array),
      counter: Number(stored.counter),
      transports: stored.transports ?? [],
    },
  })

  if (!verification.ok) {
    await recordSecurityEventSafely({
      ownerId: stored.owner_id,
      kind: 'sign_in_failed',
      // The library's reason names the origin it expected. Kept to a label.
      detail: { route: 'passkey', reason: 'verification failed' },
      request: options.request,
      ipAddress: options.ipAddress,
    })

    throw unauthorized('That passkey did not work. Try again, or use your password')
  }

  await touchPasskey({
    id: stored.id,
    counter: verification.newCounter,
    backedUp: verification.backedUp,
  })

  return finishSignIn({
    ownerId: stored.owner_id,
    method: 'passkey',
    request: options.request,
    ipAddress: options.ipAddress,
  })
}

/* ------------------------------------------------------------ password in */

export type PasswordStartResult =
  | { mode: 'mfa'; challengeId: string; expiresAt: Date }
  | { mode: 'enroll'; challengeId: string; expiresAt: Date }

/**
 * A dummy hash in the shape of a real one, verified against when no account
 * matches.
 *
 * Without it, an unknown address answers in a millisecond and a known one
 * answers after a full scrypt — which is an account-enumeration oracle wearing
 * a stopwatch instead of an error message.
 *
 * Made on first use, not when the module loads: a Worker forbids generating
 * random values (the salt) outside a request.
 */
let dummyHashPromise: Promise<string> | null = null

const dummyHash = (): Promise<string> =>
  (dummyHashPromise ??= hashPassword('a password that belongs to nobody at all'))

/**
 * Step one of the fallback route.
 *
 * A correct password buys a pending challenge and nothing else. It is not a
 * session, it cannot read a project, and it expires in five minutes.
 */
export const startPasswordSignIn = async (options: {
  email: string
  password: string
  request: Request
  ipAddress: string
}): Promise<PasswordStartResult> => {
  await enforceRateLimit({
    scope: SIGN_IN_SCOPE.password,
    identity: options.ipAddress,
    rule: AUTH_RATE_LIMITS.password,
  })
  await enforceRateLimit({
    scope: SIGN_IN_SCOPE.passwordAccount,
    identity: options.email.trim().toLowerCase(),
    rule: AUTH_RATE_LIMITS.passwordPerAccount,
  })

  await sweep()

  const owner = await findOwnerByEmail(options.email)
  const stored = owner?.password_hash ?? (await dummyHash())
  const correct = await verifyPassword(options.password, stored)

  if (!owner || !correct) {
    await recordSecurityEventSafely({
      ownerId: owner?.id ?? null,
      kind: 'sign_in_failed',
      detail: { route: 'password' },
      request: options.request,
      ipAddress: options.ipAddress,
    })

    throw unauthorized(GENERIC_SIGN_IN_ERROR)
  }

  /*
   * Enrollment is not access. A first correct password on an account without a
   * verified authenticator reaches a setup challenge, which the enrollment
   * routes accept and nothing else does.
   */
  const mode = owner.totp_confirmed_at ? 'mfa' : 'enroll'

  const { challengeId, expiresAt } = await createChallenge({
    kind: 'mfa_pending',
    ownerId: owner.id,
    data: { mode },
    ttlSeconds: AUTH_TTL.challengeSeconds,
  })

  return { mode, challengeId, expiresAt }
}

/**
 * Step two: the second factor.
 *
 * The challenge is read rather than consumed first, so a mistyped code costs
 * an attempt instead of the whole ceremony; it is consumed on success, or
 * burned once the attempt ceiling is reached.
 */
export const finishPasswordSignIn = async (options: {
  challengeId: string
  totpCode?: string
  recoveryCode?: string
  request: Request
  ipAddress: string
}): Promise<SignInResult> => {
  const challenge = await readChallenge(options.challengeId, 'mfa_pending')

  if (!challenge?.owner_id) throw unauthorized('That sign-in attempt expired. Start again')

  if (challenge.data.mode === 'enroll') {
    throw badRequest('Finish setting up your authenticator app first')
  }

  await enforceRateLimit({
    scope: SIGN_IN_SCOPE.recovery,
    identity: challenge.id,
    rule: AUTH_RATE_LIMITS.secondFactor,
  })

  const owner = await findOwner()

  if (!owner || owner.id !== challenge.owner_id) {
    throw unauthorized('That sign-in attempt expired. Start again')
  }

  const fail = async (reason: string): Promise<never> => {
    const { exhausted } = await recordFailedAttempt(
      challenge.id,
      AUTH_RATE_LIMITS.secondFactor.limit,
    )

    await recordSecurityEventSafely({
      ownerId: owner.id,
      kind: 'second_factor_failed',
      detail: { reason, exhausted },
      request: options.request,
      ipAddress: options.ipAddress,
    })

    // The same sentence whether the code was wrong or the tries ran out.
    throw unauthorized('That code is not right. Check your authenticator app and try again')
  }

  let method: SignInMethod

  if (options.recoveryCode) {
    if (!(await consumeRecoveryCode(owner.id, options.recoveryCode))) {
      return fail('recovery code')
    }

    method = 'password_recovery'

    await recordSecurityEventSafely({
      ownerId: owner.id,
      kind: 'recovery_code_used',
      detail: { remaining: await countUnusedRecoveryCodes(owner.id) },
      request: options.request,
      ipAddress: options.ipAddress,
    })
  } else {
    const secret = owner.totp_secret ? decryptSecret(readAuthSecret(), owner.totp_secret) : null

    if (!secret) return fail('no secret')

    const result = verifyTotp(secret, options.totpCode ?? '', {
      lastUsedStep: owner.totp_last_step == null ? null : Number(owner.totp_last_step),
    })

    if (!result.valid || result.step == null) return fail('totp')

    await rememberTotpStep(owner.id, result.step)
    method = 'password_totp'
  }

  // Only now, and only once: a second request carrying the same challenge
  // finds nothing to consume.
  if (!(await consumeChallenge(options.challengeId, 'mfa_pending'))) {
    throw unauthorized('That sign-in attempt expired. Start again')
  }

  return finishSignIn({
    ownerId: owner.id,
    method,
    request: options.request,
    ipAddress: options.ipAddress,
  })
}

/* ----------------------------------------------------------- enrollment */

/**
 * First-time setup, reached only from a setup-mode challenge.
 *
 * The secret is stored unconfirmed. Showing a QR code grants nothing: until a
 * real code is checked against that secret there is no second factor and no
 * session.
 */
export const startEnrollmentTotp = async (challengeId: string) => {
  const challenge = await readChallenge(challengeId, 'mfa_pending')

  if (!challenge?.owner_id || challenge.data.mode !== 'enroll') {
    throw unauthorized('That setup session expired. Sign in again')
  }

  const owner = await findOwner()

  if (!owner || owner.id !== challenge.owner_id) {
    throw unauthorized('That setup session expired. Sign in again')
  }

  if (owner.totp_confirmed_at) throw conflict('An authenticator app is already set up')

  const secret = generateTotpSecret()

  await setPendingTotpSecret(owner.id, encryptSecret(readAuthSecret(), secret))

  return {
    /** For the QR image. The manual key is the same secret, spelled out. */
    uri: totpUri({ secret, email: owner.email, issuer: 'Yaman Warda Dashboard' }),
    manualKey: formatSetupKey(secret),
  }
}

export type EnrollmentResult = SignInResult & { recoveryCodes: string[] }

/**
 * Verifies the first code, issues the recovery set, and only then opens a
 * session.
 *
 * The codes and the session arrive in the same response on purpose. Splitting
 * them into two requests creates a state where the owner has closed the tab
 * holding the only copy of their codes and cannot get back to it.
 */
export const confirmEnrollmentTotp = async (options: {
  challengeId: string
  code: string
  request: Request
  ipAddress: string
}): Promise<EnrollmentResult> => {
  const challenge = await readChallenge(options.challengeId, 'mfa_pending')

  if (!challenge?.owner_id || challenge.data.mode !== 'enroll') {
    throw unauthorized('That setup session expired. Sign in again')
  }

  await enforceRateLimit({
    scope: SIGN_IN_SCOPE.recovery,
    identity: challenge.id,
    rule: AUTH_RATE_LIMITS.secondFactor,
  })

  const owner = await findOwner()
  const secret = owner?.totp_secret ? decryptSecret(readAuthSecret(), owner.totp_secret) : null

  if (!owner || owner.id !== challenge.owner_id || !secret) {
    throw unauthorized('That setup session expired. Sign in again')
  }

  const result = verifyTotp(secret, options.code)

  if (!result.valid || result.step == null) {
    await recordFailedAttempt(challenge.id, AUTH_RATE_LIMITS.secondFactor.limit)

    throw unauthorized('That code is not right. Check your authenticator app and try again')
  }

  if (!(await consumeChallenge(options.challengeId, 'mfa_pending'))) {
    throw unauthorized('That setup session expired. Sign in again')
  }

  const codes = generateRecoveryCodes()

  await confirmTotp(owner.id, result.step)
  await replaceRecoveryCodes(owner.id, codes)
  await markRecoveryCodesIssued(owner.id)

  await recordSecurityEventSafely({
    ownerId: owner.id,
    kind: 'totp_enrolled',
    request: options.request,
    ipAddress: options.ipAddress,
  })
  await recordSecurityEventSafely({
    ownerId: owner.id,
    kind: 'recovery_codes_issued',
    detail: { count: codes.length },
    request: options.request,
    ipAddress: options.ipAddress,
  })

  const session = await finishSignIn({
    ownerId: owner.id,
    method: 'password_totp',
    request: options.request,
    ipAddress: options.ipAddress,
  })

  return { ...session, recoveryCodes: codes.map(formatRecoveryCode) }
}

/* -------------------------------------------------------- reset / change */

/**
 * The shared tail of every route that is allowed to create a session.
 *
 * Extracted so there is exactly one place in the module where a cookie comes
 * into existence, and so the audit entry cannot be forgotten at a call site.
 */
const finishSignIn = async (options: {
  ownerId: string
  method: SignInMethod
  request: Request
  ipAddress: string
}): Promise<SignInResult> => {
  const owner = await findOwner()

  if (!owner || owner.id !== options.ownerId) throw unauthorized('Sign in again')

  const session = await createSession({
    ownerId: options.ownerId,
    method: options.method,
    request: options.request,
    ipAddress: options.ipAddress,
  })

  await recordSecurityEventSafely({
    ownerId: options.ownerId,
    kind:
      options.method === 'passkey'
        ? 'sign_in_passkey'
        : options.method === 'password_totp'
          ? 'sign_in_password_totp'
          : 'sign_in_password_recovery',
    request: options.request,
    ipAddress: options.ipAddress,
  })

  return { ...session, email: owner.email }
}

/**
 * A reset link, or the appearance of one.
 *
 * The answer is identical for a registered and an unregistered address, and
 * the mail configuration is checked first — before any lookup — so a broken
 * sender cannot become the thing that distinguishes them.
 */
export const requestPasswordReset = async (options: {
  email: string
  baseUrl: string
  request: Request
  ipAddress: string
}): Promise<void> => {
  assertMailAvailable()

  await enforceRateLimit({
    scope: 'auth-reset',
    identity: options.ipAddress,
    rule: AUTH_RATE_LIMITS.recovery,
  })

  const owner = await findOwnerByEmail(options.email)

  if (!owner) return

  const token = newOpaqueSecret()

  await issueAuthToken({
    ownerId: owner.id,
    kind: 'password_reset',
    tokenHash: hashOpaqueSecret(token),
    ttlSeconds: AUTH_TTL.passwordResetSeconds,
  })

  await recordSecurityEventSafely({
    ownerId: owner.id,
    kind: 'password_reset_requested',
    request: options.request,
    ipAddress: options.ipAddress,
  })

  // The token travels in the URL fragment-free path of a link the owner
  // clicks; it is never logged, and never returned in this function's result.
  await sendMail(
    passwordResetMail({
      to: owner.email,
      link: `${options.baseUrl}/dashboard/login/reset?token=${token}`,
    }),
  )
}

/**
 * Spends the link and sets the new password.
 *
 * Resetting never disables the second factor and never removes a passkey. The
 * next sign-in still needs one of them — which is the difference between "I
 * forgot my password" and "email is now the only key to the account".
 */
export const completePasswordReset = async (options: {
  token: string
  newPassword: string
  request: Request
  ipAddress: string
}): Promise<void> => {
  await enforceRateLimit({
    scope: 'auth-reset-complete',
    identity: options.ipAddress,
    rule: AUTH_RATE_LIMITS.recovery,
  })

  const record = await consumeAuthToken(hashOpaqueSecret(options.token), 'password_reset')

  if (!record) throw unauthorized('That link has expired or was already used')

  await setPasswordHash(record.owner_id, await hashPassword(options.newPassword))
  await revokeAllSessions({ ownerId: record.owner_id, reason: 'password reset' })
  await revokeChallenges(record.owner_id, ['mfa_pending', 'step_up'])

  const owner = await findOwner()

  await recordSecurityEventSafely({
    ownerId: record.owner_id,
    kind: 'password_reset_completed',
    request: options.request,
    ipAddress: options.ipAddress,
  })

  if (owner) {
    await sendMail(
      securityNoticeMail({
        to: owner.email,
        what: 'Your dashboard password was reset.',
      }),
    ).catch(() => {})
  }
}

/**
 * Confirms a new address.
 *
 * The old address stays active until this runs, so a mistyped new address
 * cannot lock the owner out of their own account.
 */
export const confirmEmailChange = async (options: {
  token: string
  request: Request
  ipAddress: string
}): Promise<{ email: string }> => {
  await enforceRateLimit({
    scope: 'auth-email-change',
    identity: options.ipAddress,
    rule: AUTH_RATE_LIMITS.recovery,
  })

  const record = await consumeAuthToken(hashOpaqueSecret(options.token), 'email_change')

  if (!record?.new_email) throw unauthorized('That link has expired or was already used')

  const previous = await findOwner()

  await setEmail(record.owner_id, record.new_email)
  await revokeAllSessions({ ownerId: record.owner_id, reason: 'email changed' })

  await recordSecurityEventSafely({
    ownerId: record.owner_id,
    kind: 'email_changed',
    request: options.request,
    ipAddress: options.ipAddress,
  })

  if (previous) {
    await sendMail(
      emailChangeNoticeMail({ to: previous.email, newEmail: record.new_email }),
    ).catch(() => {})
  }

  return { email: record.new_email }
}

/** Sends the confirmation to the address that is being proposed, not the current one. */
export const sendEmailChangeConfirmation = async (options: {
  ownerId: string
  newEmail: string
  baseUrl: string
}): Promise<void> => {
  const token = newOpaqueSecret()

  await issueAuthToken({
    ownerId: options.ownerId,
    kind: 'email_change',
    tokenHash: hashOpaqueSecret(token),
    newEmail: options.newEmail,
    ttlSeconds: AUTH_TTL.emailChangeSeconds,
  })

  await sendMail(
    emailChangeMail({
      to: options.newEmail,
      link: `${options.baseUrl}/dashboard/login/confirm-email?token=${token}`,
    }),
  )
}

/** Only for the bootstrap CLI's verification step. Never reachable over HTTP. */
export const previewCurrentTotpCode = (secret: string): string => currentTotpCode(secret)
