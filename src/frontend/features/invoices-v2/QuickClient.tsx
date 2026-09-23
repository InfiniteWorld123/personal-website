import { useState } from 'react'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ClientCandidate, OwnerClient } from '#/backend2/contracts/client.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { type ClientFormValues, clientFormErrors, duplicateCandidates, emptyClientForm, formToFields, serverFieldErrors } from '#/frontend/features/clients/client-form'
import { CountryPicker } from '#/frontend/features/clients/pickers'
import { useCreateClient } from '#/frontend/features/clients/queries'
import { cn } from '#/frontend/lib/utils'

/**
 * "Add a client without leaving" — the invoice editor's quick create. The
 * Client is made through the Clients module, with its own rules and its own
 * duplicate warning, and then opens in Clients like any other. The address
 * is the invoice's, not the Client's: Clients have no billing address, so
 * each invoice keeps its own (`docs/v2/invoices.md`).
 *
 * It sits inside the invoice form, so it is not a `<form>` of its own; its
 * button submits this small form only. Same rhythm as every V2 form: quiet
 * until the first attempt, then checking as the owner types.
 */

type QuickValues = Pick<ClientFormValues, 'kind' | 'name' | 'email' | 'country' | 'companyName'> & { address: string }
type QuickField = keyof QuickValues

const errorId = (field: string) => `quick-${field}-error`

export function QuickClient({
  initialName,
  onCreated,
  onCancel,
  onUseExisting,
}: {
  initialName: string
  onCreated: (client: OwnerClient, address: string) => void
  onCancel: () => void
  onUseExisting: (candidate: ClientCandidate) => void
}) {
  const create = useCreateClient()
  const [candidates, setCandidates] = useState<ClientCandidate[] | null>(null)
  const [serverErrors, setServerErrors] = useState<Partial<Record<QuickField, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [allowDuplicate, setAllowDuplicate] = useState(false)

  const focusFirstInvalid = () =>
    window.requestAnimationFrame(() =>
      document.querySelector<HTMLElement>('#quick-client [aria-invalid="true"]')?.focus(),
    )

  const form = useForm({
    defaultValues: {
      kind: 'person',
      name: initialName,
      email: '',
      country: '',
      companyName: '',
      address: '',
    } as QuickValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Partial<Record<QuickField, string>> = clientFormErrors({ ...emptyClientForm(), ...value })

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      setFailure(null)
      setServerErrors({})

      try {
        const { address, ...client } = value
        const created = await create.mutateAsync({
          ...formToFields({ ...emptyClientForm(), ...client }),
          allowDuplicate,
        })

        onCreated(created, address.trim())
      } catch (caught) {
        const found = duplicateCandidates(caught)

        if (found) {
          setCandidates(found)

          return
        }

        const fields = serverFieldErrors(caught) as Partial<Record<QuickField, string>>

        if (Object.keys(fields).length > 0) {
          setServerErrors(fields)
          focusFirstInvalid()

          return
        }

        setFailure(caught instanceof ApiRequestError ? caught.message : 'The client could not be created. Try again.')
      }
    },
  })

  const kind = useStore(form.store, (state) => state.values.kind)
  const submitting = useStore(form.store, (state) => state.isSubmitting)

  const input = (field: 'name' | 'email' | 'companyName' | 'address', label: string, type = 'text', optional = false) => (
    <form.Field name={field}>
      {(api) => {
        const error = (api.state.meta.errors[0] as string | undefined) ?? serverErrors[field]
        const id = `quick-${field}`

        return (
          <div className={cn('flex min-w-0 flex-col gap-1.5', field === 'address' && 'inv-line-wide sm:col-span-2')}>
            <label htmlFor={id} className="text-[12.5px] font-semibold">
              {label}
              {optional ? <span className="font-normal text-[var(--dash-quiet)]"> for the invoice</span> : null}
            </label>
            {field === 'address' ? (
              <textarea
                id={id}
                className="dash-field min-h-[64px] w-full px-3 py-2 text-[13px] leading-relaxed"
                value={api.state.value}
                placeholder={'Street and number\nPostcode and city'}
                onChange={(event) => api.handleChange(event.target.value)}
              />
            ) : (
              <input
                id={id}
                type={type}
                autoComplete="off"
                className="dash-field h-10 w-full px-3 text-[13px]"
                value={api.state.value}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId(field) : undefined}
                onChange={(event) => {
                  setServerErrors((current) => ({ ...current, [field]: undefined }))
                  api.handleChange(event.target.value)
                }}
                onBlur={api.handleBlur}
              />
            )}
            {error ? (
              <span id={errorId(field)} className="flex items-center gap-1.5 text-[12px] text-[var(--dash-red-ink)]">
                <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                {error}
              </span>
            ) : null}
          </div>
        )
      }}
    </form.Field>
  )

  return (
    <div
      id="quick-client"
      className="flex flex-col gap-3 rounded-[10px] border border-dashed border-[var(--dash-line)] p-3.5"
      onKeyDown={(event) => {
        // Enter in a field here creates the client, not the invoice around it.
        if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT' && !(event.target as HTMLElement).getAttribute('role')) {
          event.preventDefault()
          void form.handleSubmit()
        }
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="text-[13px]">Add a client without leaving</b>
        <form.Field name="kind">
          {(api) => (
            <div className="inv-seg" role="group" aria-label="Client type">
              {(
                [
                  ['person', 'Person'],
                  ['company', 'Company'],
                ] as const
              ).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={api.state.value === value} onClick={() => api.handleChange(value)}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </form.Field>
      </div>

      {failure ? (
        <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
          {failure}
        </p>
      ) : null}

      {candidates ? (
        <div role="alert" className="flex flex-col gap-2 rounded-[10px] bg-[var(--dash-furniture)] px-3 py-2.5 text-[12.5px]">
          <p>
            <strong className="block text-[13px]">This may be someone you already have</strong>
            The same email or phone is on file. Nothing has been created yet.
          </p>
          {candidates.map((candidate) => (
            <div key={candidate.id} className="flex items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] bg-[var(--dash-surface)] px-3 py-2">
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-[13px]">{candidate.displayName}</strong>
                <span className="block truncate text-[12px] text-[var(--dash-quiet)]">
                  {candidate.email}
                  {candidate.inTrash ? ' · in Trash' : ''}
                </span>
              </span>
              {candidate.inTrash ? null : (
                <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12px]" onClick={() => onUseExisting(candidate)}>
                  Use this client
                </button>
              )}
            </div>
          ))}
          <span>
            <button
              type="button"
              className="dash-btn dash-btn-ghost h-8 text-[12px]"
              disabled={submitting}
              onClick={() => {
                setAllowDuplicate(true)
                setCandidates(null)
                window.setTimeout(() => void form.handleSubmit(), 0)
              }}
            >
              Create a separate client anyway
            </button>
          </span>
        </div>
      ) : null}

      <div className="inv-grid2">
        {kind === 'company' ? input('companyName', 'Company name') : null}
        {input('name', kind === 'company' ? 'Contact person' : 'Name')}
        {input('email', 'Email', 'email')}
        <form.Field name="country">
          {(api) => {
            const error = (api.state.meta.errors[0] as string | undefined) ?? serverErrors.country

            return (
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="quick-country" className="text-[12.5px] font-semibold">
                  Country
                </label>
                <CountryPicker
                  id="quick-country"
                  value={api.state.value}
                  onChange={(code) => api.handleChange(code)}
                  invalid={Boolean(error)}
                  describedBy={error ? errorId('country') : undefined}
                />
                {error ? (
                  <span id={errorId('country')} className="flex items-center gap-1.5 text-[12px] text-[var(--dash-red-ink)]">
                    <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                    {error}
                  </span>
                ) : null}
              </div>
            )
          }}
        </form.Field>
        {input('address', 'Address', 'text', true)}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="dash-btn dash-btn-quiet h-8 text-[12.5px]" disabled={submitting} onClick={() => void form.handleSubmit()}>
          {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
          {submitting ? 'Creating…' : 'Create client'}
        </button>
        <button type="button" className="dash-btn dash-btn-ghost h-8 text-[12.5px]" onClick={onCancel}>
          Cancel
        </button>
        <span className="text-[12px] text-[var(--dash-quiet)]">It opens in Clients like any other.</span>
      </div>
    </div>
  )
}
