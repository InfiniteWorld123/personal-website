import { useEffect, useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import * as v from 'valibot'
import {
  EmailSchema,
  RecoveryCodeSchema,
  TotpCodeSchema,
} from '#/backend2/contracts/auth.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  confirmEnrollment,
  finishPasskeySignIn,
  finishPasswordSignIn,
  startEnrollment,
  startPasskeySignIn,
  startPasswordSignIn,
  type PublicKeyOptions,
} from '#/frontend/features/auth-v2/api'
import {
  hasDeviceAuthenticator,
  requestPasskeyAssertion,
  supportsPasskeys,
} from '#/frontend/features/auth-v2/passkey'
import { AuthDivider, AuthHeading, AuthNotice, AuthShell, Field, Working } from './AuthShell'
import { RecoveryCodeList, TotpEnrollment } from './factor-parts'

/**
 * The V2 sign-in.
 *
 * Two routes to one destination, exactly as `docs/v2/auth.md` specifies: a
 * passkey on its own, or a password followed by a second factor. The fallback
 * is never hidden behind the passkey button — a device without one, or a
 * prompt the owner dismissed, must not be a dead end.
 *
 * Nothing on this screen ever claims to read a fingerprint. The device checks
 * the person; the page receives a signature and says so.
 */

type Stage =
  | { name: 'credentials' }
  | { name: 'second-factor'; challengeId: string; using: 'totp' | 'recovery' }
  | { name: 'enroll-scan'; challengeId: string; uri: string; manualKey: string }
  | { name: 'enroll-verify'; challengeId: string; uri: string; manualKey: string }
  | { name: 'codes'; codes: string[] }

type Notice = { tone: 'error' | 'info'; text: string } | null

/**
 * Where a successful sign-in is allowed to land.
 *
 * Only a path inside the Dashboard, only on this origin, and never back at the
 * sign-in screen. Everything else — an absolute URL, a protocol-relative
 * `//evil.example`, a backslash the browser would normalise into one — becomes
 * `/dashboard`.
 */
export const safeReturnPath = (value: unknown): string => {
  if (typeof value !== 'string' || value.length === 0) return '/dashboard'
  if (!value.startsWith('/')) return '/dashboard'
  if (value.startsWith('//') || value.startsWith('/\\') || value.includes('\\')) return '/dashboard'

  const path = value.split(/[?#]/)[0] ?? ''

  if (path !== '/dashboard' && !path.startsWith('/dashboard/')) return '/dashboard'
  if (path === '/dashboard/login' || path.startsWith('/dashboard/login/')) return '/dashboard'

  return value
}

/** The server's sentence when it sent one, ours when it did not. */
const messageFrom = (error: unknown, fallback: string): string =>
  error instanceof ApiRequestError ? error.message : fallback

const focusFirstInvalid = () => {
  window.requestAnimationFrame(() => {
    const first = document.querySelector<HTMLElement>('[data-dashboard] [aria-invalid="true"]')

    first?.focus()
  })
}

export function SignInPage({ returnTo }: { returnTo: string }) {
  const [stage, setStage] = useState<Stage>({ name: 'credentials' })
  const [notice, setNotice] = useState<Notice>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  /**
   * Both `false` to begin with, and both decided after mount.
   *
   * `supportsPasskeys()` reads `window`, which does not exist while the server
   * renders this page — so calling it in a `useState` initialiser makes the
   * server and the first client render disagree, and the button silently never
   * appears on a browser that has WebAuthn. Starting hidden and turning it on
   * in an effect is the version where both renders agree, and it fails in the
   * safe direction: the password fallback is on the screen either way.
   */
  const [passkeyOffered, setPasskeyOffered] = useState(false)
  const [deviceHasAuthenticator, setDeviceHasAuthenticator] = useState(false)

  useEffect(() => {
    let cancelled = false

    setPasskeyOffered(supportsPasskeys())

    void hasDeviceAuthenticator().then((available) => {
      if (!cancelled) setDeviceHasAuthenticator(available)
    })

    return () => {
      cancelled = true
    }
  }, [])

  const land = () => window.location.assign(returnTo)

  const signInWithPasskey = async () => {
    if (passkeyBusy) return

    setPasskeyBusy(true)
    setNotice(null)

    try {
      const { challengeId, options } = await startPasskeySignIn()
      const outcome = await requestPasskeyAssertion(options as PublicKeyOptions)

      if (outcome.status === 'cancelled') {
        setNotice({
          tone: 'info',
          text: 'That passkey prompt was dismissed. Try again, or use your password below.',
        })

        return
      }

      if (outcome.status === 'unsupported') {
        setPasskeyOffered(false)
        setNotice({
          tone: 'info',
          text: 'This browser cannot use a passkey. Sign in with your password and a code.',
        })

        return
      }

      if (outcome.status === 'failed') {
        setNotice({ tone: 'error', text: outcome.message })

        return
      }

      await finishPasskeySignIn({ challengeId, credential: outcome.credential })
      land()
    } catch (error) {
      setNotice({
        tone: 'error',
        text: messageFrom(error, 'That passkey did not work. Try again, or use your password.'),
      })
    } finally {
      setPasskeyBusy(false)
    }
  }

  if (stage.name === 'codes') {
    return (
      <AuthShell width="wide">
        <div className="flex flex-col gap-5">
          <AuthHeading title="Ten codes, shown once">
            Each one signs you in a single time if your phone is gone. This screen is the only
            place they ever appear.
          </AuthHeading>
          <RecoveryCodeList
            codes={stage.codes}
            onAcknowledge={land}
            acknowledgeLabel="Open the dashboard"
          />
        </div>
      </AuthShell>
    )
  }

  if (stage.name === 'enroll-scan' || stage.name === 'enroll-verify') {
    return (
      <AuthShell width="wide">
        <div className="flex flex-col gap-5">
          <AuthHeading
            title={
              stage.name === 'enroll-scan'
                ? 'Scan this with your authenticator app'
                : 'Now prove it arrived'
            }
          >
            {stage.name === 'enroll-scan'
              ? 'Before this account can open anything, it needs a second factor. 1Password, Aegis, Google Authenticator — any of them.'
              : 'Type the code your app is showing right now.'}
          </AuthHeading>

          {notice ? <AuthNotice tone={notice.tone}>{notice.text}</AuthNotice> : null}

          {stage.name === 'enroll-scan' ? (
            <>
              <TotpEnrollment uri={stage.uri} manualKey={stage.manualKey} />
              <button
                type="button"
                className="dash-btn dash-btn-primary h-11 self-start px-5"
                onClick={() => setStage({ ...stage, name: 'enroll-verify' })}
              >
                I have scanned it
              </button>
            </>
          ) : (
            <EnrollVerifyForm
              challengeId={stage.challengeId}
              onBack={() => setStage({ ...stage, name: 'enroll-scan' })}
              onFailure={(text) => setNotice({ tone: 'error', text })}
              onDone={(codes) => {
                setNotice(null)
                setStage({ name: 'codes', codes })
              }}
            />
          )}
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      footer={
        <>
          Every sign-in needs a passkey, or a password and a second factor.
          <br />
          There is no &ldquo;remember this device&rdquo;.
        </>
      }
    >
      <div className="flex flex-col gap-[22px]">
        <AuthHeading
          title={stage.name === 'credentials' ? 'Sign in' : 'Enter your code'}
        >
          {stage.name === 'credentials'
            ? 'The private dashboard. One account, and it is yours.'
            : stage.using === 'totp'
              ? 'From your authenticator app.'
              : 'One of the ten you saved when you set up the authenticator app.'}
        </AuthHeading>

        {notice ? <AuthNotice tone={notice.tone}>{notice.text}</AuthNotice> : null}

        {stage.name === 'credentials' ? (
          <>
            {passkeyOffered ? (
              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  className="dash-btn dash-btn-primary h-[46px] w-full text-sm"
                  onClick={signInWithPasskey}
                  disabled={passkeyBusy}
                >
                  {passkeyBusy ? (
                    <Working label="Waiting for your device" />
                  ) : (
                    <>
                      <KeyIcon />
                      Sign in with a passkey
                    </>
                  )}
                </button>
                <p className="mx-auto max-w-[300px] text-center text-[11.5px] leading-relaxed text-[var(--dash-quiet)]">
                  {deviceHasAuthenticator
                    ? 'Your device checks it is you. What it checks never leaves it.'
                    : 'Your passkey device checks it is you. What it checks never leaves it.'}
                </p>
              </div>
            ) : null}

            {passkeyOffered ? <AuthDivider label="OR" /> : null}

            <CredentialsForm
              onFailure={(text) => setNotice({ tone: 'error', text })}
              onChallenge={(next) => {
                setNotice(null)
                setStage(next)
              }}
            />
          </>
        ) : (
          <SecondFactorForm
            challengeId={stage.challengeId}
            using={stage.using}
            onFailure={(text) => setNotice({ tone: 'error', text })}
            onSwitch={(using) => {
              setNotice(null)
              setStage({ ...stage, using })
            }}
            onBack={() => {
              setNotice(null)
              setStage({ name: 'credentials' })
            }}
            onSignedIn={land}
          />
        )}
      </div>
    </AuthShell>
  )
}

const KeyIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="8.5" cy="8.5" r="4.5" stroke="currentColor" strokeWidth="2" />
    <path
      d="M11.8 11.8 L20 20 M17.4 17.4 L15.2 19.6 M20 20 L18 22"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/* ------------------------------------------------------------------ step 1 */

function CredentialsForm({
  onChallenge,
  onFailure,
}: {
  onChallenge: (stage: Stage) => void
  onFailure: (message: string) => void
}) {
  const form = useForm({
    defaultValues: { email: '', password: '' },
    /**
     * The repository's form rule: nothing is marked wrong until the first
     * submit, and every keystroke re-checks after that.
     */
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        if (!v.safeParse(EmailSchema, value.email).success) {
          fields.email = 'Enter the email address on the account'
        }
        if (value.password.length === 0) fields.password = 'Enter your password'

        return Object.keys(fields).length > 0 ? { fields } : undefined
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      try {
        const started = await startPasswordSignIn({
          email: value.email.trim().toLowerCase(),
          password: value.password,
        })

        if (started.mode === 'mfa') {
          onChallenge({ name: 'second-factor', challengeId: started.challengeId, using: 'totp' })

          return
        }

        // A first correct password on an account with no verified
        // authenticator reaches enrollment, which is not access.
        const setup = await startEnrollment(started.challengeId)

        onChallenge({
          name: 'enroll-scan',
          challengeId: started.challengeId,
          uri: setup.uri,
          manualKey: setup.manualKey,
        })
      } catch (error) {
        onFailure(messageFrom(error, 'That email address and password do not match'))
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-3.5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="email">
        {(field) => (
          <Field id="signin-email" label="Email" error={field.state.meta.errors[0] as string | undefined}>
            {(describedBy) => (
              <input
                id="signin-email"
                type="email"
                autoComplete="username webauthn"
                className="dash-field h-11 px-3 text-sm"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                aria-describedby={describedBy}
              />
            )}
          </Field>
        )}
      </form.Field>

      <form.Field name="password">
        {(field) => (
          <Field
            id="signin-password"
            label="Password"
            error={field.state.meta.errors[0] as string | undefined}
            action={
              <a href="/dashboard/login/reset" className="text-xs text-[var(--dash-blue-ink)] underline-offset-2 hover:underline">
                Forgot it?
              </a>
            }
          >
            {(describedBy) => (
              <input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                className="dash-field h-11 px-3 text-sm"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                aria-describedby={describedBy}
              />
            )}
          </Field>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <button type="submit" className="dash-btn dash-btn-quiet h-11 w-full text-sm" disabled={isSubmitting}>
            {isSubmitting ? <Working label="Checking" /> : 'Continue'}
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}

/* ------------------------------------------------------------------ step 2 */

function SecondFactorForm({
  challengeId,
  using,
  onSignedIn,
  onFailure,
  onSwitch,
  onBack,
}: {
  challengeId: string
  using: 'totp' | 'recovery'
  onSignedIn: () => void
  onFailure: (message: string) => void
  onSwitch: (using: 'totp' | 'recovery') => void
  onBack: () => void
}) {
  const form = useForm({
    defaultValues: { code: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const schema = using === 'totp' ? TotpCodeSchema : RecoveryCodeSchema

        if (v.safeParse(schema, value.code).success) return undefined

        return {
          fields: {
            code:
              using === 'totp'
                ? 'Enter the 6-digit code from your authenticator app'
                : 'A recovery code is ten characters, like abcde-fghij',
          },
        }
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      try {
        const schema = using === 'totp' ? TotpCodeSchema : RecoveryCodeSchema
        const cleaned = v.parse(schema, value.code)

        await finishPasswordSignIn({
          challengeId,
          ...(using === 'totp' ? { totpCode: cleaned } : { recoveryCode: cleaned }),
        })

        onSignedIn()
      } catch (error) {
        onFailure(
          messageFrom(error, 'That code is not right. Check your authenticator app and try again'),
        )
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-[18px]"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="code">
        {(field) => (
          <Field
            id="second-factor"
            label={using === 'totp' ? '6-digit code' : 'Recovery code'}
            error={field.state.meta.errors[0] as string | undefined}
            hint={
              using === 'totp'
                ? 'One field, not six boxes: a code pasted from a password manager arrives whole.'
                : 'Capitals, spaces and the dash are all fine. Using it here spends it for good.'
            }
          >
            {(describedBy) => (
              <input
                id="second-factor"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- the only field on the step
                autoFocus
                inputMode={using === 'totp' ? 'numeric' : 'text'}
                autoComplete={using === 'totp' ? 'one-time-code' : 'off'}
                spellCheck={false}
                placeholder={using === 'totp' ? '000000' : 'xxxxx-xxxxx'}
                className={
                  using === 'totp'
                    ? 'dash-field dash-num h-14 px-4 text-[26px] font-semibold tracking-[0.34em]'
                    : 'dash-field h-14 px-4 font-mono text-[19px] tracking-widest'
                }
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0 || undefined}
                aria-describedby={describedBy}
              />
            )}
          </Field>
        )}
      </form.Field>

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <button type="submit" className="dash-btn dash-btn-primary h-[46px] w-full text-sm" disabled={isSubmitting}>
            {isSubmitting ? <Working label="Signing in" /> : 'Sign in'}
          </button>
        )}
      </form.Subscribe>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--dash-line)] pt-4">
        <button type="button" className="dash-btn dash-btn-ghost h-11" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="text-[12.5px] text-[var(--dash-blue-ink)] underline-offset-2 hover:underline"
          onClick={() => onSwitch(using === 'totp' ? 'recovery' : 'totp')}
        >
          {using === 'totp' ? 'Lost your phone?' : 'Use my authenticator app'}
        </button>
      </div>
    </form>
  )
}

/* -------------------------------------------------------------- enrollment */

function EnrollVerifyForm({
  challengeId,
  onDone,
  onFailure,
  onBack,
}: {
  challengeId: string
  onDone: (codes: string[]) => void
  onFailure: (message: string) => void
  onBack: () => void
}) {
  const form = useForm({
    defaultValues: { code: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) =>
        v.safeParse(TotpCodeSchema, value.code).success
          ? undefined
          : { fields: { code: 'Enter the 6-digit code from your authenticator app' } },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      try {
        const result = await confirmEnrollment({
          challengeId,
          code: v.parse(TotpCodeSchema, value.code),
        })

        onDone(result.recoveryCodes)
      } catch (error) {
        onFailure(
          messageFrom(error, 'That code is not right. Check your authenticator app and try again'),
        )
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="max-w-[300px]">
        <form.Field name="code">
          {(field) => (
            <Field
              id="enroll-code"
              label="6-digit code"
              error={field.state.meta.errors[0] as string | undefined}
            >
              {(describedBy) => (
                <input
                  id="enroll-code"
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- the only field on the step
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="dash-field dash-num h-14 px-4 text-[26px] font-semibold tracking-[0.34em]"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  aria-describedby={describedBy}
                />
              )}
            </Field>
          )}
        </form.Field>
      </div>

      <div className="flex gap-2.5">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <button type="submit" className="dash-btn dash-btn-primary h-11 px-5" disabled={isSubmitting}>
              {isSubmitting ? <Working label="Turning it on" /> : 'Turn it on'}
            </button>
          )}
        </form.Subscribe>
        <button type="button" className="dash-btn dash-btn-quiet h-11" onClick={onBack}>
          Back to the code
        </button>
      </div>
    </form>
  )
}
