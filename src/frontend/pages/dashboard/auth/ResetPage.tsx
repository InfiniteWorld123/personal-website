import { useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import * as v from 'valibot'
import {
  AUTH_LIMITS,
  EmailSchema,
  NEUTRAL_RECOVERY_MESSAGE,
  PasswordSchema,
} from '#/backend2/contracts/auth.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { completePasswordReset, confirmEmailChange, requestPasswordReset } from '#/frontend/features/auth-v2/api'
import { AuthHeading, AuthNotice, AuthShell, Field, Working } from './AuthShell'

/**
 * The two screens a link from an email lands on, and the screen that asks for
 * one.
 *
 * Both live outside the Dashboard shell on purpose: the owner clicking a reset
 * link is by definition signed out, and confirming a new address revokes every
 * session — so neither can sit behind a guard.
 */

const messageFrom = (error: unknown, fallback: string): string =>
  error instanceof ApiRequestError ? error.message : fallback

const focusFirstInvalid = () => {
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[data-dashboard] [aria-invalid="true"]')?.focus()
  })
}

export function ResetPage({ token }: { token: string | null }) {
  return token ? <ChooseNewPassword token={token} /> : <AskForLink />
}

/* ---------------------------------------------------------------- request */

function AskForLink() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) =>
        v.safeParse(EmailSchema, value.email).success
          ? undefined
          : { fields: { email: 'Enter the email address on the account' } },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      setError(null)

      try {
        await requestPasswordReset(v.parse(EmailSchema, value.email))
        setSent(true)
      } catch (requestError) {
        // A configuration failure is the one thing this screen may report, and
        // it says nothing about whether the address exists.
        setError(messageFrom(requestError, 'That could not be sent. Try again in a moment'))
      }
    },
  })

  if (sent) {
    return (
      <AuthShell footer="A step on the way back in, not a way around the second factor.">
        <div className="flex flex-col gap-[18px]">
          <AuthHeading title="Check your email">{NEUTRAL_RECOVERY_MESSAGE}.</AuthHeading>
          <AuthNotice tone="info">
            This screen says the same thing for every address, including one with no account. It is
            the only way it can avoid confirming which addresses exist.
          </AuthNotice>
          <p className="text-[12.5px] leading-relaxed">
            The link works once and for thirty minutes. Asking again cancels the one before it.
          </p>
          <a href="/dashboard/login" className="dash-btn dash-btn-quiet h-11 w-full text-sm">
            Back to sign in
          </a>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell footer="A step on the way back in, not a way around the second factor.">
      <div className="flex flex-col gap-5">
        <AuthHeading title="Forgotten password">
          We will email a link to the address on the account.
        </AuthHeading>

        {error ? <AuthNotice>{error}</AuthNotice> : null}

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
              <Field
                id="reset-email"
                label="Email"
                error={field.state.meta.errors[0] as string | undefined}
              >
                {(describedBy) => (
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="username"
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
              <button
                type="submit"
                className="dash-btn dash-btn-primary h-[46px] w-full text-sm"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Working label="Sending" /> : 'Send the link'}
              </button>
            )}
          </form.Subscribe>

          <a href="/dashboard/login" className="text-center text-[12.5px] text-[var(--dash-blue-ink)] underline-offset-2 hover:underline">
            Back to sign in
          </a>
        </form>
      </div>
    </AuthShell>
  )
}

/* --------------------------------------------------------------- complete */

function ChooseNewPassword({ token }: { token: string }) {
  const [state, setState] = useState<'form' | 'done' | 'expired'>('form')
  const [error, setError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { password: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const result = v.safeParse(PasswordSchema, value.password)

        return result.success
          ? undefined
          : { fields: { password: result.issues[0]?.message ?? 'That password is not acceptable' } }
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      setError(null)

      try {
        await completePasswordReset({ token, newPassword: value.password })
        setState('done')
      } catch (submitError) {
        // 401 from this route means the link itself is finished — a different
        // screen, not a message under the field.
        if (submitError instanceof ApiRequestError && submitError.status === 401) {
          setState('expired')

          return
        }

        setError(messageFrom(submitError, 'That could not be saved. Try again'))
      }
    },
  })

  if (state === 'expired') {
    return (
      <AuthShell>
        <div className="flex flex-col gap-4">
          <AuthHeading title="That link is done">
            Reset links last thirty minutes and work once.
          </AuthHeading>
          <AuthNotice>
            This link has expired or was already used. Nothing has changed on the account.
          </AuthNotice>
          <a href="/dashboard/login/reset" className="dash-btn dash-btn-primary h-[46px] w-full text-sm">
            Ask for a new one
          </a>
        </div>
      </AuthShell>
    )
  }

  if (state === 'done') {
    return (
      <AuthShell>
        <div className="flex flex-col gap-4">
          <AuthHeading title="Password set">
            Now sign in — with your passkey, or this password and a code.
          </AuthHeading>
          <AuthNotice tone="info">
            Every device that was signed in has been signed out.
          </AuthNotice>
          <a href="/dashboard/login" className="dash-btn dash-btn-primary h-[46px] w-full text-sm">
            Go to sign in
          </a>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-5">
        <AuthHeading title="Choose a new password">
          Then sign in again — with your passkey, or this password and a code.
        </AuthHeading>

        {error ? <AuthNotice>{error}</AuthNotice> : null}

        <form
          noValidate
          className="flex flex-col gap-3.5"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="password">
            {(field) => (
              <Field
                id="new-password"
                label="New password"
                error={field.state.meta.errors[0] as string | undefined}
                hint={`At least ${AUTH_LIMITS.passwordMin} characters. A sentence you will remember beats a puzzle you will not.`}
              >
                {(describedBy) => (
                  <input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
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

          <AuthNotice tone="info">
            This does not switch off your authenticator app, and it does not remove a passkey. The
            next sign-in still needs one of them.
          </AuthNotice>

          <form.Subscribe selector={(state_) => state_.isSubmitting}>
            {(isSubmitting) => (
              <button
                type="submit"
                className="dash-btn dash-btn-primary h-[46px] w-full text-sm"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Working label="Saving" /> : 'Set the password'}
              </button>
            )}
          </form.Subscribe>
        </form>
      </div>
    </AuthShell>
  )
}

/* ---------------------------------------------------------- email change */

export function ConfirmEmailPage({ token }: { token: string | null }) {
  const [state, setState] = useState<'ready' | 'working' | 'done' | 'expired'>('ready')
  const [email, setEmail] = useState('')

  if (!token) {
    return (
      <AuthShell>
        <div className="flex flex-col gap-4">
          <AuthHeading title="Nothing to confirm">
            This page needs the link from the email.
          </AuthHeading>
          <a href="/dashboard/login" className="dash-btn dash-btn-quiet h-11 w-full text-sm">
            Back to sign in
          </a>
        </div>
      </AuthShell>
    )
  }

  if (state === 'done') {
    return (
      <AuthShell>
        <div className="flex flex-col gap-4">
          <AuthHeading title="Address changed">
            <strong className="font-semibold text-[var(--dash-ink)]">{email}</strong> is now your
            sign-in email.
          </AuthHeading>
          <AuthNotice tone="info">
            Every device has been signed out. Sign in again with the new address.
          </AuthNotice>
          <a href="/dashboard/login" className="dash-btn dash-btn-primary h-[46px] w-full text-sm">
            Go to sign in
          </a>
        </div>
      </AuthShell>
    )
  }

  if (state === 'expired') {
    return (
      <AuthShell>
        <div className="flex flex-col gap-4">
          <AuthHeading title="That link is done">
            Confirmation links last a day and work once.
          </AuthHeading>
          <AuthNotice>
            This link has expired or was already used. Your address has not changed.
          </AuthNotice>
          <a href="/dashboard/login" className="dash-btn dash-btn-quiet h-11 w-full text-sm">
            Back to sign in
          </a>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <div className="flex flex-col gap-5">
        <AuthHeading title="Confirm your new address">
          The old one keeps working until you do.
        </AuthHeading>
        {/*
          A deliberate button rather than confirming on page load: a link
          preview fetched by a mail client would otherwise spend the token
          before the owner ever saw it.
        */}
        <button
          type="button"
          className="dash-btn dash-btn-primary h-[46px] w-full text-sm"
          disabled={state === 'working'}
          onClick={async () => {
            setState('working')

            try {
              const result = await confirmEmailChange(token)

              setEmail(result.email)
              setState('done')
            } catch {
              setState('expired')
            }
          }}
        >
          {state === 'working' ? <Working label="Confirming" /> : 'Confirm this address'}
        </button>
      </div>
    </AuthShell>
  )
}
