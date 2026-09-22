// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SecurityOverview } from '#/backend2/contracts/auth.contract'

/**
 * The Auth V2 screens, with the server stood in for at the API boundary.
 *
 * The forms, the validation rule, the stage machine and the error handling all
 * run for real — only the module that talks to Backend2 is replaced. What is
 * worth testing here is what the owner is told and when, and whether a screen
 * can be talked into doing something the specification forbids.
 */
const api = vi.hoisted(() => ({
  startPasskeySignIn: vi.fn(),
  finishPasskeySignIn: vi.fn(),
  startPasswordSignIn: vi.fn(),
  finishPasswordSignIn: vi.fn(),
  startEnrollment: vi.fn(),
  confirmEnrollment: vi.fn(),
  requestPasswordReset: vi.fn(),
  completePasswordReset: vi.fn(),
  confirmEmailChange: vi.fn(),
  signOut: vi.fn(),
  readSecurity: vi.fn(),
  reverify: vi.fn(),
  startPasskeyRegistration: vi.fn(),
  finishPasskeyRegistration: vi.fn(),
  removePasskey: vi.fn(),
  startTotpReplacement: vi.fn(),
  confirmTotpReplacement: vi.fn(),
  rotateRecoveryCodes: vi.fn(),
  changePassword: vi.fn(),
  requestEmailChange: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
  revokeEverySession: vi.fn(),
}))

const passkey = vi.hoisted(() => ({
  supportsPasskeys: vi.fn(() => true),
  hasDeviceAuthenticator: vi.fn(async () => true),
  requestPasskeyAssertion: vi.fn(),
  requestPasskeyRegistration: vi.fn(),
  guessDeviceName: vi.fn(() => 'This device'),
}))

vi.mock('#/frontend/features/auth-v2/api', () => api)
vi.mock('#/frontend/features/auth-v2/passkey', () => passkey)

const { SignInPage, safeReturnPath } = await import('#/frontend/pages/dashboard/auth/SignInPage')
const { ResetPage, ConfirmEmailPage } = await import('#/frontend/pages/dashboard/auth/ResetPage')
const { SecurityPage } = await import('#/frontend/pages/dashboard/settings/SecurityPage')
const { ApiRequestError } = await import('#/frontend/api/response')

/* ------------------------------------------------------------- plumbing */

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      })
    }
  >
    {children}
  </QueryClientProvider>
)

const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  passkey.supportsPasskeys.mockReturnValue(true)
  passkey.hasDeviceAuthenticator.mockResolvedValue(true)
  passkey.guessDeviceName.mockReturnValue('This device')
  assign.mockReset()

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign, href: 'http://localhost/dashboard/login' },
  })
})

afterEach(cleanup)

const refused = (message: string, status = 401, code = 'UNAUTHORIZED') =>
  new ApiRequestError({ message, status, code })

const type = (label: RegExp | string, value: string) => {
  const field = screen.getByLabelText(label)

  fireEvent.change(field, { target: { value } })

  return field
}

/* -------------------------------------------------- the return path rule */

describe('where a sign-in is allowed to land', () => {
  it.each([
    ['/dashboard', '/dashboard'],
    ['/dashboard/projects', '/dashboard/projects'],
    ['/dashboard/projects?page=2', '/dashboard/projects?page=2'],
    ['/dashboard/settings/security', '/dashboard/settings/security'],
  ])('keeps %s', (input, expected) => {
    expect(safeReturnPath(input)).toBe(expected)
  })

  it.each<[unknown, string]>([
    ['https://evil.example/dashboard', 'an absolute URL'],
    ['//evil.example', 'a protocol-relative URL'],
    ['/\\evil.example', 'a backslash the browser would normalise'],
    ['/dashboard\\..\\admin', 'a backslash anywhere in the path'],
    ['/admin', 'a path outside the dashboard'],
    ['/', 'the public site'],
    ['/dashboardish', 'a path that merely starts with the same letters'],
    ['', 'nothing at all'],
    [undefined, 'a missing value'],
    // Not a string, however convincingly it prints as one.
    [{ toString: (): string => '/dashboard' }, 'an object pretending to be a path'],
  ])('refuses %s (%s)', (input) => {
    expect(safeReturnPath(input)).toBe('/dashboard')
  })

  it('never sends the owner back to the sign-in screen', () => {
    expect(safeReturnPath('/dashboard/login')).toBe('/dashboard')
    expect(safeReturnPath('/dashboard/login/reset?token=x')).toBe('/dashboard')
  })
})

/* ------------------------------------------------------------- sign-in */

describe('the sign-in screen', () => {
  const renderSignIn = (returnTo = '/dashboard') =>
    render(<SignInPage returnTo={returnTo} />, { wrapper })

  it('offers the passkey and the password at the same time', async () => {
    renderSignIn()

    expect(screen.getByRole('button', { name: /sign in with a passkey/i })).toBeTruthy()
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
    expect(screen.getByLabelText(/password/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: /forgot it/i })).toBeTruthy()
  })

  it('says what the device does, and never claims to read a fingerprint', () => {
    renderSignIn()

    const text = document.body.textContent ?? ''

    expect(text).toContain('never leaves it')
    expect(text).not.toMatch(/scan your fingerprint|touch the sensor|place your finger/i)
  })

  it('hides the passkey button where the browser cannot use one', () => {
    passkey.supportsPasskeys.mockReturnValue(false)
    renderSignIn()

    expect(screen.queryByRole('button', { name: /sign in with a passkey/i })).toBeNull()
    // The fallback is still there, which is the point.
    expect(screen.getByLabelText(/email/i)).toBeTruthy()
  })

  it('marks nothing wrong before the first submit, then checks every keystroke', async () => {
    renderSignIn()

    expect(document.querySelector('[aria-invalid="true"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(screen.getByText(/enter the email address on the account/i)).toBeTruthy()
    })

    const email = screen.getByLabelText(/email/i)

    expect(email.getAttribute('aria-invalid')).toBe('true')
    expect(email.getAttribute('aria-describedby')).toBe('signin-email-error')
    expect(api.startPasswordSignIn).not.toHaveBeenCalled()

    fireEvent.change(email, { target: { value: 'owner@example.de' } })

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i).getAttribute('aria-invalid')).toBeNull()
    })
  })

  it('shows the server sentence for a refused password, and leaks nothing else', async () => {
    api.startPasswordSignIn.mockRejectedValue(
      refused('That email address and password do not match'),
    )

    renderSignIn()
    type(/email/i, 'owner@example.de')
    type(/password/i, 'not the passphrase')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('do not match')
    })

    // Still on the credentials step, and no session was assumed.
    expect(screen.getByLabelText(/password/i)).toBeTruthy()
    expect(assign).not.toHaveBeenCalled()
  })

  it('asks for a code once the password is accepted, and does not sign in yet', async () => {
    api.startPasswordSignIn.mockResolvedValue({
      mode: 'mfa',
      challengeId: 'c'.repeat(43),
      expiresAt: new Date().toISOString(),
    })

    renderSignIn()
    type(/email/i, 'owner@example.de')
    type(/password/i, 'a long enough passphrase')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(screen.getByLabelText(/6-digit code/i)).toBeTruthy())

    expect(assign).not.toHaveBeenCalled()
    expect(screen.getByText(/enter your code/i)).toBeTruthy()
  })

  it('refuses a malformed code without calling the server', async () => {
    api.startPasswordSignIn.mockResolvedValue({
      mode: 'mfa',
      challengeId: 'c'.repeat(43),
      expiresAt: new Date().toISOString(),
    })

    renderSignIn()
    type(/email/i, 'owner@example.de')
    type(/password/i, 'a long enough passphrase')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(screen.getByLabelText(/6-digit code/i)).toBeTruthy())

    type(/6-digit code/i, '123')
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(screen.getByText(/6-digit code from your authenticator/i)).toBeTruthy()
    })
    expect(api.finishPasswordSignIn).not.toHaveBeenCalled()
  })

  it('sends a code with its spaces stripped, and lands on the validated path', async () => {
    api.startPasswordSignIn.mockResolvedValue({
      mode: 'mfa',
      challengeId: 'c'.repeat(43),
      expiresAt: new Date().toISOString(),
    })
    api.finishPasswordSignIn.mockResolvedValue({ email: 'owner@example.de', expiresAt: 'x' })

    renderSignIn('/dashboard/projects')
    type(/email/i, 'owner@example.de')
    type(/password/i, 'a long enough passphrase')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(screen.getByLabelText(/6-digit code/i)).toBeTruthy())

    type(/6-digit code/i, '123 456')
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(api.finishPasswordSignIn).toHaveBeenCalledWith({
        challengeId: 'c'.repeat(43),
        totpCode: '123456',
      })
    })
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard/projects'))
  })

  it('swaps to a recovery code, and sends it as one', async () => {
    api.startPasswordSignIn.mockResolvedValue({
      mode: 'mfa',
      challengeId: 'c'.repeat(43),
      expiresAt: new Date().toISOString(),
    })
    api.finishPasswordSignIn.mockResolvedValue({ email: 'owner@example.de', expiresAt: 'x' })

    renderSignIn()
    type(/email/i, 'owner@example.de')
    type(/password/i, 'a long enough passphrase')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(screen.getByLabelText(/6-digit code/i)).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /lost your phone/i }))

    await waitFor(() => expect(screen.getByLabelText(/recovery code/i)).toBeTruthy())

    type(/recovery code/i, 'ABCDE-FGHIJ')
    fireEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    await waitFor(() => {
      expect(api.finishPasswordSignIn).toHaveBeenCalledWith({
        challengeId: 'c'.repeat(43),
        recoveryCode: 'abcdefghij',
      })
    })
  })

  it('treats a dismissed passkey prompt as a hint, not a failure', async () => {
    api.startPasskeySignIn.mockResolvedValue({ challengeId: 'p'.repeat(43), options: {} })
    passkey.requestPasskeyAssertion.mockResolvedValue({ status: 'cancelled' })

    renderSignIn()
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toMatch(/dismissed/i)
    })
    expect(api.finishPasskeySignIn).not.toHaveBeenCalled()
    // The fallback stays reachable.
    expect(screen.getByLabelText(/password/i)).toBeTruthy()
  })

  it('signs in on a verified passkey with no second step', async () => {
    api.startPasskeySignIn.mockResolvedValue({ challengeId: 'p'.repeat(43), options: {} })
    passkey.requestPasskeyAssertion.mockResolvedValue({ status: 'ok', credential: { id: 'x' } })
    api.finishPasskeySignIn.mockResolvedValue({ email: 'owner@example.de', expiresAt: 'x' })

    renderSignIn()
    fireEvent.click(screen.getByRole('button', { name: /sign in with a passkey/i }))

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/dashboard'))
    expect(screen.queryByLabelText(/6-digit code/i)).toBeNull()
  })

  it('takes a first sign-in into enrollment rather than into the dashboard', async () => {
    api.startPasswordSignIn.mockResolvedValue({
      mode: 'enroll',
      challengeId: 'e'.repeat(43),
      expiresAt: new Date().toISOString(),
    })
    api.startEnrollment.mockResolvedValue({
      uri: 'otpauth://totp/Dashboard:owner@example.de?secret=ABCD',
      manualKey: 'ABCD EFGH IJKL MNOP',
    })

    renderSignIn()
    type(/email/i, 'owner@example.de')
    type(/password/i, 'a long enough passphrase')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(screen.getByText(/scan this with your authenticator/i)).toBeTruthy())

    expect(screen.getByText('ABCD EFGH IJKL MNOP')).toBeTruthy()
    expect(screen.getByRole('img', { name: /qr code/i })).toBeTruthy()
    expect(assign).not.toHaveBeenCalled()
  })

  it('shows the recovery codes once, and will not move on until they are saved', async () => {
    api.startPasswordSignIn.mockResolvedValue({
      mode: 'enroll',
      challengeId: 'e'.repeat(43),
      expiresAt: new Date().toISOString(),
    })
    api.startEnrollment.mockResolvedValue({ uri: 'otpauth://totp/x?secret=ABCD', manualKey: 'ABCD' })
    api.confirmEnrollment.mockResolvedValue({
      email: 'owner@example.de',
      expiresAt: 'x',
      recoveryCodes: Array.from({ length: 10 }, (_, index) => `code${index}-aaaaa`),
    })

    renderSignIn()
    type(/email/i, 'owner@example.de')
    type(/password/i, 'a long enough passphrase')
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    await waitFor(() => expect(screen.getByRole('button', { name: /i have scanned it/i })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /i have scanned it/i }))

    await waitFor(() => expect(screen.getByLabelText(/6-digit code/i)).toBeTruthy())
    type(/6-digit code/i, '123456')
    fireEvent.click(screen.getByRole('button', { name: /turn it on/i }))

    await waitFor(() => expect(screen.getByText(/ten codes, shown once/i)).toBeTruthy())

    const open = screen.getByRole('button', { name: /open the dashboard/i }) as HTMLButtonElement

    expect(open.disabled).toBe(true)
    expect(assign).not.toHaveBeenCalled()

    fireEvent.click(screen.getByLabelText(/i have put these somewhere safe/i))

    await waitFor(() => {
      expect((screen.getByRole('button', { name: /open the dashboard/i }) as HTMLButtonElement).disabled).toBe(false)
    })

    fireEvent.click(screen.getByRole('button', { name: /open the dashboard/i }))
    expect(assign).toHaveBeenCalledWith('/dashboard')
  })
})

/* --------------------------------------------------------------- reset */

describe('the forgotten-password screens', () => {
  it('answers neutrally, and never shows the link', async () => {
    api.requestPasswordReset.mockResolvedValue(null)

    render(<ResetPage token={null} />, { wrapper })
    type(/email/i, 'owner@example.de')
    fireEvent.click(screen.getByRole('button', { name: /send the link/i }))

    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeTruthy())

    const text = document.body.textContent ?? ''

    expect(text).toMatch(/if that address belongs to this account/i)
    expect(text).not.toContain('token=')
  })

  it('sends the owner to a dedicated screen when the link is spent', async () => {
    api.completePasswordReset.mockRejectedValue(
      refused('That link has expired or was already used'),
    )

    render(<ResetPage token={'t'.repeat(43)} />, { wrapper })
    type(/new password/i, 'a brand new passphrase')
    fireEvent.click(screen.getByRole('button', { name: /set the password/i }))

    await waitFor(() => expect(screen.getByText(/that link is done/i)).toBeTruthy())
    expect(screen.getByRole('link', { name: /ask for a new one/i })).toBeTruthy()
  })

  it('refuses a short password without calling the server', async () => {
    render(<ResetPage token={'t'.repeat(43)} />, { wrapper })
    type(/new password/i, 'short')
    fireEvent.click(screen.getByRole('button', { name: /set the password/i }))

    await waitFor(() => expect(screen.getByText(/at least 12 characters/i)).toBeTruthy())
    expect(api.completePasswordReset).not.toHaveBeenCalled()
  })

  it('says a reset does not switch off the second factor', () => {
    render(<ResetPage token={'t'.repeat(43)} />, { wrapper })

    expect(document.body.textContent).toMatch(/does not switch off your authenticator/i)
  })

  it('confirms an email change only when the owner presses the button', async () => {
    api.confirmEmailChange.mockResolvedValue({ email: 'new@example.de' })

    render(<ConfirmEmailPage token={'t'.repeat(43)} />, { wrapper })

    // A mail client fetching a link preview must not spend the token.
    expect(api.confirmEmailChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /confirm this address/i }))

    await waitFor(() => expect(screen.getByText(/address changed/i)).toBeTruthy())
    expect(screen.getByText('new@example.de')).toBeTruthy()
  })
})

/* ---------------------------------------------------------- security */

const sessionPage = (isCurrent = true) => ({
  items: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      method: 'passkey' as const,
      authenticatedAt: '2026-03-20T10:00:00.000Z',
      expiresAt: '2026-03-27T10:00:00.000Z',
      lastSeenAt: null,
      inferredDevice: 'Chrome on Mac',
      isCurrent,
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
  pageCount: 1,
  hasMore: false,
})

const overview = (over: Partial<SecurityOverview> = {}): SecurityOverview => ({
  owner: {
    email: 'owner@example.de',
    accessState: 'active',
    factors: { password: true, totp: true, passkeys: 2, recoveryCodesRemaining: 8 },
  },
  passkeys: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'MacBook Pro',
      createdAt: '2026-03-14T10:00:00.000Z',
      lastUsedAt: '2026-03-20T10:00:00.000Z',
      syncedAcrossDevices: true,
    },
  ],
  sessions: sessionPage(),
  pendingEmailChange: null,
  recentEvents: [
    { id: 'e1', kind: 'sign_in_passkey', createdAt: '2026-03-20T10:00:00.000Z', inferredDevice: 'Chrome on Mac' },
  ],
  ...over,
})

describe('Security settings', () => {
  it('says it is loading before it says anything else', () => {
    api.readSecurity.mockReturnValue(new Promise(() => {}))

    render(<SecurityPage />, { wrapper })

    expect(screen.getByText(/loading your security settings/i)).toBeTruthy()
  })

  it('sends an expired session to the sign-in screen rather than showing an empty page', async () => {
    api.readSecurity.mockRejectedValue(refused('Sign in to continue'))

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByText(/your session has ended/i)).toBeTruthy())
    expect(screen.getByRole('link', { name: /go to sign in/i })).toBeTruthy()
  })

  it('offers a retry when the failure is not about the session', async () => {
    api.readSecurity.mockRejectedValue(
      new ApiRequestError({ message: 'An unexpected error occurred', status: 500 }),
    )

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy())
    expect(screen.queryByRole('link', { name: /go to sign in/i })).toBeNull()
  })

  it('lists the factors, the passkeys and the sessions', async () => {
    api.readSecurity.mockResolvedValue(overview())

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByText('MacBook Pro')).toBeTruthy())

    expect(screen.getByText('Authenticator app')).toBeTruthy()
    expect(screen.getByText('8 LEFT')).toBeTruthy()
    expect(screen.getByText('THIS ONE')).toBeTruthy()
    expect(screen.getByText(/signed in with a passkey/i)).toBeTruthy()
    // Inferred, and said to be inferred.
    expect(document.body.textContent).toMatch(/not a location/i)
  })

  it('shows a pending email change, and says the old address still works', async () => {
    api.readSecurity.mockResolvedValue(
      overview({ pendingEmailChange: { newEmail: 'new@example.de', expiresAt: 'x' } }),
    )

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByText('new@example.de')).toBeTruthy())
    expect(document.body.textContent).toMatch(/keeps working until it does/i)
  })

  it('asks for a fresh proof before it will change anything', async () => {
    api.readSecurity.mockResolvedValue(overview())

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByText('MacBook Pro')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /replace your authenticator app/i }))

    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByText(/being signed in is not enough/i)).toBeTruthy()
    // Opening the dialog changed nothing; the token has not been earned yet.
    expect(api.reverify).not.toHaveBeenCalled()
    expect(api.startTotpReplacement).not.toHaveBeenCalled()
  })

  it('gives every factor action a name of its own', async () => {
    api.readSecurity.mockResolvedValue(overview())

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByText('8 LEFT')).toBeTruthy())

    // Three rows carry a button reading "Replace" or "Add". A screen reader
    // has to be able to tell them apart.
    expect(screen.getByRole('button', { name: /replace your authenticator app/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /replace your recovery codes/i })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /add a passkey/i }).length).toBeGreaterThan(0)
  })

  it('runs the change only after the proof comes back', async () => {
    api.readSecurity.mockResolvedValue(overview())
    api.reverify.mockResolvedValue({ stepUpToken: 's'.repeat(43), expiresAt: 'x', scope: 'recovery-codes' })
    api.rotateRecoveryCodes.mockResolvedValue({
      recoveryCodes: Array.from({ length: 10 }, (_, index) => `new${index}-aaaaa`),
    })

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByText('8 LEFT')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /replace your recovery codes/i }))

    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/password/i), {
      target: { value: 'a long enough passphrase' },
    })
    fireEvent.change(within(dialog).getByLabelText(/6-digit code/i), {
      target: { value: '123456' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: /^confirm$/i }))

    await waitFor(() => {
      expect(api.reverify).toHaveBeenCalledWith('recovery-codes', {
        password: 'a long enough passphrase',
        totpCode: '123456',
      })
    })
    await waitFor(() => expect(api.rotateRecoveryCodes).toHaveBeenCalledWith('s'.repeat(43)))
    await waitFor(() => expect(screen.getByText(/new recovery codes/i)).toBeTruthy())
  })

  it('reports a refused proof without pretending the change happened', async () => {
    api.readSecurity.mockResolvedValue(overview())
    api.reverify.mockRejectedValue(
      new ApiRequestError({
        message: 'That did not confirm. Try again',
        status: 403,
        code: 'STEP_UP_REQUIRED',
      }),
    )

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByText('8 LEFT')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /replace your recovery codes/i }))

    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/password/i), { target: { value: 'wrong wrong wrong' } })
    fireEvent.change(within(dialog).getByLabelText(/6-digit code/i), { target: { value: '000000' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^confirm$/i }))

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByText(/did not confirm/i)).toBeTruthy()
    })
    expect(api.rotateRecoveryCodes).not.toHaveBeenCalled()
  })

  it('signs one other device out without asking for a proof', async () => {
    api.readSecurity.mockResolvedValue(overview({ sessions: sessionPage(false) }))
    api.revokeSession.mockResolvedValue(null)

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByRole('button', { name: /^sign out$/i })).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /^sign out$/i }))

    await waitFor(() => expect(api.revokeSession).toHaveBeenCalled())
    expect(api.reverify).not.toHaveBeenCalled()
  })

  it('says so when the account has not finished enrolling', async () => {
    api.readSecurity.mockResolvedValue(
      overview({
        owner: {
          email: 'owner@example.de',
          accessState: 'enrolling',
          factors: { password: true, totp: false, passkeys: 0, recoveryCodesRemaining: 0 },
        },
      }),
    )

    render(<SecurityPage />, { wrapper })

    await waitFor(() => expect(screen.getByText(/has not finished setting up/i)).toBeTruthy())
    expect(screen.getByText('NOT SET UP')).toBeTruthy()
  })
})
