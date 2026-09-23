import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { AlertTriangle, ArrowLeft, Info, Loader2 } from 'lucide-react'
import * as v from 'valibot'
import type { LeadCandidate, OwnerLead } from '#/backend2/contracts/lead.contract'
import { LEAD_LIMITS } from '#/backend2/contracts/lead.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead } from '#/frontend/dashboard/primitives'
import { CountryPicker, NichePicker } from '#/frontend/features/clients/pickers'
import { findLeadDuplicates } from '#/frontend/features/leads-v2/api'
import {
  type LeadFormField,
  type LeadFormValues,
  type LeadPrefill,
  emptyLeadForm,
  formToFields,
  initialsOf,
  leadCandidates,
  leadFormErrors,
  leadToForm,
  serverFieldErrors,
} from '#/frontend/features/leads-v2/lead-form'
import { useChoices, useCreateLead, useLead, usePatchLead } from '#/frontend/features/leads-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { LoadFailure } from './lead-parts'

/**
 * Creating and editing a Lead, on one form. Approved in the Leads Design Lab
 * (23 Sep 2026), in the same style as the Client form.
 *
 * Errors appear only after the first submit and then follow each change
 * (`AGENTS.md`); focus goes to the first problem. Another lead with the same
 * email or phone is a warning with the match, never a merge — the owner opens
 * it or saves anyway. An edit carries the revision it was loaded at, so a save
 * from a stale tab is refused instead of overwriting. The stage is not here:
 * it moves on the lead itself, the List or the Board, under one set of rules.
 */

const FORM_FIELDS = Object.keys(emptyLeadForm()) as LeadFormField[]

const errorId = (field: string) => `lead-${field}-error`

/** Where a lead lives in the directory: its own view, with its file open. */
const leadHome = (lead: Pick<OwnerLead, 'id' | 'stage'>) => {
  const kind = lead.stage.kind

  return { lead: lead.id, view: kind === 'won' || kind === 'lost' ? kind : undefined }
}

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

/** "the same phone", or "email and phone" when one lead matches on both. */
const matchedWords = (candidates: LeadCandidate[]): string => {
  const on = new Set(candidates.flatMap((candidate) => candidate.matchedOn))

  if (on.size === 1) return on.has('phone') ? 'phone' : 'email'

  return candidates.length === 1 ? 'email and phone' : 'email or phone'
}

function DuplicateWarning({
  candidates,
  busy,
  onSaveAnyway,
}: {
  candidates: LeadCandidate[]
  busy: boolean
  onSaveAnyway: () => void
}) {
  const many = candidates.length > 1

  return (
    <div
      role="alert"
      tabIndex={-1}
      id="lead-duplicate"
      className="flex gap-2.5 rounded-[10px] bg-[var(--dash-furniture)] px-3.5 py-3 text-[12.5px] leading-relaxed outline-none"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--dash-red-ink)]" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p>
          <strong className="block text-[13px]">This may be someone you already have</strong>
          {many ? `${candidates.length} leads with` : 'A lead with'} the same {matchedWords(candidates)}{' '}
          {many ? 'are' : 'is'} on file. Nothing has been saved yet.
        </p>
        {candidates.map((candidate) => (
          <div
            key={candidate.id}
            className="flex items-center gap-2.5 rounded-[9px] border border-[var(--dash-line)] bg-[var(--dash-surface)] px-3 py-2"
          >
            <span
              aria-hidden="true"
              className="dash-tone-grey grid size-8 shrink-0 place-items-center rounded-[9px] text-[11px] font-bold"
            >
              {initialsOf(candidate.name)}
            </span>
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[13px]">{candidate.name}</strong>
              <span className="block truncate text-[12px] text-[var(--dash-quiet)]">
                {candidate.stage} · Same {candidate.matchedOn.join(' and ')} ·{' '}
                {candidate.matchedOn.includes('email') ? candidate.email : candidate.phone}
                {candidate.inTrash ? ' · in Trash' : ''}
              </span>
            </span>
            {candidate.inTrash ? (
              <Link
                to="/dashboard/leads/trash"
                aria-label={`Open Trash, where ${candidate.name} is`}
                className="dash-btn dash-btn-quiet h-8 text-[12px]"
              >
                Open
              </Link>
            ) : (
              <Link
                to="/dashboard/leads"
                search={{ lead: candidate.id }}
                aria-label={`Open ${candidate.name}`}
                className="dash-btn dash-btn-quiet h-8 text-[12px]"
              >
                Open
              </Link>
            )}
          </div>
        ))}
        <span>
          <button
            type="button"
            className="dash-btn dash-btn-quiet h-8 text-[12px]"
            disabled={busy}
            onClick={onSaveAnyway}
          >
            Save as a separate lead
          </button>
        </span>
      </div>
    </div>
  )
}

/** The quiet line under email or phone when another lead already has it. */
const duplicateHint = (field: 'email' | 'phone', matches: LeadCandidate[]): string | undefined => {
  const first = matches[0]
  const what = field === 'email' ? 'email' : 'phone number'

  if (!first) return undefined

  return matches.length === 1
    ? `${first.name} (${first.inTrash ? 'in Trash' : first.stage}) already has this ${what}.`
    : `${first.name} and ${matches.length - 1} more already have this ${what}.`
}

/** A save that failed for a reason the form cannot point at a field for. */
const failureText = (caught: unknown): string => {
  if (caught instanceof ApiRequestError && caught.status === 401) {
    return 'Your session has ended. Sign in again in another tab, then save — your edits are still here.'
  }

  return caught instanceof ApiRequestError
    ? caught.message
    : 'The lead could not be saved. Nothing was lost — try again.'
}

function LeadForm({ lead, prefill = {} }: { lead: OwnerLead | null; prefill?: LeadPrefill }) {
  const navigate = useNavigate()
  const create = useCreateLead()
  const patch = usePatchLead()
  const reload = useLead(lead?.id)
  const sources = useChoices('sources', { hidden: 'exclude', pageSize: 100 })
  const revision = useRef(lead?.revision ?? 0)
  const allowDuplicate = useRef(false)
  const [candidates, setCandidates] = useState<LeadCandidate[] | null>(null)
  const [serverErrors, setServerErrors] = useState<Partial<Record<LeadFormField, string>>>({})
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)
  const [reloading, setReloading] = useState(false)
  const [hints, setHints] = useState<Partial<Record<'email' | 'phone', string>>>({})
  const [niche, setNiche] = useState<{ id: string; name: string } | null>(lead?.niche ?? null)
  const prefilled = !lead && Object.values(prefill).some(Boolean)

  const focusFirstInvalid = () =>
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>('#lead-form [aria-invalid="true"]')?.focus())

  const form = useForm({
    defaultValues: (lead ? leadToForm(lead) : emptyLeadForm(prefill)) satisfies LeadFormValues as LeadFormValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields = leadFormErrors(value)

        return Object.keys(fields).length === 0 ? undefined : { fields }
      },
    },
    onSubmitInvalid: focusFirstInvalid,
    onSubmit: async ({ value }) => {
      setFailure(null)
      setServerErrors({})

      try {
        const fields = formToFields(value)
        const saved = lead
          ? await patch.mutateAsync({
              id: lead.id,
              revision: revision.current,
              allowDuplicate: allowDuplicate.current,
              ...fields,
            })
          : await create.mutateAsync({ ...fields, allowDuplicate: allowDuplicate.current })

        notify.success(lead ? 'Changes saved' : `Lead created in ${saved.stage.name}`)
        void navigate({ to: '/dashboard/leads', search: leadHome(saved) })
      } catch (caught) {
        const found = leadCandidates(caught)

        if (found) {
          setCandidates(found)
          window.requestAnimationFrame(() => document.getElementById('lead-duplicate')?.focus())

          return
        }

        // Only refusals the form has a field for; anything else would vanish without a word.
        const fields = Object.fromEntries(
          Object.entries(serverFieldErrors(caught)).filter(([field]) => FORM_FIELDS.includes(field as LeadFormField)),
        ) as Partial<Record<LeadFormField, string>>

        if (Object.keys(fields).length > 0) {
          setServerErrors(fields)
          focusFirstInvalid()

          return
        }

        const stale = caught instanceof ApiRequestError && caught.code === 'CONFLICT'

        setFailure({
          stale,
          message: stale
            ? 'This lead was changed in another tab. Your edits are still here. Load the newer version to continue — it replaces what you typed.'
            : failureText(caught),
        })
      }
    },
  })

  const submitting = useStore(form.store, (state) => state.isSubmitting)

  const errorFor = (field: LeadFormField, errors: unknown[]) => (errors[0] as string | undefined) ?? serverErrors[field]

  const clearServerError = (field: LeadFormField) => setServerErrors((current) => ({ ...current, [field]: undefined }))

  /**
   * A warning while typing, before the save refuses. Own lead excluded when
   * editing. An answer for a value the owner has since changed is dropped.
   */
  const checkDuplicate = async (field: 'email' | 'phone') => {
    const value = form.getFieldValue(field).trim()
    const usable = field === 'email' ? value.includes('@') : value.replace(/\D/gu, '').length >= 6

    if (!usable) return setHints((current) => ({ ...current, [field]: undefined }))

    try {
      const { candidates: found } = await findLeadDuplicates({
        ...(field === 'email' ? { email: value } : { phone: value }),
        excludeId: lead?.id,
      })

      if (form.getFieldValue(field).trim() !== value) return

      const matches = found.filter((candidate) => candidate.matchedOn.includes(field))

      setHints((current) => ({ ...current, [field]: duplicateHint(field, matches) }))
    } catch {
      setHints((current) => ({ ...current, [field]: undefined }))
    }
  }

  // Prefilled details were never typed, so they never blur: check them once on arrival.
  useEffect(() => {
    if (!prefilled) return

    void checkDuplicate('email')
    void checkDuplicate('phone')
  }, [])

  const input = (
    field: 'name' | 'email' | 'phone' | 'company',
    label: string,
    options: {
      optional?: boolean
      type?: string
      placeholder?: string
      onBlur?: () => void
      onEdit?: () => void
      hint?: string
    } = {},
  ) => (
    <form.Field name={field}>
      {(api) => {
        const error = errorFor(field, api.state.meta.errors)
        const id = `lead-${field}`
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
              // Someone else's details: the browser's own autofill would be wrong here.
              autoComplete="off"
              placeholder={options.placeholder}
              value={api.state.value}
              aria-invalid={error ? true : undefined}
              aria-describedby={cn(error && errorId(field), options.hint && hintId) || undefined}
              onChange={(event) => {
                clearServerError(field)
                options.onEdit?.()
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

  // Unknown first, then the owner's order. A lead keeps a source that was hidden later.
  const listed = [...(sources.data?.items ?? [])].sort((a, b) => Number(b.locked) - Number(a.locked))
  const kept = lead && !listed.some((source) => source.id === lead.source.id) ? lead.source : null

  return (
    <form
      id="lead-form"
      noValidate
      className="dash-panel flex flex-col gap-5 p-5 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault()
        if (form.state.isSubmitting) return
        allowDuplicate.current = false
        setCandidates(null)
        void form.handleSubmit()
      }}
    >
      {prefilled ? (
        <p role="note" className="dash-tone-blue flex items-start gap-2 rounded-[10px] px-3.5 py-2.5 text-[12.5px]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          These details were filled in for you — check them before saving.
        </p>
      ) : null}

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
              disabled={reloading}
              onClick={async () => {
                setReloading(true)
                const fresh = await reload.refetch()
                setReloading(false)

                // A failed read keeps the old copy in the cache; resetting to it would conflict again.
                if (!fresh.isSuccess) {
                  setFailure({
                    stale: true,
                    message: 'The newer version could not be loaded. Your edits are still here — try again.',
                  })

                  return
                }

                revision.current = fresh.data.revision
                form.reset(leadToForm(fresh.data))
                setNiche(fresh.data.niche)
                setHints({})
                setCandidates(null)
                setServerErrors({})
                setFailure(null)
              }}
            >
              {reloading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
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
            if (form.state.isSubmitting) return
            allowDuplicate.current = true
            void form.handleSubmit()
          }}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-x-4 gap-y-3.5 md:grid-cols-2">
        {input('name', 'Name')}
        {input('email', 'Email', {
          type: 'email',
          onBlur: () => void checkDuplicate('email'),
          onEdit: () => setHints((current) => ({ ...current, email: undefined })),
          hint: hints.email,
        })}
        {input('phone', 'Phone', {
          type: 'tel',
          placeholder: '+49 170 1234567',
          onBlur: () => void checkDuplicate('phone'),
          onEdit: () => setHints((current) => ({ ...current, phone: undefined })),
          hint: hints.phone,
        })}

        <form.Field name="country">
          {(api) => {
            const error = errorFor('country', api.state.meta.errors)

            return (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="lead-country">Country</Label>
                <CountryPicker
                  id="lead-country"
                  value={api.state.value}
                  onChange={(code) => {
                    clearServerError('country')
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

        <form.Field name="sourceId">
          {(api) => {
            const error = errorFor('sourceId', api.state.meta.errors)

            return (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="lead-sourceId">Source</Label>
                <select
                  id="lead-sourceId"
                  className="dash-field h-10 w-full px-2.5 text-[13px]"
                  value={api.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={
                    cn(
                      error && errorId('sourceId'),
                      sources.isError && 'lead-sourceId-failure',
                      'lead-sourceId-hint',
                    ) || undefined
                  }
                  onChange={(event) => {
                    clearServerError('sourceId')
                    api.handleChange(event.target.value)
                  }}
                  onBlur={api.handleBlur}
                >
                  <option value="">{sources.isPending ? 'Loading sources…' : 'Choose…'}</option>
                  {listed.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                  {kept ? (
                    <option value={kept.id}>
                      {kept.name}
                      {sources.data ? ' (hidden)' : ''}
                    </option>
                  ) : null}
                </select>
                <FieldError field="sourceId" message={error} />
                {sources.isError ? (
                  <span
                    id="lead-sourceId-failure"
                    role="alert"
                    className="flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--dash-red-ink)]"
                  >
                    Your sources could not be loaded.
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-2"
                      onClick={() => void sources.refetch()}
                    >
                      Try again
                    </button>
                  </span>
                ) : null}
                <span id="lead-sourceId-hint" className="text-[11.5px] text-[var(--dash-quiet)]">
                  Not sure? Choose Unknown.
                </span>
              </div>
            )
          }}
        </form.Field>

        {input('company', 'Company', { optional: true })}

        <form.Field name="nicheId">
          {(api) => {
            const error = errorFor('nicheId', api.state.meta.errors)

            return (
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="lead-niche" optional>
                  Niche
                </Label>
                <NichePicker
                  id="lead-niche"
                  value={niche}
                  onChange={(next) => {
                    setNiche(next)
                    clearServerError('nicheId')
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

      <form.Field name="notes">
        {(api) => {
          const error = errorFor('notes', api.state.meta.errors)

          return (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="lead-notes" optional>
                Private notes
              </Label>
              <textarea
                id="lead-notes"
                className="dash-field min-h-32 w-full resize-y px-3 py-2.5 text-[13px] leading-relaxed"
                placeholder="Only you can see these."
                maxLength={LEAD_LIMITS.notes}
                value={api.state.value}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId('notes') : undefined}
                onChange={(event) => {
                  clearServerError('notes')
                  api.handleChange(event.target.value)
                }}
                onBlur={api.handleBlur}
              />
              <FieldError field="notes" message={error} />
            </div>
          )
        }}
      </form.Field>

      <div className="flex flex-wrap items-center gap-2.5 border-t border-[var(--dash-line)] pt-4">
        <span className="text-[12px] text-[var(--dash-quiet)]">
          {lead ? 'The stage changes on the lead itself, not here.' : 'Every new lead starts in New.'}
        </span>
        <span className="flex-1" />
        <Link to="/dashboard/leads" search={lead ? leadHome(lead) : {}} className="dash-btn dash-btn-ghost">
          Cancel
        </Link>
        <button type="submit" className="dash-btn dash-btn-primary" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {lead ? (submitting ? 'Saving…' : 'Save changes') : submitting ? 'Creating…' : 'Create lead'}
        </button>
      </div>
    </form>
  )
}

export function NewLeadPage({ prefill }: { prefill: LeadPrefill }) {
  return (
    <DashboardPage className="mx-auto max-w-[56rem] gap-5">
      <Link to="/dashboard/leads" className="dash-btn dash-btn-ghost -ms-2 h-8 self-start px-2 text-[12.5px]">
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        All leads
      </Link>
      <PageHead
        eyebrow="PIPELINE"
        title="New lead"
        description="Name, email, phone, country and source are required. Company, niche and notes are optional."
      />
      {/* A second "Create lead" link while this page is open starts a fresh form. */}
      <LeadForm key={JSON.stringify(prefill)} lead={null} prefill={prefill} />
    </DashboardPage>
  )
}

/**
 * The server's own rule for a lead id (`IdSchema` in the owner route). An
 * address that breaks it — a mistyped or cut-off link — names no lead at all,
 * so it is not sent: asking would only earn a validation refusal that a retry
 * can never fix.
 */
const LeadIdSchema = v.pipe(v.string(), v.uuid())

export function EditLeadPage({ leadId }: { leadId: string }) {
  const validId = v.is(LeadIdSchema, leadId)
  const query = useLead(validId ? leadId : undefined)
  const error = query.error instanceof ApiRequestError ? query.error : null
  const status = error?.status ?? null
  /**
   * A wrong link is the approved not-found state, not "the server did not
   * answer": a malformed id is caught here, and a validation refusal of the
   * id (the only input this read takes) is read the same way as a 404.
   */
  const notFound = !validId || status === 404 || (status === 422 && error?.code === 'VALIDATION_ERROR')

  return (
    <DashboardPage className="mx-auto max-w-[56rem] gap-5">
      <Link
        to="/dashboard/leads"
        search={query.data ? leadHome(query.data) : { lead: leadId }}
        className="dash-btn dash-btn-ghost -ms-2 h-8 self-start px-2 text-[12.5px]"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to the lead
      </Link>
      <PageHead eyebrow="PIPELINE" title={query.data ? `Edit ${query.data.name}` : 'Edit lead'} />
      {/* Checked before "loading": a malformed id never starts a request, so it would otherwise stay pending. */}
      {notFound ? (
        <section className="dash-panel flex flex-col items-start gap-3 p-8">
          <h2 className="text-sm font-semibold">This lead does not exist</h2>
          <p className="text-[13px] text-[var(--dash-quiet)]">
            It may have been deleted permanently, or the link is wrong.
          </p>
          <Link to="/dashboard/leads" className="dash-btn dash-btn-quiet">
            All leads
          </Link>
        </section>
      ) : query.isPending ? (
        <section className="dash-panel flex flex-col gap-3 p-6" aria-busy="true" aria-label="Loading lead">
          <span className="dash-skeleton h-16 w-full rounded" />
          <span className="dash-skeleton h-40 w-full rounded" />
        </section>
      ) : query.isError ? (
        <section className="dash-panel">
          {status === 401 ? (
            <div role="alert" className="flex flex-col items-start gap-3 p-8">
              <h2 className="text-sm font-semibold">Your session has ended</h2>
              <p className="text-[13px] text-[var(--dash-quiet)]">Sign in again to edit this lead.</p>
              <a href="/dashboard/login" className="dash-btn dash-btn-primary">
                Go to sign in
              </a>
            </div>
          ) : (
            <LoadFailure
              title="This lead could not be loaded"
              message={
                status === 403 && query.error.message
                  ? query.error.message
                  : 'The server did not answer. Nothing has been changed.'
              }
              onRetry={() => void query.refetch()}
            />
          )}
        </section>
      ) : query.data.trashedAt ? (
        <section className="dash-panel flex flex-col items-start gap-3 p-8">
          <h2 className="text-sm font-semibold">This lead is in Trash</h2>
          <p className="text-[13px] text-[var(--dash-quiet)]">Restore it first, then edit it.</p>
          <Link to="/dashboard/leads/trash" className="dash-btn dash-btn-quiet">
            Open Trash
          </Link>
        </section>
      ) : (
        <LeadForm key={query.data.id} lead={query.data} />
      )}
    </DashboardPage>
  )
}
