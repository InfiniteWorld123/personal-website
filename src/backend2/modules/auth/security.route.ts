import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  EmailChangeRequestSchema,
  PasskeyRegisterFinishSchema,
  PasswordChangeSchema,
  ReverifySchema,
  SessionListQuerySchema,
  TotpConfirmSchema,
} from '../../contracts/auth.contract'
import { authJson, readBaseUrl, readStepUpToken } from '../../auth/http'
import { requestIdentity } from '../../auth/rate-limit'
import { clearedSessionCookies } from '../../auth/session'
import { readJsonBody } from '../../http/body'
import { parseInput } from '../../http/validate'
import { ownerSessionGuard } from '../../security/owner-guard'
import {
  changePassword,
  confirmTotpEnrollment,
  finishPasskeyRegistration,
  listSessions,
  removePasskey,
  requestEmailChange,
  reverify,
  revokeEverySession,
  revokeOneSession,
  rotateRecoveryCodes,
  securityOverview,
  startPasskeyRegistration,
  startTotpEnrollment,
} from './security.service'

const SessionIdSchema = v.pipe(v.string(), v.uuid('That is not a session id'))
const PasskeyIdSchema = v.pipe(v.string(), v.uuid('That is not a passkey id'))

/**
 * Security Settings, on the server.
 *
 * Unlike the Projects routes, these do not ride the switchable guard: they
 * require a session unconditionally, because there was never a phase in which
 * they should not have. Every route that *changes* a sign-in factor also
 * demands a step-up capability from the `x-v2-step-up` header, which the owner
 * earns at `/reverify` by proving themselves again — not merely by still
 * holding a valid cookie.
 */
export const ownerSecurityRoutes = new Elysia({ prefix: '/security' })
  .use(ownerSessionGuard)
  .get('/', async ({ session }) =>
    authJson({ data: await securityOverview(session), message: 'Security settings loaded' }),
  )
  .post('/reverify', async ({ request, session }) => {
    const input = parseInput(ReverifySchema, await readJsonBody(request))
    const result = await reverify({
      session,
      scope: input.scope,
      proof: {
        challengeId: input.challengeId,
        credential: input.credential,
        password: input.password,
        totpCode: input.totpCode,
        recoveryCode: input.recoveryCode,
      },
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      /*
       * Returned in the body, to be echoed back in a header. Never a cookie:
       * a cookie is sent automatically, which is precisely the property this
       * capability must not have.
       */
      data: {
        stepUpToken: result.stepUpToken,
        expiresAt: result.expiresAt.toISOString(),
        scope: input.scope,
      },
      message: 'Confirmed',
    })
  })
  /* ------------------------------------------------------------- passkeys */
  .post('/passkeys/start', async ({ request, session }) => {
    const result = await startPasskeyRegistration({
      session,
      stepUpToken: readStepUpToken(request),
    })

    return authJson({
      data: { challengeId: result.challengeId, options: result.options },
      message: 'Ready to register a passkey',
    })
  })
  .post('/passkeys/finish', async ({ request, session }) => {
    const input = parseInput(PasskeyRegisterFinishSchema, await readJsonBody(request))
    const passkey = await finishPasskeyRegistration({
      session,
      stepUpToken: readStepUpToken(request),
      challengeId: input.challengeId,
      credential: input.credential,
      name: input.name,
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({ data: passkey, message: 'Passkey registered' })
  })
  .delete('/passkeys/:id', async ({ params, request, session }) => {
    await removePasskey({
      session,
      stepUpToken: readStepUpToken(request),
      passkeyId: parseInput(PasskeyIdSchema, params.id),
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({ data: null, message: 'Passkey removed' })
  })
  /* ----------------------------------------------------------------- TOTP */
  .post('/totp/start', async ({ request, session }) =>
    authJson({
      data: await startTotpEnrollment({ session, stepUpToken: readStepUpToken(request) }),
      message: 'Scan this with your authenticator app',
    }),
  )
  .post('/totp/confirm', async ({ request, session }) => {
    const input = parseInput(TotpConfirmSchema, await readJsonBody(request))
    const result = await confirmTotpEnrollment({
      session,
      stepUpToken: readStepUpToken(request),
      challengeId: input.challengeId,
      code: input.code,
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      data: result,
      message: 'Authenticator updated. These recovery codes replace your old ones',
    })
  })
  .post('/recovery-codes/rotate', async ({ request, session }) =>
    authJson({
      data: await rotateRecoveryCodes({
        session,
        stepUpToken: readStepUpToken(request),
        request,
        ipAddress: requestIdentity(request),
      }),
      message: 'New recovery codes. The old ones no longer work',
    }),
  )
  /* ------------------------------------------------------ password, email */
  .post('/password/change', async ({ request, session }) => {
    const input = parseInput(PasswordChangeSchema, await readJsonBody(request))

    await changePassword({
      session,
      stepUpToken: readStepUpToken(request),
      newPassword: input.newPassword,
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      data: null,
      message: 'Password changed. Every device has been signed out',
      // Including this one: the change revoked it a moment ago.
      cookies: clearedSessionCookies(),
    })
  })
  .post('/email-change/request', async ({ request, session }) => {
    const input = parseInput(EmailChangeRequestSchema, await readJsonBody(request))
    const result = await requestEmailChange({
      session,
      stepUpToken: readStepUpToken(request),
      newEmail: input.newEmail,
      baseUrl: readBaseUrl(),
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      data: result,
      message: 'Check the new address. Your current one keeps working until you confirm',
    })
  })
  /* ------------------------------------------------------------- sessions */
  .get('/sessions', async ({ query, session }) =>
    authJson({
      data: await listSessions(session, parseInput(SessionListQuerySchema, query).page),
      message: 'Sessions listed',
    }),
  )
  .delete('/sessions/:id', async ({ params, request, session }) => {
    const id = parseInput(SessionIdSchema, params.id)

    await revokeOneSession({ session, sessionId: id, request, ipAddress: requestIdentity(request) })

    return authJson({
      data: null,
      message: 'That device was signed out',
      // Revoking your own session from the list should also clear the cookie,
      // rather than leaving the browser to discover it on the next request.
      cookies: id === session.id ? clearedSessionCookies() : undefined,
    })
  })
  .post('/sessions/revoke-all', async ({ request, session }) => {
    const result = await revokeEverySession({
      session,
      stepUpToken: readStepUpToken(request),
      request,
      ipAddress: requestIdentity(request),
    })

    return authJson({
      data: result,
      message: 'Signed out everywhere',
      cookies: clearedSessionCookies(),
    })
  })
