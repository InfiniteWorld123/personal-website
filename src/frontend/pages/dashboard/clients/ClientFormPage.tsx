import { useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { AlertTriangle, ArrowLeft, Building2, Loader2, User } from 'lucide-react'
import type { ClientCandidate, OwnerClient } from '#/backend2/contracts/client.contract'
import { CLIENT_LIMITS } from '#/backend2/contracts/client.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { findDuplicates } from '#/frontend/features/clients/api'
import {
  type ClientFormField,
  type ClientFormValues,
  clientFormErrors,
  clientToForm,
  duplicateCandidates,
  emptyClientForm,
  formToFields,
  serverFieldErrors,
} from '#/frontend/features/clients/client-form'
import { CountryPicker, NichePicker } from '#/frontend/features/clients/pickers'
import { useClient, useCreateClient, usePatchClient } from '#/frontend/features/clients/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { ClientMark, LoadFailure } from './client-parts'

/**
 * Creating and editing a Client, on one form. Approved in the Clients Design
 * Lab (23 Sep 2026).
 *
 * Errors appear only after the first submit and then follow each change
 * (`AGENTS.md`); focus goes to the first problem. A likely duplicate is a
 * warning with the match, never a merge — the owner opens it or saves anyway.
 * An edit carries the revision it was loaded at, so a save from a stale tab is
 * refused instead of overwriting.
 */

const errorId = (field: string) => `client-${field}-error`

function FieldError({ field, message }: { field: string; message?: string }) {
  if (!message) return null

  return (
    <span id={errorId(field)} className="flex items-center gap-1.5 text-[12px] text-[var(--dash-red-ink)]">
      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
      {message}
    </span>
  )
}

function Label({ htmlFor, children, optional }: { htmlFor: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="text-[12.5px] font-semibold">
      {children}
      {optional ? <span className="font-normal text-[var(--dash-quiet)]"> (optional)</span> : null}
    </label>
  )
}

function DuplicateWarning({
  candidates,
  busy,
  onSaveAnyway,
}: {
  candidates: ClientCandidate[]
  busy: boolean
  onSaveAnyway: () => void
}) {
  return (
    <div
      role="alert"
      tabIndex={-1}
      id="client-duplicate"
      className="flex gap-2.5 rounded-[10px] bg-[var(--dash-furniture)] px-3.5 py-3 text-[12.5px] leading-relaxed outline-none"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--dash-red-ink)]" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p>
          <strong className="block text-[13px]">This may be someone you already have</strong>
          {candidates.length === 1 ? 'A client with' : `${candidates.length} clients with`} the same email or phone{' '}
          {candidates.length === 1 ? 'is' : 'are'} on file. Nothing has been saved yet.
        </p>
        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            className="flex items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] bg-[var(--dash-surface)] px-3 py-2"
          >
            <ClientMark kind={candidate.kind} name={candidate.displayName} />
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[13px]">{candidate.displayName}</strong>
              <span className="block truncate text-[12px] text-[var(--dash-quiet)]">
                Same {candidate.matchedOn.join(' and ')} · {candidate.email}
                {candidate.inTrash ? ' · in Trash' : candidate.status === 'inactive' ? ' · inactive' : ''}
              </span>
            </span>
            <Link
              to={candidate.inTrash ? '/dashboard/clients/trash' : '/dashboard/clients'}
              search={candidate.inTrash ? undefined : { client: candidate.id }}
              className="dash-btn dash-btn-quiet h-8 text-[12px]"
            >
              Open
            </Link>
          </div>
        ))}
        <span>
          <button
            type="button"
            className="dash-btn dash-btn-quiet h-8 text-[12px]"
            disabled={busy}
            onClick={onSaveAnyway}
          >
            Save as a separate client
          </button>
        </span>
      </div>
    </div>
  )
}

function ClientForm({ client }: { client: OwnerClient | null }) {
  const navigate = useNavigate()
  const create = useCreateClient()
  const patch = usePatchClient()
  const reload = useClient(client?.id)
  const revision = useRef(client?.revision ?? 0)
  const allowDuplicate = useRef(false)
  const [candidates, setCandidates] = useState<ClientCandidate[] | null>(null)
  const [serverErrors, setServerErrors] = useState<Partial<Record<ClientFormField, string>>>({})
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)
  const [emailHint, setEmailHint] = useState<string | null>(null)
  const [niche, setNiche] = useState<{ id: string; name: string } | null>(client?.niche ?? null)

  const focusFirstInvalid = () =>
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#client-form [aria-invalid="true"]')?.focus(),
    )

  const form = useForm({
    defaultValues: (client ? clientToForm(client) : emptyClientForm()) satisfies ClientFormValues as ClientFormValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = clientFormErrors(value)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      setFailure(null)
      setServerErrors({})

      try {
        const fields = formToFields(value)
        const saved = client
          ? await patch.mutateAsync({ id: client.id, revision: revision.current, ...fields })
          : await create.mutateAsync({ ...fields, allowDuplicate: allowDuplicate.current })

        notify.success(client ? 'Changes saved' : 'Client created')
        void navigate({ to: '/dashboard/clients', search: { client: saved.id } })
      } catch (caught) {
        const found = duplicateCandidates(caught)

        if (found) {
          setCandidates(found)
          window.requestAnimationFrame(() => document.getElementById('client-duplicate')?.focus())

          return
        }

        const fields = serverFieldErrors(caught)

        if (Object.keys(fields).length > 0) {
          setServerErrors(fields)
          focusFirstInvalid()

          return
        }

        const stale = caught instanceof ApiRequestError && caught.code === 'CONFLICT'

        setFailure({
          stale,
          message: stale
            ? 'This client was changed in another tab. Your edits are still here. Load the newer version to continue — it replaces what you typed.'
            : caught instanceof ApiRequestError
              ? caught.message
              : 'The client could not be saved. Nothing was lost — try again.',
        })
      }
    },
  })

  const kind = useStore(form.store, (state) => state.values.kind)
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  const errorFor = (field: ClientFormField, errors: unknown[]) =>
    (errors[0] as string | undefined) ?? serverErrors[field]

  const input = (
    field: 'name' | 'email' | 'phone' | 'companyName',
    label: string,
    options: {
      optional?: boolean
      type?: string
      placeholder?: string
      onBlur?: () => void
      hint?: string | null
    } = {},
  ) => (
    <form.Field name={field}>
      {(api) => {
        const error = errorFor(field, api.state.meta.errors)
        const id = `client-${field}`
        const hintId = `${id}-hint`

        return (
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={id} optional={options.optional}>
              {label}
            </Label>
            <input
              id={id}
              type={options.type ?? 'text'}
              className="dash-field h-10 w-full px-3 text-[13px]"
              autoComplete="off"
              placeholder={options.placeholder}
              value={api.state.value}
              aria-invalid={error ? true : undefined}
              aria-describedby={cn(error && errorId(field), options.hint && hintId) || undefined}
              onChange={(event) => {
                setServerErrors((current) => ({ ...current, [field]: undefined }))
                api.handleChange(event.target.value)
              }}
              onBlur={() => {
                api.handleBlur()
                options.onBlur?.()
              }}
            />
            <FieldError field={field} message={error} />
            {options.hint ? (
              <span id={hintId} className="text-[11.5px] text-[var(--dash-quiet)]">
                {options.hint}
              </span>
            ) : null}
          </div>
        )
      }}
    </form.Field>
  )

  const checkEmail = async () => {
    const email = form.getFieldValue('email').trim()

    if (!email.includes('@')) return setEmailHint(null)

    try {
      const { candidates: found } = await findDuplicates({ email, excludeId: client?.id })
      const match = found.find((candidate) => candidate.matchedOn.includes('email'))

      setEmailHint(match ? `${match.displayName} already uses this email.` : null)
    } catch {
      setEmailHint(null)
    }
  }

  return (
    <form
      id="client-form"
      noValidate
      className="dash-panel flex flex-col gap-5 p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        allowDuplicate.current = false
        setCandidates(null)
        void form.handleSubmit()
      }}
    >
      {failure ? (
        <div
          role="alert"
          className="dash-tone-red flex flex-col items-start gap-2 rounded-lg px-3 py-2.5 text-[12.5px]"
        >
          {failure.message}
          {failure.stale ? (
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8 text-[12px]"
              onClick={async () => {
                const fresh = await reload.refetch()

                if (fresh.data) {
                  revision.current = fresh.data.revision
                  form.reset(clientToForm(fresh.data))
                  setNiche(fresh.data.niche)
                }

                setFailure(null)
              }}
            >
              Load the newer version
            </button>
          ) : null}
        </div>
      ) : null}

      {candidates ? (
        <DuplicateWarning
          candidates={candidates}
          busy={submitting}
          onSaveAnyway={() => {
            allowDuplicate.current = true
            void form.handleSubmit()
          }}
        />
      ) : null}

      <fieldset className="flex flex-col gap-2.5">
        <legend className="dash-eyebrow-quiet mb-2.5">TYPE</legend>
        <form.Field name="kind">
          {(api) => (
            <div role="radiogroup" aria-label="Client type" className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {(
                [
                  ['person', 'Person', 'Someone you work with directly. You can note where they work.', User],
                  ['company', 'Company', 'A business, with one person you deal with.', Building2],
                ] as const
              ).map(([value, title, text, Icon]) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-[10px] border px-3.5 py-3',
                    api.state.value === value
                      ? 'border-[var(--dash-blue)] bg-[var(--dash-blue-tint)]'
                      : 'border-[var(--dash-line)]',
                  )}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={value}
                    checked={api.state.value === value}
                    onChange={() => api.handleChange(value)}
                    className="mt-1 accent-[var(--dash-brand)]"
                  />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <Icon className="size-3.5" aria-hidden="true" />
                      {title}
                    </span>
                    <span className="text-[12px] text-[var(--dash-quiet)]">{text}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </form.Field>
        {client ? (
          <p className="text-[12px] text-[var(--dash-quiet)]">
            Changing the type keeps every detail and note as it is.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-3.5">
        <legend className="dash-eyebrow-quiet mb-2.5">DETAILS</legend>
        <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2">
          {kind === 'company' ? input('companyName', 'Company name') : null}
          {input('name', kind === 'company' ? 'Primary contact' : 'Name')}
          {input('email', 'Email', {
            type: 'email',
            onBlur: () => void checkEmail(),
            hint: emailHint,
          })}
          {input('phone', 'Phone', { optional: true, placeholder: '+49 170 1234567' })}

          <form.Field name="country">
            {(api) => {
              const error = errorFor('country', api.state.meta.errors)

              return (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="client-country">Country</Label>
                  <CountryPicker
                    id="client-country"
                    value={api.state.value}
                    onChange={(code) => {
                      setServerErrors((current) => ({ ...current, country: undefined }))
                      api.handleChange(code)
                    }}
                    onBlur={api.handleBlur}
                    invalid={Boolean(error)}
                    describedBy={error ? errorId('country') : undefined}
                  />
                  <FieldError field="country" message={error} />
                </div>
              )
            }}
          </form.Field>

          {kind === 'person'
            ? input('companyName', 'Company', { optional: true, placeholder: 'Where they work, if it matters' })
            : null}

          <form.Field name="nicheId">
            {(api) => {
              const error = errorFor('nicheId', api.state.meta.errors)

              return (
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Label htmlFor="client-niche" optional>
                    Niche
                  </Label>
                  <NichePicker
                    id="client-niche"
                    value={niche}
                    onChange={(next) => {
                      setNiche(next)
                      setServerErrors((current) => ({ ...current, nicheId: undefined }))
                      api.handleChange(next?.id ?? null)
                    }}
                    invalid={Boolean(error)}
                    describedBy={error ? errorId('nicheId') : undefined}
                  />
                  <FieldError field="nicheId" message={error} />
                </div>
              )
            }}
          </form.Field>
        </div>
      </fieldset>

      <form.Field name="notes">
        {(api) => {
          const error = errorFor('notes', api.state.meta.errors)

          return (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client-notes" optional>
                Private notes
              </Label>
              <textarea
                id="client-notes"
                className="dash-field min-h-32 w-full resize-y px-3 py-2.5 text-[13px] leading-relaxed"
                placeholder="Only you can see these."
                maxLength={CLIENT_LIMITS.notes}
                value={api.state.value}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId('notes') : undefined}
                onChange={(event) => api.handleChange(event.target.value)}
                onBlur={api.handleBlur}
              />
              <FieldError field="notes" message={error} />
            </div>
          )
        }}
      </form.Field>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--dash-line)] pt-4">
        <span className="text-[12px] text-[var(--dash-quiet)]">
          Billing address and tax details come later, with invoices.
        </span>
        <span className="flex-1" />
        <Link to="/dashboard/clients" search={client ? { client: client.id } : {}} className="dash-btn dash-btn-ghost">
          Cancel
        </Link>
        <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {client ? (submitting ? 'Saving…' : 'Save changes') : submitting ? 'Creating…' : 'Create client'}
        </button>
      </div>
    </form>
  )
}

export function NewClientPage() {
  return (
    <DashboardPage className="mx-auto max-w-[56rem] gap-5">
      <Link to="/dashboard/clients" className="dash-btn dash-btn-ghost -ms-2 h-8 self-start px-2 text-[12.5px]">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All clients
      </Link>
      <PageHead
        eyebrow="PEOPLE · CLIENTS"
        title="New client"
        description="No lead needed. Name, email and country are required — and the company name for a company."
      />
      <ClientForm client={null} />
    </DashboardPage>
  )
}

export function EditClientPage({ clientId }: { clientId: string }) {
  const query = useClient(clientId)

  return (
    <DashboardPage className="mx-auto max-w-[56rem] gap-5">
      <Link
        to="/dashboard/clients"
        search={{ client: clientId }}
        className="dash-btn dash-btn-ghost -ms-2 h-8 self-start px-2 text-[12.5px]"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to the client
      </Link>
      <PageHead eyebrow="PEOPLE · CLIENTS" title={query.data ? `Edit ${query.data.displayName}` : 'Edit client'} />
      {query.isPending ? (
        <section className="dash-panel flex flex-col gap-3 p-6" aria-busy="true" aria-label="Loading client">
          <span className="dash-skeleton h-16 w-full rounded" />
          <span className="dash-skeleton h-40 w-full rounded" />
        </section>
      ) : query.isError ? (
        <section className="dash-panel">
          {query.error instanceof ApiRequestError && query.error.status === 404 ? (
            <div className="flex flex-col items-start gap-3 p-8">
              <h2 className="text-sm font-semibold">This client does not exist</h2>
              <p className="text-[13px] text-[var(--dash-quiet)]">
                It may have been deleted permanently, or the link is wrong.
              </p>
              <Link to="/dashboard/clients" className="dash-btn dash-btn-quiet">
                All clients
              </Link>
            </div>
          ) : (
            <LoadFailure
              title="This client could not be loaded"
              message="The server did not answer. Nothing has been changed."
              onRetry={() => void query.refetch()}
            />
          )}
        </section>
      ) : query.data.trashedAt ? (
        <section className="dash-panel flex flex-col items-start gap-3 p-8">
          <h2 className="text-sm font-semibold">This client is in Trash</h2>
          <p className="text-[13px] text-[var(--dash-quiet)]">Restore it first, then edit it.</p>
          <Link to="/dashboard/clients/trash" className="dash-btn dash-btn-quiet">
            Open Trash
          </Link>
        </section>
      ) : (
        <ClientForm key={query.data.id} client={query.data} />
      )}
    </DashboardPage>
  )
}
