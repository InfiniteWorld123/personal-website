import { ApiRequestError } from '#/frontend/api/response'
import type {
  PasskeySummary,
  SecurityOverview,
  SessionPage,
} from '#/backend2/contracts/auth.contract'

export type { SessionPage }

/**
 * The Dashboard's side of Auth V2.
 *
 * Plain `fetch`, like `dashboard-projects/api.ts` and for the same reason: the
 * Eden client is typed against the legacy Elysia app, and V2 shares no code
 * with it. The envelope is identical, so one `ApiRequestError` carries a
 * refusal to whichever form has to show it — including the `code`, which is
 * how the screen tells "wrong password" from "prove it is you again".
 */

const AUTH = '/api/v2/auth'
const SECURITY = '/api/v2/owner/security'

type Envelope = {
  success: boolean
  message?: string
  code?: string
  data?: unknown
  details?: unknown
}

/**
 * The CSRF half of the double-submit pair.
 *
 * The session cookie is `HttpOnly` and unreadable; this one is deliberately
 * not, because echoing it in a header is the whole mechanism. A cross-site
 * page can make the browser send the cookie but cannot read this value out to
 * copy it here.
 */
const csrfToken = (): string | null => {
  if (typeof document === 'undefined') return null

  for (const part of document.cookie.split(';')) {
    const index = part.indexOf('=')

    if (index < 1) continue
    if (part.slice(0, index).trim() !== 'v2_csrf') continue

    return decodeURIComponent(part.slice(index + 1).trim())
  }

  return null
}

const request = async <TData>(
  path: string,
  init: RequestInit = {},
  stepUpToken?: string | null,
): Promise<TData> => {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (init.body !== undefined) headers.set('content-type', 'application/json')

  if (method !== 'GET' && method !== 'HEAD') {
    const token = csrfToken()

    if (token) headers.set('x-v2-csrf', token)
  }

  if (stepUpToken) headers.set('x-v2-step-up', stepUpToken)

  const response = await fetch(path, { credentials: 'same-origin', ...init, headers })
  const body = (await response.json().catch(() => null)) as Envelope | null

  if (!response.ok || !body?.success) {
    throw new ApiRequestError({
      message: body?.message ?? 'The server did not answer',
      code: body?.code ?? null,
      status: response.status,
      details: body?.details,
    })
  }

  return body.data as TData
}

const post = (payload?: unknown): RequestInit => ({
  method: 'POST',
  body: JSON.stringify(payload ?? {}),
})

/* -------------------------------------------------------------- signing in */

/** What a WebAuthn ceremony hands back. Opaque here; the library owns its shape. */
export type PublicKeyOptions = Record<string, unknown>

export type SignedIn = { email: string; expiresAt: string }

export const startPasskeySignIn = () =>
  request<{ challengeId: string; options: PublicKeyOptions }>(`${AUTH}/passkey/start`, post())

export const finishPasskeySignIn = (input: {
  challengeId: string
  credential: unknown
}) => request<SignedIn>(`${AUTH}/passkey/finish`, post(input))

export type PasswordStarted = {
  /** `enroll` means this account has no verified authenticator yet. */
  mode: 'mfa' | 'enroll'
  challengeId: string
  expiresAt: string
}

export const startPasswordSignIn = (input: { email: string; password: string }) =>
  request<PasswordStarted>(`${AUTH}/password/start`, post(input))

export const finishPasswordSignIn = (input: {
  challengeId: string
  totpCode?: string
  recoveryCode?: string
}) => request<SignedIn>(`${AUTH}/password/finish`, post(input))

/* ------------------------------------------------------------- enrollment */

export const startEnrollment = (challengeId: string) =>
  request<{ uri: string; manualKey: string }>(
    `${AUTH}/enrollment/totp/start`,
    post({ challengeId }),
  )

export const confirmEnrollment = (input: { challengeId: string; code: string }) =>
  request<SignedIn & { recoveryCodes: string[] }>(
    `${AUTH}/enrollment/totp/confirm`,
    post(input),
  )

/* ---------------------------------------------------------- links by email */

export const requestPasswordReset = (email: string) =>
  request<null>(`${AUTH}/password-reset/request`, post({ email }))

export const completePasswordReset = (input: { token: string; newPassword: string }) =>
  request<null>(`${AUTH}/password-reset/complete`, post(input))

export const confirmEmailChange = (token: string) =>
  request<{ email: string }>(`${AUTH}/email-change/confirm`, post({ token }))

export const signOut = () => request<null>(`${AUTH}/logout`, post())

/* ------------------------------------------------------- security settings */

export const readSecurity = () => request<SecurityOverview>(`${SECURITY}/`)

export type StepUpScope =
  | 'passkeys'
  | 'totp'
  | 'recovery-codes'
  | 'password'
  | 'email'
  | 'sessions'

export type StepUpProof =
  | { challengeId: string; credential: unknown }
  | { password: string; totpCode?: string; recoveryCode?: string }

export const reverify = (scope: StepUpScope, proof: StepUpProof) =>
  request<{ stepUpToken: string; expiresAt: string; scope: StepUpScope }>(
    `${SECURITY}/reverify`,
    post({ scope, ...proof }),
  )

export const startPasskeyRegistration = (stepUpToken: string) =>
  request<{ challengeId: string; options: PublicKeyOptions }>(
    `${SECURITY}/passkeys/start`,
    post(),
    stepUpToken,
  )

export const finishPasskeyRegistration = (
  stepUpToken: string,
  input: { challengeId: string; credential: unknown; name: string },
) => request<PasskeySummary>(`${SECURITY}/passkeys/finish`, post(input), stepUpToken)

export const removePasskey = (stepUpToken: string, id: string) =>
  request<null>(`${SECURITY}/passkeys/${id}`, { method: 'DELETE' }, stepUpToken)

export const startTotpReplacement = (stepUpToken: string) =>
  request<{ challengeId: string; uri: string; manualKey: string }>(
    `${SECURITY}/totp/start`,
    post(),
    stepUpToken,
  )

export const confirmTotpReplacement = (
  stepUpToken: string,
  input: { challengeId: string; code: string },
) => request<{ recoveryCodes: string[] }>(`${SECURITY}/totp/confirm`, post(input), stepUpToken)

export const rotateRecoveryCodes = (stepUpToken: string) =>
  request<{ recoveryCodes: string[] }>(
    `${SECURITY}/recovery-codes/rotate`,
    post(),
    stepUpToken,
  )

export const changePassword = (stepUpToken: string, newPassword: string) =>
  request<null>(`${SECURITY}/password/change`, post({ newPassword }), stepUpToken)

export const requestEmailChange = (stepUpToken: string, newEmail: string) =>
  request<{ newEmail: string }>(
    `${SECURITY}/email-change/request`,
    post({ newEmail }),
    stepUpToken,
  )

export const listSessions = (page: number) =>
  request<SessionPage>(`${SECURITY}/sessions?page=${page}`)

export const revokeSession = (id: string) =>
  request<null>(`${SECURITY}/sessions/${id}`, { method: 'DELETE' })

export const revokeEverySession = (stepUpToken: string) =>
  request<{ revoked: number }>(`${SECURITY}/sessions/revoke-all`, post(), stepUpToken)
