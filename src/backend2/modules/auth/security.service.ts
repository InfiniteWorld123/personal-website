import {
  AUTH_RATE_LIMITS,
  AUTH_TTL,
  SESSION_PAGE_SIZE,
  type PasskeySummary,
  type SecurityOverview,
  type SessionPage,
  type SignInMethod,
  inferDevice,
} from '../../contracts/auth.contract'
import { listRecentSecurityEvents, recordSecurityEventSafely } from '../../auth/audit'
import {
  consumeChallenge,
  createChallenge,
  readChallenge,
  revokeChallenges,
} from '../../auth/challenges'
import { readAuthSecret } from '../../auth/config'
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  verifyPassword,
} from '../../auth/crypto'
import { securityNoticeMail, sendMail } from '../../auth/mail'
import { enforceRateLimit } from '../../auth/rate-limit'
import { formatRecoveryCode, generateRecoveryCodes } from '../../auth/recovery'
import {
  type OwnerSession,
  revokeAllSessions,
  revokeSession,
} from '../../auth/session'
import { formatSetupKey, generateTotpSecret, totpUri, verifyTotp } from '../../auth/totp'
import {
  buildRegistrationOptions,
  credentialIdFrom,
  verifyAuthentication,
  verifyRegistration,
} from '../../auth/webauthn'
import { getDb } from '../../db/client'
import { badRequest, conflict, notFound, stepUpRequired, unauthorized } from '../../http/error'
import { sendEmailChangeConfirmation } from './auth.service'
import {
  confirmTotp,
  consumeRecoveryCode,
  countPasskeys,
  countUnusedRecoveryCodes,
  deletePasskey,
  findOwner,
  findPasskeyByCredentialId,
  findPendingEmailChange,
  insertPasskey,
  listPasskeys,
  markRecoveryCodesIssued,
  replaceRecoveryCodes,
  setPasswordHash,
  setPendingTotpSecret,
  touchPasskey,
} from './owner.repo'

/**
 * Security Settings: everything the owner can change about how they sign in.
 *
 * Every mutation here needs a *fresh* proof, not merely a valid cookie.
 * `docs/v2/auth.md`: "Security changes require fresh passkey verification or
 * the full password+TOTP/recovery-code fallback, not merely a still-valid
 * cookie." A stolen laptop with an open session can read the Dashboard; it
 * cannot quietly add its own passkey.
 */

export type StepUpScope =
  | 'passkeys'
  | 'totp'
  | 'recovery-codes'
  | 'password'
  | 'email'
  | 'sessions'

/* ------------------------------------------------------------- step-up */

type ReverifyProof = {
  challengeId?: string
  credential?: Record<string, unknown>
  password?: string
  totpCode?: string
  recoveryCode?: string
}

/**
 * Proves it is the owner again, for one scope.
 *
 * The result is a short-lived capability, not a longer session: it expires in
 * five minutes, names the single action it was granted for, and is spent by
 * that action. It is returned in the body and travels in a header — never a
 * cookie, because a cookie is exactly the thing it exists to be stronger than.
 */
export const reverify = async (options: {
  session: OwnerSession
  scope: StepUpScope
  proof: ReverifyProof
  request: Request
  ipAddress: string
}): Promise<{ stepUpToken: string; expiresAt: Date }> => {
  await enforceRateLimit({
    scope: 'auth-step-up',
    identity: options.session.id,
    rule: AUTH_RATE_LIMITS.stepUp,
  })

  const owner = await findOwner()

  if (!owner || owner.id !== options.session.ownerId) throw unauthorized('Sign in again')

  const fail = async (reason: string): Promise<never> => {
    await recordSecurityEventSafely({
      ownerId: owner.id,
      kind: 'step_up_failed',
      detail: { scope: options.scope, reason },
      request: options.request,
      ipAddress: options.ipAddress,
    })

    throw stepUpRequired('That did not confirm. Try again')
  }

  if (options.proof.credential && options.proof.challengeId) {
    const challenge = await consumeChallenge(options.proof.challengeId, 'webauthn_auth')

    if (!challenge) return fail('challenge expired')

    const credentialId = credentialIdFrom(options.proof.credential)
    const stored = credentialId ? await findPasskeyByCredentialId(credentialId) : null

    // A passkey that is not this owner's proves nothing about this owner.
    if (!stored || stored.owner_id !== owner.id) return fail('unknown credential')

    const verification = await verifyAuthentication({
      response: options.proof.credential as never,
      expectedChallenge: String(challenge.data.challenge ?? ''),
      credential: {
        credentialId: stored.credential_id,
        publicKey: new Uint8Array(stored.public_key as Uint8Array),
        counter: Number(stored.counter),
        transports: stored.transports ?? [],
      },
    })

    if (!verification.ok) return fail('verification failed')

    await touchPasskey({
      id: stored.id,
      counter: verification.newCounter,
      backedUp: verification.backedUp,
    })
  } else {
    const correct =
      owner.password_hash != null &&
      (await verifyPassword(options.proof.password ?? '', owner.password_hash))

    if (!correct) return fail('password')

    if (options.proof.recoveryCode) {
      if (!(await consumeRecoveryCode(owner.id, options.proof.recoveryCode))) {
        return fail('recovery code')
      }
    } else {
      const secret = owner.totp_secret
        ? decryptSecret(readAuthSecret(), owner.totp_secret)
        : null
      const result = secret
        ? verifyTotp(secret, options.proof.totpCode ?? '', {
            lastUsedStep: owner.totp_last_step == null ? null : Number(owner.totp_last_step),
          })
        : { valid: false, step: null }

      if (!result.valid) return fail('totp')
    }
  }

  const { challengeId, expiresAt } = await createChallenge({
    kind: 'step_up',
    ownerId: owner.id,
    data: { scope: options.scope, sessionId: options.session.id },
    ttlSeconds: AUTH_TTL.stepUpSeconds,
  })

  await recordSecurityEventSafely({
    ownerId: owner.id,
    kind: 'step_up_granted',
    detail: { scope: options.scope },
    request: options.request,
    ipAddress: options.ipAddress,
  })

  return { stepUpToken: challengeId, expiresAt }
}

const matches = (
  challenge: { owner_id: string | null; data: Record<string, unknown> } | null,
  session: OwnerSession,
  scope: StepUpScope,
): boolean =>
  Boolean(
    challenge &&
      challenge.owner_id === session.ownerId &&
      challenge.data.scope === scope &&
      // Bound to the session that earned it: a capability lifted from one
      // browser is useless in another.
      challenge.data.sessionId === session.id,
  )

/**
 * Checks a capability without spending it.
 *
 * Used by the first half of a two-request ceremony — asking the browser for a
 * new passkey, say — so the token is still there for the request that actually
 * changes something.
 */
export const readStepUp = async (
  session: OwnerSession,
  scope: StepUpScope,
  token: string | null,
): Promise<void> => {
  if (!token) throw stepUpRequired()

  const challenge = await readChallenge(token, 'step_up')

  if (!matches(challenge, session, scope)) throw stepUpRequired()
}

/** Checks it and spends it. Every mutation below ends up here. */
export const consumeStepUp = async (
  session: OwnerSession,
  scope: StepUpScope,
  token: string | null,
): Promise<void> => {
  if (!token) throw stepUpRequired()

  const challenge = await readChallenge(token, 'step_up')

  if (!matches(challenge, session, scope)) throw stepUpRequired()
  if (!(await consumeChallenge(token, 'step_up'))) throw stepUpRequired()
}

/* ------------------------------------------------------------ overview */

const toPasskeySummary = (row: {
  id: string
  name: string
  created_at: Date
  last_used_at: Date | null
  device_type: string
}): PasskeySummary => ({
  id: row.id,
  name: row.name,
  createdAt: new Date(row.created_at).toISOString(),
  lastUsedAt: row.last_used_at ? new Date(row.last_used_at).toISOString() : null,
  syncedAcrossDevices: row.device_type === 'multiDevice',
})

export const securityOverview = async (session: OwnerSession): Promise<SecurityOverview> => {
  const owner = await findOwner()

  if (!owner || owner.id !== session.ownerId) throw unauthorized('Sign in again')

  /*
   * One after another, not `Promise.all`.
   *
   * Each query would take its own connection out of the pool, and on a
   * Cloudflare Worker a request may hold only six open sockets at once — a
   * ceiling this one endpoint would sit right on top of. For a settings page
   * that one person opens, a handful of sequential round trips costs nothing
   * worth having.
   */
  const passkeys = await listPasskeys(owner.id)
  const recoveryRemaining = await countUnusedRecoveryCodes(owner.id)
  const pendingEmail = await findPendingEmailChange(owner.id)
  const events = await listRecentSecurityEvents(owner.id)
  const sessions = await listSessions(session, 1)

  return {
    owner: {
      email: owner.email,
      accessState: owner.totp_confirmed_at && owner.recovery_codes_issued_at
        ? 'active'
        : 'enrolling',
      factors: {
        password: Boolean(owner.password_hash),
        totp: Boolean(owner.totp_confirmed_at),
        passkeys: passkeys.length,
        recoveryCodesRemaining: recoveryRemaining,
      },
    },
    passkeys: passkeys.map(toPasskeySummary),
    sessions,
    pendingEmailChange: pendingEmail
      ? {
          newEmail: pendingEmail.newEmail,
          expiresAt: pendingEmail.expiresAt.toISOString(),
        }
      : null,
    recentEvents: events,
  }
}

/* ------------------------------------------------------------ passkeys */

export const startPasskeyRegistration = async (options: {
  session: OwnerSession
  stepUpToken: string | null
}) => {
  await readStepUp(options.session, 'passkeys', options.stepUpToken)

  const owner = await findOwner()

  if (!owner) throw unauthorized('Sign in again')

  const existing = await listPasskeys(owner.id)
  const registration = await buildRegistrationOptions({
    ownerId: owner.id,
    email: owner.email,
    existing: existing.map((row) => ({
      credentialId: row.credential_id,
      transports: row.transports ?? [],
    })),
  })

  const { challengeId } = await createChallenge({
    kind: 'webauthn_register',
    ownerId: owner.id,
    data: { challenge: registration.challenge },
    ttlSeconds: AUTH_TTL.challengeSeconds,
  })

  return { challengeId, options: registration }
}

export const finishPasskeyRegistration = async (options: {
  session: OwnerSession
  stepUpToken: string | null
  challengeId: string
  credential: Record<string, unknown>
  name: string
  request: Request
  ipAddress: string
}): Promise<PasskeySummary> => {
  await consumeStepUp(options.session, 'passkeys', options.stepUpToken)

  const challenge = await consumeChallenge(options.challengeId, 'webauthn_register')

  if (!challenge || challenge.owner_id !== options.session.ownerId) {
    throw badRequest('That registration expired. Start again')
  }

  const verification = await verifyRegistration({
    response: options.credential as never,
    expectedChallenge: String(challenge.data.challenge ?? ''),
  })

  if (!verification.ok) {
    throw badRequest('That passkey could not be registered. Try again')
  }

  const id = await insertPasskey({
    ownerId: options.session.ownerId,
    credentialId: verification.credentialId,
    publicKey: verification.publicKey,
    counter: verification.counter,
    transports: verification.transports,
    deviceType: verification.deviceType,
    backedUp: verification.backedUp,
    name: options.name,
  })

  await recordSecurityEventSafely({
    ownerId: options.session.ownerId,
    kind: 'passkey_registered',
    detail: { name: options.name },
    request: options.request,
    ipAddress: options.ipAddress,
  })

  return {
    id,
    name: options.name,
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    syncedAcrossDevices: verification.deviceType === 'multiDevice',
  }
}

/**
 * Removes one.
 *
 * The password and TOTP route is what keeps this safe: a passkey may always be
 * removed, because the fallback remains. Removing the *last* way in is a
 * different question, and `removeLastFactorGuard` below is the one place that
 * answers it.
 */
export const removePasskey = async (options: {
  session: OwnerSession
  stepUpToken: string | null
  passkeyId: string
  request: Request
  ipAddress: string
}): Promise<void> => {
  await consumeStepUp(options.session, 'passkeys', options.stepUpToken)

  const owner = await findOwner()

  if (!owner) throw unauthorized('Sign in again')

  /*
   * "Never leave the account with no usable sign-in path"
   * (`docs/v2/auth.md`). The fallback counts as a path only when it is whole:
   * a password with no verified authenticator is not a way back in.
   */
  const fallbackUsable = Boolean(owner.password_hash && owner.totp_confirmed_at)
  const remaining = (await countPasskeys(owner.id)) - 1

  if (remaining < 1 && !fallbackUsable) {
    throw conflict(
      'That is the only way into this account. Set up your authenticator app before removing it',
    )
  }

  if (!(await deletePasskey(owner.id, options.passkeyId))) throw notFound('No such passkey')

  await recordSecurityEventSafely({
    ownerId: owner.id,
    kind: 'passkey_removed',
    request: options.request,
    ipAddress: options.ipAddress,
  })
}

/* ---------------------------------------------------------------- TOTP */

/**
 * Enrolls or replaces the authenticator.
 *
 * The new secret is stored unconfirmed, so a ceremony abandoned halfway leaves
 * the old one in force — the owner is never left holding a QR code they did
 * not finish scanning and no working second factor.
 */
export const startTotpEnrollment = async (options: {
  session: OwnerSession
  stepUpToken: string | null
}) => {
  await readStepUp(options.session, 'totp', options.stepUpToken)

  const owner = await findOwner()

  if (!owner) throw unauthorized('Sign in again')

  const secret = generateTotpSecret()

  await setPendingTotpSecret(owner.id, encryptSecret(readAuthSecret(), secret))

  const { challengeId } = await createChallenge({
    kind: 'step_up',
    ownerId: owner.id,
    data: { scope: 'totp-confirm', sessionId: options.session.id },
    ttlSeconds: AUTH_TTL.challengeSeconds,
  })

  return {
    challengeId,
    uri: totpUri({ secret, email: owner.email, issuer: 'Yaman Warda Dashboard' }),
    manualKey: formatSetupKey(secret),
  }
}

export const confirmTotpEnrollment = async (options: {
  session: OwnerSession
  stepUpToken: string | null
  challengeId: string
  code: string
  request: Request
  ipAddress: string
}): Promise<{ recoveryCodes: string[] }> => {
  await consumeStepUp(options.session, 'totp', options.stepUpToken)

  const confirmation = await readChallenge(options.challengeId, 'step_up')

  if (
    !confirmation ||
    confirmation.owner_id !== options.session.ownerId ||
    confirmation.data.scope !== 'totp-confirm'
  ) {
    throw badRequest('That setup expired. Start again')
  }

  const owner = await findOwner()
  const secret = owner?.totp_secret ? decryptSecret(readAuthSecret(), owner.totp_secret) : null

  if (!owner || !secret) throw badRequest('That setup expired. Start again')

  const result = verifyTotp(secret, options.code)

  if (!result.valid || result.step == null) {
    throw badRequest('That code is not right. Check your authenticator app and try again')
  }

  await consumeChallenge(options.challengeId, 'step_up')
  await confirmTotp(owner.id, result.step)

  // Replacing the authenticator replaces the codes that stand in for it:
  // a set printed for the old device should not survive it.
  const codes = generateRecoveryCodes()

  await replaceRecoveryCodes(owner.id, codes)
  await markRecoveryCodesIssued(owner.id)

  await recordSecurityEventSafely({
    ownerId: owner.id,
    kind: 'totp_replaced',
    request: options.request,
    ipAddress: options.ipAddress,
  })

  await sendMail(
    securityNoticeMail({
      to: owner.email,
      what: 'The authenticator app on your dashboard account was replaced.',
    }),
  ).catch(() => {})

  return { recoveryCodes: codes.map(formatRecoveryCode) }
}

/* ------------------------------------------------------ recovery codes */

export const rotateRecoveryCodes = async (options: {
  session: OwnerSession
  stepUpToken: string | null
  request: Request
  ipAddress: string
}): Promise<{ recoveryCodes: string[] }> => {
  await consumeStepUp(options.session, 'recovery-codes', options.stepUpToken)

  const owner = await findOwner()

  if (!owner) throw unauthorized('Sign in again')

  const codes = generateRecoveryCodes()

  // One transaction inside the repository: the old set is invalid the moment
  // the new one exists, with no window in between where neither works.
  await replaceRecoveryCodes(owner.id, codes)
  await markRecoveryCodesIssued(owner.id)

  await recordSecurityEventSafely({
    ownerId: owner.id,
    kind: 'recovery_codes_issued',
    detail: { count: codes.length, rotated: true },
    request: options.request,
    ipAddress: options.ipAddress,
  })

  return { recoveryCodes: codes.map(formatRecoveryCode) }
}

/* ------------------------------------------------- password and email */

export const changePassword = async (options: {
  session: OwnerSession
  stepUpToken: string | null
  newPassword: string
  request: Request
  ipAddress: string
}): Promise<void> => {
  await consumeStepUp(options.session, 'password', options.stepUpToken)

  const owner = await findOwner()

  if (!owner) throw unauthorized('Sign in again')

  await setPasswordHash(owner.id, await hashPassword(options.newPassword))

  // Every session, including this one: the specification says the owner signs
  // in again after a password change, and sparing the current browser would
  // make that a half-measure.
  await revokeAllSessions({ ownerId: owner.id, reason: 'password changed' })
  await revokeChallenges(owner.id, ['step_up', 'mfa_pending'])

  await recordSecurityEventSafely({
    ownerId: owner.id,
    kind: 'password_changed',
    request: options.request,
    ipAddress: options.ipAddress,
  })

  await sendMail(
    securityNoticeMail({ to: owner.email, what: 'Your dashboard password was changed.' }),
  ).catch(() => {})
}

export const requestEmailChange = async (options: {
  session: OwnerSession
  stepUpToken: string | null
  newEmail: string
  baseUrl: string
  request: Request
  ipAddress: string
}): Promise<{ newEmail: string }> => {
  await consumeStepUp(options.session, 'email', options.stepUpToken)

  const owner = await findOwner()

  if (!owner) throw unauthorized('Sign in again')
  if (owner.email === options.newEmail) throw conflict('That is already your address')

  await sendEmailChangeConfirmation({
    ownerId: owner.id,
    newEmail: options.newEmail,
    baseUrl: options.baseUrl,
  })

  await recordSecurityEventSafely({
    ownerId: owner.id,
    kind: 'email_change_requested',
    request: options.request,
    ipAddress: options.ipAddress,
  })

  // The old mailbox is where a change nobody asked for would be noticed.
  await sendMail(
    securityNoticeMail({
      to: owner.email,
      what: `A change of this account's email address to ${options.newEmail} was requested. It is not active until confirmed at the new address.`,
    }),
  ).catch(() => {})

  return { newEmail: options.newEmail }
}

/* -------------------------------------------------------------- sessions */

/**
 * The owner's open sessions, paginated server-side.
 *
 * `AGENTS.md` asks for bounded pagination on every independently browsable
 * list "even when the collection is currently small", and this one is exactly
 * that kind of list: usually two rows, occasionally the evidence that
 * something is wrong.
 */
export const listSessions = async (
  session: OwnerSession,
  page: number,
): Promise<SessionPage> => {
  const pageSize = SESSION_PAGE_SIZE
  const safePage = Math.max(1, Math.floor(page))

  const { rows: countRows } = await getDb().query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM v2_owner_sessions
      WHERE owner_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
    [session.ownerId],
  )

  const { rows } = await getDb().query<{
    id: string
    method: SignInMethod
    authenticated_at: Date
    expires_at: Date
    last_seen_at: Date | null
    user_agent: string | null
  }>(
    `SELECT id, method, authenticated_at, expires_at, last_seen_at, user_agent
       FROM v2_owner_sessions
      WHERE owner_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      ORDER BY authenticated_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [session.ownerId, pageSize, (safePage - 1) * pageSize],
  )

  const total = Number(countRows[0]?.count ?? 0)

  return {
    items: rows.map((row) => ({
      id: row.id,
      method: row.method,
      authenticatedAt: new Date(row.authenticated_at).toISOString(),
      expiresAt: new Date(row.expires_at).toISOString(),
      lastSeenAt: row.last_seen_at ? new Date(row.last_seen_at).toISOString() : null,
      inferredDevice: inferDevice(row.user_agent),
      isCurrent: row.id === session.id,
    })),
    page: safePage,
    pageSize,
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: safePage * pageSize < total,
  }
}

/**
 * Ends one other session.
 *
 * No step-up: signing a lost device out is the thing a worried owner should be
 * able to do instantly. Ending *every* session, which also ends this one, does
 * require the proof.
 */
export const revokeOneSession = async (options: {
  session: OwnerSession
  sessionId: string
  request: Request
  ipAddress: string
}): Promise<void> => {
  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_owner_sessions WHERE id = $1 AND owner_id = $2',
    [options.sessionId, options.session.ownerId],
  )

  if (rows.length === 0) throw notFound('No such session')

  await revokeSession(options.sessionId, 'revoked by owner')

  await recordSecurityEventSafely({
    ownerId: options.session.ownerId,
    kind: 'session_revoked',
    detail: { wasCurrent: options.sessionId === options.session.id },
    request: options.request,
    ipAddress: options.ipAddress,
  })
}

export const revokeEverySession = async (options: {
  session: OwnerSession
  stepUpToken: string | null
  request: Request
  ipAddress: string
}): Promise<{ revoked: number }> => {
  await consumeStepUp(options.session, 'sessions', options.stepUpToken)

  const revoked = await revokeAllSessions({
    ownerId: options.session.ownerId,
    reason: 'signed out everywhere',
  })

  await revokeChallenges(options.session.ownerId, ['step_up', 'mfa_pending'])

  await recordSecurityEventSafely({
    ownerId: options.session.ownerId,
    kind: 'sessions_revoked',
    detail: { revoked },
    request: options.request,
    ipAddress: options.ipAddress,
  })

  return { revoked }
}
