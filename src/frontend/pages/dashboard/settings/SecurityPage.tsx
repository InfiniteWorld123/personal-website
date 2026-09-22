import { useState } from 'react'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import * as v from 'valibot'
import {
  AUTH_LIMITS,
  EmailSchema,
  PasswordSchema,
  TotpCodeSchema,
  type PasskeySummary,
  type SessionSummary,
} from '#/backend2/contracts/auth.contract'
import { ApiRequestError } from '#/frontend/api/response'
import {
  changePassword,
  confirmTotpReplacement,
  finishPasskeyRegistration,
  removePasskey,
  requestEmailChange,
  revokeEverySession,
  revokeSession,
  rotateRecoveryCodes,
  startPasskeyRegistration,
  startTotpReplacement,
  type PublicKeyOptions,
  type StepUpScope,
} from '#/frontend/features/auth-v2/api'
import {
  guessDeviceName,
  requestPasskeyRegistration,
  supportsPasskeys,
} from '#/frontend/features/auth-v2/passkey'
import {
  useRefreshSecurity,
  useSecurityOverview,
  useSessionPage,
} from '#/frontend/features/auth-v2/queries'
import { Panel, PanelHead, StatusChip } from '#/frontend/dashboard/primitives'
import { notify } from '#/frontend/lib/notify'
import { AuthNotice, Field, Working } from '#/frontend/pages/dashboard/auth/AuthShell'
import { RecoveryCodeList, TotpEnrollment } from '#/frontend/pages/dashboard/auth/factor-parts'
import { SettingsSection } from './SettingsLayout'
import { StepUpDialog } from './StepUpDialog'

/**
 * Settings → Security.
 *
 * Reading this page needs a session. Changing anything on it needs a fresh
 * proof on top — every action below goes through `StepUpDialog` first, except
 * signing one other device out, which a worried owner should be able to do
 * instantly.
 */

type Pending = {
  scope: StepUpScope
  title: string
  run: (stepUpToken: string) => Promise<void>
}

const failureText = (error: unknown, fallback: string): string =>
  error instanceof ApiRequestError ? error.message : fallback

export function SecurityPage() {
  const overview = useSecurityOverview()
  const refresh = useRefreshSecurity()
  const [pending, setPending] = useState<Pending | null>(null)
  const [codes, setCodes] = useState<{ title: string; list: string[] } | null>(null)
  const [totpSetup, setTotpSetup] = useState<{
    stepUpToken: string
    challengeId: string
    uri: string
    manualKey: string
  } | null>(null)
  const [emailFormOpen, setEmailFormOpen] = useState(false)
  const [passwordFormOpen, setPasswordFormOpen] = useState(false)
  const [sessionPage, setSessionPage] = useState(1)
  /*
   * Page one already arrived with the overview. Only a request for a later
   * page costs a second call, which keeps the common case to one round trip —
   * and keeps the factor list and the session list one consistent snapshot
   * rather than two that can disagree.
   */
  const laterSessions = useSessionPage(sessionPage, sessionPage > 1)

  const run = (action: Pending) => setPending(action)

  /* ------------------------------------------------------------- actions */

  const addPasskey = (): Pending => ({
    scope: 'passkeys',
    title: 'Confirm it is you',
    run: async (stepUpToken) => {
      const { challengeId, options } = await startPasskeyRegistration(stepUpToken)
      const outcome = await requestPasskeyRegistration(options as PublicKeyOptions)

      if (outcome.status === 'cancelled') return
      if (outcome.status !== 'ok') {
        notify.error(
          outcome.status === 'unsupported'
            ? 'This browser cannot register a passkey.'
            : outcome.message,
        )

        return
      }

      const name = window.prompt('Name this passkey', guessDeviceName())?.trim()

      await finishPasskeyRegistration(stepUpToken, {
        challengeId,
        credential: outcome.credential,
        name: name && name.length > 0 ? name : guessDeviceName(),
      })

      notify.success('Passkey registered')
      await refresh()
    },
  })

  const dropPasskey = (passkey: PasskeySummary): Pending => ({
    scope: 'passkeys',
    title: `Remove ${passkey.name}?`,
    run: async (stepUpToken) => {
      await removePasskey(stepUpToken, passkey.id)
      notify.success('Passkey removed')
      await refresh()
    },
  })

  const replaceTotp = (): Pending => ({
    scope: 'totp',
    title: 'Confirm it is you',
    run: async (stepUpToken) => {
      const setup = await startTotpReplacement(stepUpToken)

      setTotpSetup({ stepUpToken, ...setup })
    },
  })

  const newRecoveryCodes = (): Pending => ({
    scope: 'recovery-codes',
    title: 'Confirm it is you',
    run: async (stepUpToken) => {
      const result = await rotateRecoveryCodes(stepUpToken)

      setCodes({ title: 'New recovery codes', list: result.recoveryCodes })
      await refresh()
    },
  })

  const signOutEverywhere = (): Pending => ({
    scope: 'sessions',
    title: 'Sign out everywhere?',
    run: async (stepUpToken) => {
      await revokeEverySession(stepUpToken)
      window.location.assign('/dashboard/login')
    },
  })

  /* -------------------------------------------------------------- render */

  if (overview.isPending) {
    return (
      <SettingsSection title="Security">
        <Panel className="items-center justify-center p-10 text-[13px] text-[var(--dash-quiet)]">
          <Working label="Loading your security settings" />
        </Panel>
      </SettingsSection>
    )
  }

  if (overview.isError || !overview.data) {
    const unauthorized =
      overview.error instanceof ApiRequestError && overview.error.status === 401

    return (
      <SettingsSection title="Security">
        <Panel className="gap-4 p-6">
          <AuthNotice>
            {unauthorized
              ? 'Your session has ended. Sign in again to see this page.'
              : failureText(overview.error, 'These settings could not be loaded.')}
          </AuthNotice>
          {unauthorized ? (
            <a href="/dashboard/login" className="dash-btn dash-btn-primary h-11 self-start px-5">
              Go to sign in
            </a>
          ) : (
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-11 self-start"
              onClick={() => void overview.refetch()}
            >
              Try again
            </button>
          )}
        </Panel>
      </SettingsSection>
    )
  }

  const { owner, passkeys, pendingEmailChange, recentEvents } = overview.data
  const sessions = sessionPage > 1 ? laterSessions.data : overview.data.sessions

  return (
    <SettingsSection
      title="Security"
      description="Changing anything here asks you to prove it is you again, even though you are already signed in."
    >
      {owner.accessState === 'enrolling' ? (
        <AuthNotice tone="info">
          This account has not finished setting up its second factor, so it cannot open anything
          yet.
        </AuthNotice>
      ) : null}

      <Panel>
        <PanelHead title="How you sign in" />
        <FactorRow
          name="Passkeys"
          note={
            owner.factors.passkeys > 0
              ? `${owner.factors.passkeys} registered. Each signs you in on its own, with no code afterwards.`
              : 'None yet. Add one and signing in becomes a single tap.'
          }
          status={owner.factors.passkeys > 0 ? `${owner.factors.passkeys} ON` : 'OFF'}
          tone={owner.factors.passkeys > 0 ? 'blue' : 'grey'}
          action={supportsPasskeys() ? 'Add' : undefined}
          actionLabel="Add a passkey"
          onAction={() => run(addPasskey())}
        />
        <FactorRow
          name="Authenticator app"
          note="The second step after your password."
          status={owner.factors.totp ? 'ON' : 'NOT SET UP'}
          tone={owner.factors.totp ? 'blue' : 'red'}
          action="Replace"
          actionLabel="Replace your authenticator app"
          onAction={() => run(replaceTotp())}
        />
        <FactorRow
          name="Recovery codes"
          note="Each works once, and stands in for the authenticator app."
          status={`${owner.factors.recoveryCodesRemaining} LEFT`}
          tone={owner.factors.recoveryCodesRemaining > 2 ? 'grey' : 'red'}
          action="Replace"
          actionLabel="Replace your recovery codes"
          onAction={() => run(newRecoveryCodes())}
        />
        <p className="bg-[var(--dash-chip)] px-5 py-3 text-xs leading-relaxed text-[var(--dash-quiet)]">
          A passkey signs you in on its own. Email and password never do — they always need the
          authenticator app or a recovery code after them.
        </p>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHead
            title="Passkeys"
            count={passkeys.length}
            action={
              supportsPasskeys() ? (
                <button
                  type="button"
                  className="dash-btn dash-btn-primary h-[34px]"
                  aria-label="Add a passkey"
                  onClick={() => run(addPasskey())}
                >
                  Add
                </button>
              ) : undefined
            }
          />
          {passkeys.length === 0 ? (
            <p className="px-5 pb-5 text-[12.5px] leading-relaxed text-[var(--dash-quiet)]">
              No passkeys yet. Adding one asks this device to check you — by fingerprint, face or
              PIN, whichever it offers.
            </p>
          ) : (
            passkeys.map((passkey) => (
              <div
                key={passkey.id}
                className="flex items-center gap-3 border-t border-[var(--dash-line)] px-5 py-3"
              >
                <div className="min-w-0 grow">
                  <p className="text-[13px] font-semibold">{passkey.name}</p>
                  <p className="text-[11.5px] text-[var(--dash-quiet)]">
                    Added {formatDay(passkey.createdAt)}
                    {passkey.lastUsedAt ? ` · last used ${formatDay(passkey.lastUsedAt)}` : ' · never used'}
                    {passkey.syncedAcrossDevices ? ' · syncs' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="dash-btn dash-btn-ghost size-11"
                  aria-label={`Remove the passkey named ${passkey.name}`}
                  onClick={() => run(dropPasskey(passkey))}
                >
                  <TrashIcon />
                </button>
              </div>
            ))
          )}
          <p className="border-t border-[var(--dash-line)] px-5 py-3 text-[11.5px] leading-relaxed text-[var(--dash-quiet)]">
            The last usable way into the account cannot be removed.
          </p>
        </Panel>

        <Panel>
          <PanelHead title="Email and password" />
          <div className="flex items-center gap-3 border-t border-[var(--dash-line)] px-5 py-3">
            <div className="min-w-0 grow">
              <p className="truncate text-[13px] font-semibold">{owner.email}</p>
              <p className="text-[11.5px] text-[var(--dash-quiet)]">Where reset links are sent.</p>
            </div>
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-9"
              onClick={() => setEmailFormOpen((open) => !open)}
            >
              Change
            </button>
          </div>

          {pendingEmailChange ? (
            <div className="border-t border-[var(--dash-line)] bg-[var(--dash-blue-tint)] px-5 py-3">
              <p className="text-xs leading-snug text-[var(--dash-blue-ink)]">
                Waiting on <strong className="font-semibold">{pendingEmailChange.newEmail}</strong>{' '}
                to confirm. This address keeps working until it does.
              </p>
            </div>
          ) : null}

          {emailFormOpen ? (
            <ChangeEmailForm
              onCancel={() => setEmailFormOpen(false)}
              onSubmit={(newEmail) =>
                run({
                  scope: 'email',
                  title: 'Confirm it is you',
                  run: async (stepUpToken) => {
                    await requestEmailChange(stepUpToken, newEmail)
                    setEmailFormOpen(false)
                    notify.success('Check the new address to confirm it')
                    await refresh()
                  },
                })
              }
            />
          ) : null}

          <div className="flex items-center gap-3 border-t border-[var(--dash-line)] px-5 py-3">
            <div className="min-w-0 grow">
              <p className="text-[13px] font-semibold">Password</p>
              <p className="text-[11.5px] text-[var(--dash-quiet)]">
                Changing it signs out every device, including this one.
              </p>
            </div>
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-9"
              onClick={() => setPasswordFormOpen((open) => !open)}
            >
              Change
            </button>
          </div>

          {passwordFormOpen ? (
            <ChangePasswordForm
              onCancel={() => setPasswordFormOpen(false)}
              onSubmit={(newPassword) =>
                run({
                  scope: 'password',
                  title: 'Confirm it is you',
                  run: async (stepUpToken) => {
                    await changePassword(stepUpToken, newPassword)
                    window.location.assign('/dashboard/login')
                  },
                })
              }
            />
          ) : null}
        </Panel>
      </div>

      <Panel>
        <PanelHead
          title="Where you are signed in"
          count={sessions?.total}
          action={
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-[34px] text-[var(--dash-red-ink)]"
              onClick={() => run(signOutEverywhere())}
            >
              Sign out everywhere
            </button>
          }
        />
        {(sessions?.items ?? []).map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            onRevoke={async () => {
              try {
                await revokeSession(session.id)

                if (session.isCurrent) {
                  window.location.assign('/dashboard/login')

                  return
                }

                notify.success('That device was signed out')
                await refresh()
              } catch (error) {
                notify.error(failureText(error, 'That session could not be ended'))
              }
            }}
          />
        ))}
        {sessions && sessions.pageCount > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-[var(--dash-line)] px-5 py-3">
            <p className="text-[11.5px] text-[var(--dash-quiet)]">
              Page {sessions.page} of {sessions.pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="dash-btn dash-btn-quiet h-9"
                disabled={sessionPage <= 1}
                onClick={() => setSessionPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </button>
              <button
                type="button"
                className="dash-btn dash-btn-quiet h-9"
                disabled={!sessions.hasMore}
                onClick={() => setSessionPage((page) => page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
        <p className="border-t border-[var(--dash-line)] px-5 py-3 text-[11.5px] leading-relaxed text-[var(--dash-quiet)]">
          Guessed from what the browser said about itself — not a location, and not a claim about
          where you were.
        </p>
      </Panel>

      <Panel>
        <PanelHead title="Recent security activity" />
        {recentEvents.length === 0 ? (
          <p className="px-5 pb-5 text-[12.5px] text-[var(--dash-quiet)]">Nothing recorded yet.</p>
        ) : (
          recentEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-3.5 border-t border-[var(--dash-line)] px-5 py-2.5"
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: eventColour(event.kind) }}
              />
              <p className="grow text-[12.5px]">{eventLabel(event.kind)}</p>
              <p className="dash-num shrink-0 text-[11.5px] text-[var(--dash-quiet)]">
                {formatDay(event.createdAt)}
              </p>
            </div>
          ))
        )}
      </Panel>

      {pending ? (
        <StepUpDialog
          scope={pending.scope}
          title={pending.title}
          onCancel={() => setPending(null)}
          onConfirmed={async (stepUpToken) => {
            const action = pending

            setPending(null)

            try {
              await action.run(stepUpToken)
            } catch (error) {
              notify.error(failureText(error, 'That change could not be made'))
              await refresh()
            }
          }}
        />
      ) : null}

      {totpSetup ? (
        <ReplaceTotpDialog
          setup={totpSetup}
          onCancel={() => setTotpSetup(null)}
          onDone={async (list) => {
            setTotpSetup(null)
            setCodes({ title: 'New recovery codes', list })
            await refresh()
          }}
        />
      ) : null}

      {codes ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,23,47,.42)] p-6">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={codes.title}
            className="dash-panel w-full max-w-[520px] p-[26px] shadow-[var(--dash-shadow)]"
          >
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="dash-title text-[23px]">{codes.title}</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--dash-quiet)]">
                  These replace every code you had. This is the only screen that shows them.
                </p>
              </div>
              <RecoveryCodeList
                codes={codes.list}
                onAcknowledge={() => setCodes(null)}
                acknowledgeLabel="Done"
              />
            </div>
          </div>
        </div>
      ) : null}
    </SettingsSection>
  )
}

/* ----------------------------------------------------------------- parts */

function FactorRow({
  name,
  note,
  status,
  tone,
  action,
  actionLabel,
  onAction,
}: {
  name: string
  note: string
  status: string
  tone: 'blue' | 'grey' | 'red'
  action?: string
  /**
   * What a screen reader announces. Three rows carry a button reading
   * "Replace"; without this they are three controls with the same name and
   * nothing to tell them apart.
   */
  actionLabel?: string
  onAction: () => void
}) {
  return (
    <div className="flex items-center gap-4 border-t border-[var(--dash-line)] px-5 py-3.5">
      <div className="min-w-0 grow">
        <p className="text-[13.5px] font-semibold">{name}</p>
        <p className="text-xs text-[var(--dash-quiet)]">{note}</p>
      </div>
      <StatusChip tone={tone} className="shrink-0">
        {status}
      </StatusChip>
      {action ? (
        <button
          type="button"
          className="dash-btn dash-btn-quiet h-9 shrink-0"
          aria-label={actionLabel ?? `${action} ${name}`}
          onClick={onAction}
        >
          {action}
        </button>
      ) : null}
    </div>
  )
}

function SessionRow({
  session,
  onRevoke,
}: {
  session: SessionSummary
  onRevoke: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  return (
    <div className="flex items-center gap-3 border-t border-[var(--dash-line)] px-5 py-3">
      <div className="min-w-0 grow">
        <p className="flex items-center gap-2 text-[13px] font-semibold">
          {session.inferredDevice}
          {session.isCurrent ? (
            <StatusChip tone="blue" className="h-[19px] px-2 text-[10.5px]">
              THIS ONE
            </StatusChip>
          ) : null}
        </p>
        <p className="text-[11.5px] text-[var(--dash-quiet)]">
          Signed in {formatDay(session.authenticatedAt)} with {methodLabel(session.method)} · ends{' '}
          {formatDay(session.expiresAt)}
        </p>
      </div>
      <button
        type="button"
        className="dash-btn dash-btn-quiet h-9 shrink-0"
        disabled={busy}
        onClick={async () => {
          setBusy(true)

          try {
            await onRevoke()
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Ending' : 'Sign out'}
      </button>
    </div>
  )
}

function ReplaceTotpDialog({
  setup,
  onDone,
  onCancel,
}: {
  setup: { stepUpToken: string; challengeId: string; uri: string; manualKey: string }
  onDone: (codes: string[]) => void
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { code: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) =>
        v.safeParse(TotpCodeSchema, value.code).success
          ? undefined
          : { fields: { code: 'Enter the 6-digit code from your authenticator app' } },
    },
    onSubmit: async ({ value }) => {
      setError(null)

      try {
        const result = await confirmTotpReplacement(setup.stepUpToken, {
          challengeId: setup.challengeId,
          code: v.parse(TotpCodeSchema, value.code),
        })

        onDone(result.recoveryCodes)
      } catch (caught) {
        setError(failureText(caught, 'That code is not right. Try again'))
      }
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(16,23,47,.42)] p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Replace your authenticator app"
        className="dash-panel w-full max-w-[560px] p-[26px] shadow-[var(--dash-shadow)]"
      >
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="dash-title text-[23px]">Replace your authenticator app</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--dash-quiet)]">
              The one you have keeps working until a code from the new one is accepted.
            </p>
          </div>

          {error ? <AuthNotice>{error}</AuthNotice> : null}

          <TotpEnrollment uri={setup.uri} manualKey={setup.manualKey} />

          <form
            noValidate
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void form.handleSubmit()
            }}
          >
            <div className="max-w-[260px]">
              <form.Field name="code">
                {(field) => (
                  <Field
                    id="replace-totp"
                    label="6-digit code"
                    error={field.state.meta.errors[0] as string | undefined}
                  >
                    {(describedBy) => (
                      <input
                        id="replace-totp"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="000000"
                        className="dash-field dash-num h-12 px-3 text-xl font-semibold tracking-[0.3em]"
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

            <div className="flex gap-2.5 border-t border-[var(--dash-line)] pt-4">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <button type="submit" className="dash-btn dash-btn-primary h-11 px-5" disabled={isSubmitting}>
                    {isSubmitting ? <Working label="Switching" /> : 'Switch to this app'}
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

function ChangeEmailForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (newEmail: string) => void
  onCancel: () => void
}) {
  const form = useForm({
    defaultValues: { email: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) =>
        v.safeParse(EmailSchema, value.email).success
          ? undefined
          : { fields: { email: 'Enter the new email address' } },
    },
    onSubmit: ({ value }) => onSubmit(v.parse(EmailSchema, value.email)),
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-3 border-t border-[var(--dash-line)] px-5 py-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="email">
        {(field) => (
          <Field
            id="new-email"
            label="New email address"
            error={field.state.meta.errors[0] as string | undefined}
            hint="A link goes to the new address. The old one keeps working until you open it."
          >
            {(describedBy) => (
              <input
                id="new-email"
                type="email"
                autoComplete="email"
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
      <div className="flex gap-2.5">
        <button type="submit" className="dash-btn dash-btn-primary h-10">
          Send the link
        </button>
        <button type="button" className="dash-btn dash-btn-quiet h-10" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function ChangePasswordForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (newPassword: string) => void
  onCancel: () => void
}) {
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
    onSubmit: ({ value }) => onSubmit(value.password),
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-3 border-t border-[var(--dash-line)] px-5 py-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="password">
        {(field) => (
          <Field
            id="change-password"
            label="New password"
            error={field.state.meta.errors[0] as string | undefined}
            hint={`At least ${AUTH_LIMITS.passwordMin} characters. Every device will be signed out.`}
          >
            {(describedBy) => (
              <input
                id="change-password"
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
      <div className="flex gap-2.5">
        <button type="submit" className="dash-btn dash-btn-primary h-10">
          Change it
        </button>
        <button type="button" className="dash-btn dash-btn-quiet h-10" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M5 7 H19 M10 7 V5.5 A1.5 1.5 0 0 1 11.5 4 H12.5 A1.5 1.5 0 0 1 14 5.5 V7 M7 7 L7.7 19 A1.5 1.5 0 0 0 9.2 20.4 H14.8 A1.5 1.5 0 0 0 16.3 19 L17 7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
)

/* --------------------------------------------------------------- labels */

const formatDay = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(iso))

const methodLabel = (method: SessionSummary['method']): string =>
  method === 'passkey'
    ? 'a passkey'
    : method === 'password_totp'
      ? 'a password and a code'
      : 'a recovery code'

const EVENT_LABELS: Record<string, string> = {
  sign_in_passkey: 'Signed in with a passkey',
  sign_in_password_totp: 'Signed in with a password and a code',
  sign_in_password_recovery: 'Signed in with a recovery code',
  sign_in_failed: 'A sign-in was refused',
  second_factor_failed: 'A second-factor attempt was refused',
  sign_out: 'Signed out',
  sessions_revoked: 'Signed out everywhere',
  session_revoked: 'A device was signed out',
  step_up_granted: 'Confirmed identity for a change',
  step_up_failed: 'A confirmation was refused',
  passkey_registered: 'A passkey was added',
  passkey_removed: 'A passkey was removed',
  totp_enrolled: 'Authenticator app turned on',
  totp_replaced: 'Authenticator app replaced',
  recovery_codes_issued: 'New recovery codes issued',
  recovery_code_used: 'A recovery code was used',
  password_changed: 'Password changed',
  password_reset_requested: 'A password reset was requested',
  password_reset_completed: 'Password reset',
  email_change_requested: 'An email change was requested',
  email_changed: 'Email address changed',
  owner_created: 'This account was created',
  emergency_recovery: 'Emergency recovery was performed',
}

const eventLabel = (kind: string): string => EVENT_LABELS[kind] ?? kind.replace(/_/g, ' ')

const eventColour = (kind: string): string =>
  kind.includes('failed') || kind.includes('recovery_code_used')
    ? 'var(--dash-red)'
    : kind.startsWith('sign_in')
      ? 'var(--dash-live)'
      : 'var(--dash-blue)'
