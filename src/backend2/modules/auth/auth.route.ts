import { Elysia } from 'elysia'
import {
  EmailOnlySchema,
  EnrollmentStartSchema,
  NEUTRAL_RECOVERY_MESSAGE,
  PasskeyFinishSchema,
  PasswordFinishSchema,
  PasswordResetCompleteSchema,
  PasswordStartSchema,
  TokenOnlySchema,
  TotpConfirmSchema,
} from '../../contracts/auth.contract'
import { recordSecurityEventSafely } from '../../auth/audit'
import { authJson, readBaseUrl } from '../../auth/http'
import { requestIdentity } from '../../auth/rate-limit'
import {
  clearedSessionCookies,
  readSessionFromRequest,
  sessionCookies,
} from '../../auth/session'
import { readJsonBody } from '../../http/body'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import {
  completePasswordReset,
  confirmEmailChange,
  confirmEnrollmentTotp,
  finishPasskeySignIn,
  finishPasswordSignIn,
  requestPasswordReset,
  startEnrollmentTotp,
  startPasskeySignIn,
  startPasswordSignIn,
} from './auth.service'
import { revokeSession } from '../../auth/session'

/**
 * The public half of Auth V2: the routes a signed-out browser may reach.
 *
 * Public does not mean unguarded. Every one of them is rate-limited
 * server-side, answers in the same words whether or not an account exists, and
 * returns `Cache-Control: no-store`. There is no registration endpoint here,
 * and there is no path through this file that produces a session without a
 * verified factor.
 *
 * Thin, like the Projects routes: parse, delegate, respond.
 */
export const publicAuthRoutes = new Elysia({ prefix: '/auth' })
  /* ------------------------------------------------------------- passkey */
  .post('/passkey/start', async ({ request }) => {
    const result = await startPasskeySignIn(request, requestIdentity(request))

    return authJson({
      data: { challengeId: result.challengeId, options: result.options },
      message: 'Ready for your passkey',
    })
  })
  .post('/passkey/finish', async ({ request }) => {
    const input = parseInput(PasskeyFinishSchema, await readJsonBody(request))
    const result = await finishPasskeySignIn({
      challengeId: input.challengeId,
      credential: input.credential,
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      // The session secret is in the cookie and nowhere else. A body that also
      // carried it would survive in logs and in the browser's memory.
      data: { email: result.email, expiresAt: result.expiresAt.toISOString() },
      message: 'Signed in',
      cookies: sessionCookies(result),
    })
  })
  /* ------------------------------------------------------------ password */
  .post('/password/start', async ({ request }) => {
    const input = parseInput(PasswordStartSchema, await readJsonBody(request))
    const result = await startPasswordSignIn({
      email: input.email,
      password: input.password,
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      /*
       * A challenge id, never a session. `mode` tells the screen whether to
       * ask for a code or to start first-time setup; it says nothing about
       * the account that a correct password had not already revealed.
       */
      data: {
        mode: result.mode,
        challengeId: result.challengeId,
        expiresAt: result.expiresAt.toISOString(),
      },
      message: result.mode === 'enroll' ? 'Set up two-factor authentication' : 'Enter your code',
    })
  })
  .post('/password/finish', async ({ request }) => {
    const input = parseInput(PasswordFinishSchema, await readJsonBody(request))
    const result = await finishPasswordSignIn({
      challengeId: input.challengeId,
      totpCode: input.totpCode,
      recoveryCode: input.recoveryCode,
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      data: { email: result.email, expiresAt: result.expiresAt.toISOString() },
      message: 'Signed in',
      cookies: sessionCookies(result),
    })
  })
  /* ---------------------------------------------------------- enrollment */
  .post('/enrollment/totp/start', async ({ request }) => {
    const input = parseInput(EnrollmentStartSchema, await readJsonBody(request))
    const result = await startEnrollmentTotp(input.challengeId)

    return authJson({ data: result, message: 'Scan this with your authenticator app' })
  })
  .post('/enrollment/totp/confirm', async ({ request }) => {
    const input = parseInput(TotpConfirmSchema, await readJsonBody(request))
    const result = await confirmEnrollmentTotp({
      challengeId: input.challengeId,
      code: input.code,
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      /*
       * The only time recovery codes ever appear in a response. They are shown
       * once, in the same reply that opens the session, so the owner cannot
       * end up holding access without a way back in.
       */
      data: {
        email: result.email,
        expiresAt: result.expiresAt.toISOString(),
        recoveryCodes: result.recoveryCodes,
      },
      message: 'Two-factor authentication is on. Save these codes somewhere safe',
      cookies: sessionCookies(result),
    })
  })
  /* -------------------------------------------------------------- reset */
  .post('/password-reset/request', async ({ request }) => {
    const input = parseInput(EmailOnlySchema, await readJsonBody(request))

    await requestPasswordReset({
      email: input.email,
      baseUrl: readBaseUrl(),
      request,
      ipAddress: requestIdentity(request),
    })

    // Always the same answer, always with no hint of what was found. The link
    // itself never appears here, in development or anywhere else.
    return authJson({ data: null, message: NEUTRAL_RECOVERY_MESSAGE })
  })
  .post('/password-reset/complete', async ({ request }) => {
    const input = parseInput(PasswordResetCompleteSchema, await readJsonBody(request))

    await completePasswordReset({
      token: input.token,
      newPassword: input.newPassword,
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      data: null,
      message: 'Your password is set. Sign in with your passkey or your second factor',
      // Whatever was open before is gone; the browser should stop pretending
      // otherwise.
      cookies: clearedSessionCookies(),
    })
  })
  .post('/email-change/confirm', async ({ request }) => {
    const input = parseInput(TokenOnlySchema, await readJsonBody(request))
    const result = await confirmEmailChange({
      token: input.token,
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      data: { email: result.email },
      message: 'That address is now your sign-in email. Sign in again',
      cookies: clearedSessionCookies(),
    })
  })
  /* -------------------------------------------------------------- logout */
  .post('/logout', async ({ request }) => {
    const session = await readSessionFromRequest(request)

    /*
     * No CSRF check and no 401. Signing out is the one write where a forged
     * request costs the owner a click, while a refusal could leave a session
     * open on a machine they are walking away from. It always clears the
     * cookies, even when there was nothing to revoke.
     */
    if (session) {
      await revokeSession(session.id, 'signed out')
      await recordSecurityEventSafely({
        ownerId: session.ownerId,
        kind: 'sign_out',
        request,
        ipAddress: requestIdentity(request),
      })
    }

    return authJson({
      data: null,
      message: 'Signed out',
      status: HttpStatus.OK,
      cookies: clearedSessionCookies(),
    })
  })
