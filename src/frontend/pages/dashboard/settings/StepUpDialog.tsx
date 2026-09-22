import { useEffect, useRef, useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import * as v from 'valibot'
import { RecoveryCodeSchema, TotpCodeSchema } from '#/backend2/contracts/auth.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  reverify,
  startPasskeySignIn,
  type PublicKeyOptions,
  type StepUpScope,
} from '#/frontend/features/auth-v2/api'
import { requestPasskeyAssertion, supportsPasskeys } from '#/frontend/features/auth-v2/passkey'
import { AuthDivider, AuthNotice, Field, Working } from '#/frontend/pages/dashboard/auth/AuthShell'

/**
 * "Confirm it is you", before anything about signing in can change.
 *
 * A still-valid cookie is deliberately not enough here — `docs/v2/auth.md`
 * requires a fresh proof, so a borrowed laptop with an open session can read
 * the Dashboard but cannot quietly add a passkey of its own.
 *
 * What it hands back is a capability for one action, not a longer session: it
 * expires in five minutes and is spent by the thing it was granted for.
 */
export function StepUpDialog({
  scope,
  title,
  onConfirmed,
  onCancel,
}: {
  scope: StepUpScope
  title: string
  onConfirmed: (stepUpToken: string) => void
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [passkeyBusy, setPasskeyBusy] = useState(false)
  const [using, setUsing] = useState<'totp' | 'recovery'>('totp')
  const firstControl = useRef<HTMLButtonElement | null>(null)
  const returnFocusTo = useRef<Element | null>(null)

  useEffect(() => {
    returnFocusTo.current = document.activeElement
    firstControl.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Put focus back where it was, or the page loses its place entirely.
      ;(returnFocusTo.current as HTMLElement | null)?.focus?.()
    }
  }, [onCancel])

  const confirmWithPasskey = async () => {
    if (passkeyBusy) return

    setPasskeyBusy(true)
    setError(null)

    try {
      const { challengeId, options } = await startPasskeySignIn()
      const outcome = await requestPasskeyAssertion(options as PublicKeyOptions)

      if (outcome.status === 'cancelled') return
      if (outcome.status !== 'ok') {
        setError(
          outcome.status === 'unsupported'
            ? 'This browser cannot use a passkey. Use your password and a code.'
            : outcome.message,
        )

        return
      }

      const { stepUpToken } = await reverify(scope, {
        challengeId,
        credential: outcome.credential,
      })

      onConfirmed(stepUpToken)
    } catch (caught) {
      setError(
        caught instanceof ApiRequestError ? caught.message : 'That did not confirm. Try again',
      )
    } finally {
      setPasskeyBusy(false)
    }
  }

  const form = useForm({
    defaultValues: { password: '', code: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}
        const schema = using === 'totp' ? TotpCodeSchema : RecoveryCodeSchema

        if (value.password.length === 0) fields.password = 'Enter your password'
        if (!v.safeParse(schema, value.code).success) {
          fields.code =
            using === 'totp'
              ? 'Enter the 6-digit code from your authenticator app'
              : 'A recovery code is ten characters, like abcde-fghij'
        }

        return Object.keys(fields).length > 0 ? { fields } : undefined
      },
    },
    onSubmitInvalid: () => {
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>('[data-step-up] [aria-invalid="true"]')
          ?.focus()
      })
    },
    onSubmit: async ({ value }) => {
      setError(null)

      try {
        const schema = using === 'totp' ? TotpCodeSchema : RecoveryCodeSchema
        const cleaned = v.parse(schema, value.code)
        const { stepUpToken } = await reverify(scope, {
          password: value.password,
          ...(using === 'totp' ? { totpCode: cleaned } : { recoveryCode: cleaned }),
        })

        onConfirmed(stepUpToken)
      } catch (caught) {
        setError(
          caught instanceof ApiRequestError ? caught.message : 'That did not confirm. Try again',
        )
      }
    },
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,23,47,.42)] p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div
        data-step-up
        role="dialog"
        aria-modal="true"
        aria-labelledby="step-up-title"
        className="dash-panel w-full max-w-[420px] p-[26px] pb-[22px] shadow-[var(--dash-shadow)]"
      >
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <h2 id="step-up-title" className="dash-title text-[23px]">
              {title}
            </h2>
            <p className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">
              Being signed in is not enough to change how you sign in. This confirmation covers one
              change and lasts five minutes.
            </p>
          </div>

          {error ? <AuthNotice>{error}</AuthNotice> : null}

          {supportsPasskeys() ? (
            <>
              <button
                ref={firstControl}
                type="button"
                className="dash-btn dash-btn-primary h-[46px] w-full text-sm"
                disabled={passkeyBusy}
                onClick={confirmWithPasskey}
              >
                {passkeyBusy ? <Working label="Waiting for your device" /> : 'Use a passkey'}
              </button>
              <AuthDivider label="OR" />
            </>
          ) : null}

          <form
            noValidate
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <form.Field name="password">
              {(field) => (
                <Field
                  id="step-up-password"
                  label="Password"
                  error={field.state.meta.errors[0] as string | undefined}
                >
                  {(describedBy) => (
                    <input
                      id="step-up-password"
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

            <form.Field name="code">
              {(field) => (
                <Field
                  id="step-up-code"
                  label={using === 'totp' ? '6-digit code' : 'Recovery code'}
                  error={field.state.meta.errors[0] as string | undefined}
                  action={
                    <button
                      type="button"
                      className="text-xs text-[var(--dash-blue-ink)] underline-offset-2 hover:underline"
                      onClick={() => setUsing(using === 'totp' ? 'recovery' : 'totp')}
                    >
                      {using === 'totp' ? 'Use a recovery code' : 'Use my authenticator'}
                    </button>
                  }
                >
                  {(describedBy) => (
                    <input
                      id="step-up-code"
                      inputMode={using === 'totp' ? 'numeric' : 'text'}
                      autoComplete={using === 'totp' ? 'one-time-code' : 'off'}
                      spellCheck={false}
                      placeholder={using === 'totp' ? '000000' : 'xxxxx-xxxxx'}
                      className={
                        using === 'totp'
                          ? 'dash-field dash-num h-11 px-3 text-lg font-semibold tracking-[0.3em]'
                          : 'dash-field h-11 px-3 font-mono text-base tracking-wider'
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

            <div className="flex gap-2.5 border-t border-[var(--dash-line)] pt-4">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <button
                    type="submit"
                    className="dash-btn dash-btn-primary h-11 grow text-sm"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? <Working label="Confirming" /> : 'Confirm'}
                  </button>
                )}
              </form.Subscribe>
              <button type="button" className="dash-btn dash-btn-quiet h-11" onClick={onCancel}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
