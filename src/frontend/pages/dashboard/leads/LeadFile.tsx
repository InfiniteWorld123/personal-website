import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { ArrowLeft, Check, Clock, Copy, Handshake, Info, Loader2, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { LEAD_LIMITS, type FollowUp, type OwnerLead } from '#/backend2/contracts/lead.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { StatusChip } from '#/frontend/dashboard/primitives'
import { ConfirmDialog } from '#/frontend/features/blog-v2/BlogDialog'
import {
  berlinToday,
  formatDay,
  formatFollowUp,
  initialsOf,
  serverFieldErrors,
} from '#/frontend/features/leads-v2/lead-form'
import {
  useCancelFollowUp,
  useCompleteFollowUp,
  useCreateFollowUp,
  useLead,
  usePatchFollowUp,
  usePatchLead,
  useRestoreLead,
  useStages,
  useTrashLead,
} from '#/frontend/features/leads-v2/queries'
import { useStageMove } from '#/frontend/features/leads-v2/useStageMove'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { FollowUpPill, LoadFailure, StageChip, useFollowUpDue } from './lead-parts'

/**
 * One Lead's file: its stage, its one follow-up, contact details and private
 * notes. Approved in the Leads Design Lab (23 Sep 2026) as a panel beside the
 * list on a computer and a full screen on a phone, like a Client's file.
 *
 * The stage buttons are the keyboard- and touch-friendly way to move a Lead;
 * they go through `useStageMove`, the same path as the List and the Board, so
 * Lost still asks for its reason and Won still asks about the Client.
 */

function CopyButton({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      className="grid size-7 place-items-center rounded-md text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]"
      aria-label={label}
      onClick={() => {
        navigator.clipboard
          ?.writeText(value)
          .then(() => notify.success('Copied'))
          .catch(() => notify.error('Copying is not allowed here. Select the text instead.'))
      }}
    >
      <Copy className="size-3.5" aria-hidden="true" />
    </button>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--dash-quiet)]">{label}</dt>
      <dd className="mb-2 flex min-w-0 items-center gap-1.5 [overflow-wrap:anywhere] sm:mb-0">{children}</dd>
    </>
  )
}

/* --------------------------------------------------------------- stage */

/**
 * Every stage as a button, the current one pressed. Pressing the current one
 * does nothing; Lost and Won open their dialogs before anything is saved.
 *
 * While a move saves, the buttons are `aria-disabled` rather than `disabled`:
 * a disabled button drops the focus it holds to the page, so a keyboard user
 * would lose their place after every move. The click handler refuses instead.
 */
function StagePicker({ lead }: { lead: OwnerLead }) {
  const stages = useStages()
  const move = useStageMove()
  const [target, setTarget] = useState<string | null>(null)
  const saving = move.savingId === lead.id

  return (
    <div className="flex flex-col gap-1.5">
      <h3 id="lead-stage-label" className="dash-eyebrow-quiet">
        STAGE
      </h3>
      {stages.isPending ? (
        <div className="flex flex-wrap gap-1.5" aria-busy="true" aria-label="Loading stages">
          {[64, 84, 56, 52].map((width) => (
            <span key={width} className="dash-skeleton h-8 rounded-lg" style={{ width }} />
          ))}
        </div>
      ) : stages.isError && !stages.data ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--dash-quiet)]">
          The stages could not be loaded. The lead stays in {lead.stage.name}.
          <button
            type="button"
            className="dash-btn dash-btn-quiet h-8 text-[12px]"
            onClick={() => void stages.refetch()}
          >
            Try again
          </button>
        </p>
      ) : (
        <div role="group" aria-labelledby="lead-stage-label" className="flex flex-wrap gap-1.5">
          {stages.data.map((stage) => {
            const current = stage.id === lead.stage.id

            return (
              <button
                key={stage.id}
                type="button"
                aria-pressed={current}
                aria-disabled={saving ? true : undefined}
                onClick={() => {
                  if (saving) return

                  setTarget(stage.id)
                  void move.request(lead, stage).finally(() => setTarget(null))
                }}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-60',
                  current
                    ? 'border-[var(--dash-slab)] bg-[var(--dash-slab)] font-semibold text-[var(--dash-slab-ink)]'
                    : 'border-[var(--dash-line)] bg-[var(--dash-input)] hover:bg-[var(--dash-hover)]',
                )}
              >
                {saving && target === stage.id ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : null}
                {stage.name}
              </button>
            )
          })}
        </div>
      )}
      {move.dialog}
    </div>
  )
}

/* ----------------------------------------------------------- follow-up */

const DATE = /^\d{4}-\d{2}-\d{2}$/u
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/u

/** The day after a YYYY-MM-DD, for a new follow-up's first suggestion. */
const dayAfter = (date: string): string => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]

  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

const CLOSED_HOW: Record<NonNullable<FollowUp['closedHow']>, string> = {
  completed: 'Done',
  cancelled: 'Cancelled',
  lost: 'Cancelled — lead lost',
  won: 'Closed — no longer needed (won)',
}

type FollowUpValues = { date: string; time: string; note: string }

/**
 * Set a follow-up, or postpone the open one — the same three fields. Entered
 * as a Berlin date and time; the server works out the instant.
 */
function FollowUpForm({
  lead,
  followUp,
  onClose,
  onConflict,
}: {
  lead: OwnerLead
  /** The open follow-up when postponing; `null` when setting a new one. */
  followUp: FollowUp | null
  onClose: () => void
  /** A refusal that means the follow-up changed elsewhere. True when handled. */
  onConflict: (error: unknown) => boolean
}) {
  const create = useCreateFollowUp()
  const patch = usePatchFollowUp()
  const [failure, setFailure] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Partial<Record<keyof FollowUpValues, string>>>({})
  const today = berlinToday()
  const formId = `follow-up-form-${lead.id}`
  const dateRef = useRef<HTMLInputElement>(null)

  // Opened by a button, so the first field takes the focus the button had.
  useEffect(() => {
    dateRef.current?.focus()
  }, [])

  const form = useForm({
    defaultValues: (followUp
      ? { date: followUp.date, time: followUp.time, note: followUp.note }
      : { date: dayAfter(today), time: '10:00', note: '' }) as FollowUpValues,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Partial<Record<keyof FollowUpValues, string>> = {}

        if (!DATE.test(value.date)) fields.date = 'Choose a date'
        else if (value.date < berlinToday()) fields.date = 'Choose today or a later day'
        if (!TIME.test(value.time)) fields.time = 'Choose a time'
        if (value.note.trim().length > LEAD_LIMITS.followUpNote) {
          fields.note = `Keep the note under ${LEAD_LIMITS.followUpNote} characters`
        }

        return Object.keys(fields).length > 0 ? { fields } : undefined
      },
    },
    onSubmitInvalid: () =>
      window.requestAnimationFrame(() =>
        document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setFailure(null)
      setServerErrors({})

      const input = { id: lead.id, date: value.date, time: value.time, note: value.note.trim() }
      const when = formatFollowUp(value)

      try {
        if (followUp) {
          await patch.mutateAsync(input)
          notify.success(`Follow-up moved to ${when}`)
        } else {
          await create.mutateAsync(input)
          notify.success(`Follow-up set for ${when}`)
        }
        onClose()
      } catch (caught) {
        if (onConflict(caught)) return

        const fields = serverFieldErrors(caught)
        const mapped: Partial<Record<keyof FollowUpValues, string>> = {}

        if (fields.date) mapped.date = fields.date
        if (fields.time) mapped.time = fields.time
        if (fields.note) mapped.note = fields.note
        setServerErrors(mapped)
        setFailure(
          Object.keys(mapped).length > 0
            ? null
            : caught instanceof ApiRequestError
              ? caught.message
              : 'The follow-up could not be saved. Nothing was changed — try again.',
        )
      }
    },
  })

  const fieldError = (name: keyof FollowUpValues, errors: unknown[]) =>
    (errors[0] as string | undefined) ?? serverErrors[name]

  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3 rounded-[10px] border border-[var(--dash-line)] p-3.5"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <form.Field name="date">
          {(field) => {
            const error = fieldError('date', field.state.meta.errors)
            const id = `fu-date-${lead.id}`

            return (
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={id} className="text-[12.5px] font-semibold">
                  Date
                </label>
                <input
                  ref={dateRef}
                  id={id}
                  type="date"
                  min={today}
                  className="dash-field h-10 w-full min-w-0 px-3 text-[13px]"
                  value={field.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) => {
                    setServerErrors((current) => ({ ...current, date: undefined }))
                    field.handleChange(event.target.value)
                  }}
                  onBlur={field.handleBlur}
                />
                {error ? (
                  <span id={`${id}-error`} className="text-[12px] text-[var(--dash-red-ink)]">
                    {error}
                  </span>
                ) : null}
              </div>
            )
          }}
        </form.Field>

        <form.Field name="time">
          {(field) => {
            const error = fieldError('time', field.state.meta.errors)
            const id = `fu-time-${lead.id}`

            return (
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor={id} className="text-[12.5px] font-semibold">
                  Time (Berlin)
                </label>
                <input
                  id={id}
                  type="time"
                  className="dash-field h-10 w-full min-w-0 px-3 text-[13px]"
                  value={field.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onChange={(event) => {
                    setServerErrors((current) => ({ ...current, time: undefined }))
                    field.handleChange(event.target.value)
                  }}
                  onBlur={field.handleBlur}
                />
                {error ? (
                  <span id={`${id}-error`} className="text-[12px] text-[var(--dash-red-ink)]">
                    {error}
                  </span>
                ) : null}
              </div>
            )
          }}
        </form.Field>
      </div>

      <form.Field name="note">
        {(field) => {
          const error = fieldError('note', field.state.meta.errors)
          const id = `fu-note-${lead.id}`

          return (
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor={id} className="text-[12.5px] font-semibold">
                Note <span className="font-normal text-[var(--dash-quiet)]">(optional)</span>
              </label>
              <input
                id={id}
                className="dash-field h-10 w-full min-w-0 px-3 text-[13px]"
                maxLength={LEAD_LIMITS.followUpNote}
                placeholder="Call them, send proposal…"
                value={field.state.value}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                onChange={(event) => {
                  setServerErrors((current) => ({ ...current, note: undefined }))
                  field.handleChange(event.target.value)
                }}
                onBlur={field.handleBlur}
              />
              {error ? (
                <span id={`${id}-error`} className="text-[12px] text-[var(--dash-red-ink)]">
                  {error}
                </span>
              ) : null}
            </div>
          )
        }}
      </form.Field>

      {failure ? (
        <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
          {failure}
        </p>
      ) : null}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(submitting) => (
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="dash-btn dash-btn-ghost h-8 text-[12.5px]"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="dash-btn dash-btn-primary h-8 text-[12.5px]" disabled={submitting}>
              {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              {submitting ? 'Saving…' : followUp ? 'Postpone' : 'Set follow-up'}
            </button>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}

/**
 * One open follow-up at a time, and a short record of the closed ones. A
 * follow-up changed in another tab is not an error to shout about: the server's
 * word is shown here and the lead is read again, so the owner sees what is true.
 */
function FollowUpSection({ lead }: { lead: OwnerLead }) {
  const reload = useLead(lead.id)
  const complete = useCompleteFollowUp()
  const cancel = useCancelFollowUp()
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const inTrash = lead.trashedAt !== null
  const open = lead.followUp?.status === 'open' ? lead.followUp : null
  // Turns to Due at its minute, without waiting for the server.
  const openDue = useFollowUpDue(open)
  const busy = complete.isPending || cancel.isPending

  const closeForm = () => {
    setEditing(false)
    // The form and the button that opened it are gone; keep the place.
    window.requestAnimationFrame(() => heading.current?.focus())
  }

  const onConflict = (error: unknown): boolean => {
    if (!(error instanceof ApiRequestError)) return false
    if (error.code !== 'FOLLOW_UP_EXISTS' && error.code !== 'LEAD_IN_TRASH' && error.status !== 404) return false

    setNotice(
      error.code === 'FOLLOW_UP_EXISTS'
        ? 'This lead already has a follow-up, set somewhere else. It is shown here now — complete, postpone or cancel it first.'
        : error.message,
    )
    setEditing(false)
    window.requestAnimationFrame(() => heading.current?.focus())
    void reload.refetch()

    return true
  }

  const close = (how: 'done' | 'cancel') => {
    if (busy) return

    setNotice(null)
    ;(how === 'done' ? complete : cancel).mutate(lead.id, {
      onSuccess: () => {
        notify.success(how === 'done' ? 'Follow-up done' : 'Follow-up cancelled')
        // The closed follow-up takes its buttons with it; keep the place, as closeForm does.
        window.requestAnimationFrame(() => heading.current?.focus())
      },
      onError: (error) => void onConflict(error),
    })
  }

  return (
    <div className="flex flex-col gap-2.5 border-b border-[var(--dash-soft)] px-5 py-4 sm:px-6">
      <h3 ref={heading} tabIndex={-1} className="dash-eyebrow-quiet outline-none">
        FOLLOW-UP
      </h3>

      {notice ? (
        <p role="alert" className="dash-tone-red rounded-lg px-3 py-2 text-[12.5px]">
          {notice}
        </p>
      ) : null}

      {editing && !inTrash ? (
        <FollowUpForm key={open?.id ?? 'new'} lead={lead} followUp={open} onClose={closeForm} onConflict={onConflict} />
      ) : open ? (
        <div
          className={cn(
            'flex flex-col gap-2 rounded-[10px] border px-3.5 py-3',
            openDue ? 'border-[var(--dash-red)]' : 'border-[var(--dash-line)]',
          )}
        >
          <p className="flex flex-wrap items-center gap-2 text-[14px] font-semibold">
            {openDue ? (
              <StatusChip tone="red">
                <Clock className="size-3.5" aria-hidden="true" />
                Due
              </StatusChip>
            ) : null}
            <span className="dash-num">{formatFollowUp(open)}</span>
            <span className="text-[11.5px] font-normal text-[var(--dash-quiet)]">Berlin time</span>
          </p>
          {open.note ? <p className="text-[13px] [overflow-wrap:anywhere]">{open.note}</p> : null}
          {inTrash ? null : (
            <div className="flex flex-wrap gap-1.5">
              {/* `aria-disabled` while one of them saves: a disabled button would drop the focus it holds. */}
              <button
                type="button"
                className="dash-btn dash-btn-quiet h-8 text-[12.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                aria-disabled={busy ? true : undefined}
                onClick={() => close('done')}
              >
                {complete.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="size-3.5" aria-hidden="true" />
                )}
                Done
              </button>
              <button
                type="button"
                className="dash-btn dash-btn-quiet h-8 text-[12.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                aria-disabled={busy ? true : undefined}
                onClick={() => {
                  if (busy) return

                  setNotice(null)
                  setEditing(true)
                }}
              >
                Postpone
              </button>
              <button
                type="button"
                className="dash-btn dash-btn-ghost h-8 text-[12.5px] aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                aria-disabled={busy ? true : undefined}
                onClick={() => close('cancel')}
              >
                {cancel.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                Cancel it
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2.5">
          <span className="text-[12.5px] text-[var(--dash-quiet)]">
            {inTrash ? 'No follow-up.' : 'No follow-up. One at a time — set the next one when it matters.'}
          </span>
          {inTrash ? null : (
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
              onClick={() => {
                setNotice(null)
                setEditing(true)
              }}
            >
              <Clock className="size-3.5" aria-hidden="true" />
              Set follow-up
            </button>
          )}
        </div>
      )}

      {lead.followUpHistory.length > 0 ? (
        <ul aria-label="Earlier follow-ups" className="flex flex-col gap-1 text-[12px] text-[var(--dash-quiet)]">
          {lead.followUpHistory.map((item) => (
            <li key={item.id} className="[overflow-wrap:anywhere]">
              {item.closedHow ? CLOSED_HOW[item.closedHow] : 'Closed'}
              {item.note ? ` · “${item.note}”` : ''}
              {item.closedAt ? ` · ${formatDay(item.closedAt)}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------- notes */

/**
 * The private notes, saved with a button, never silently.
 *
 * The form keeps the version its text started from — the notes and revision
 * last loaded or saved here — and a save sends that revision, not the newest
 * one in the cache. The cache is re-read often (on window focus, after every
 * Leads write), so sending its revision would let an edit begun on older notes
 * overwrite notes changed in another tab without the server ever refusing it.
 * "Unsaved changes" is measured against that version too, so a re-read alone
 * never claims the owner typed something.
 */
function NotesForm({ lead }: { lead: OwnerLead }) {
  const patch = usePatchLead()
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)
  const [reloading, setReloading] = useState(false)
  const reload = useLead(lead.id)
  const inTrash = lead.trashedAt !== null
  const fieldId = `lead-notes-${lead.id}`
  const [base, setBase] = useState({ notes: lead.notes, revision: lead.revision })
  // Fixed for the form's life, and every reset keeps it: `useForm` copies changed
  // defaults into an untouched field on each render, which would undo a reset.
  const [initial] = useState(() => ({ notes: lead.notes }))

  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) =>
        value.notes.length > LEAD_LIMITS.notes
          ? { fields: { notes: `Keep the notes under ${LEAD_LIMITS.notes.toLocaleString('en')} characters` } }
          : undefined,
    },
    onSubmitInvalid: () => document.getElementById(fieldId)?.focus(),
    onSubmit: async ({ value, formApi }) => {
      setFailure(null)

      try {
        const saved = await patch.mutateAsync({ id: lead.id, revision: base.revision, notes: value.notes })
        const typed = formApi.state.values.notes

        setBase({ notes: saved.notes, revision: saved.revision })
        formApi.reset({ notes: saved.notes }, { keepDefaultValues: true })
        // The field stays editable while saving; what was typed meanwhile stays, still unsaved.
        if (typed !== value.notes) formApi.setFieldValue('notes', typed)
      } catch (caught) {
        const stale = caught instanceof ApiRequestError && caught.code === 'CONFLICT'
        setFailure({
          stale,
          message: stale
            ? 'These notes were changed somewhere else. Copy what you wrote, then load the newer version.'
            : caught instanceof ApiRequestError
              ? caught.message
              : 'The notes could not be saved. Nothing was lost — try again.',
        })
      }
    },
  })

  const notes = useStore(form.store, (state) => state.values.notes)
  const submitting = useStore(form.store, (state) => state.isSubmitting)
  const dirty = notes !== base.notes

  // A newer version from the server replaces the notes only when nothing is being typed.
  useEffect(() => {
    // A save in flight moves the base itself when it returns.
    if (submitting || lead.revision <= base.revision) return
    // Typing over notes changed elsewhere keeps the older base, so its save is refused as stale.
    if (dirty && lead.notes !== base.notes) return

    // Nothing typed, or only another part of the file changed: the newer version is the base.
    setBase({ notes: lead.notes, revision: lead.revision })
    if (!dirty) form.reset({ notes: lead.notes }, { keepDefaultValues: true })
  }, [lead.notes, lead.revision, submitting, dirty])

  const loadNewer = async () => {
    if (reloading) return

    setReloading(true)
    const fresh = await reload.refetch()
    setReloading(false)

    // A failed read keeps the old copy in the cache; resetting to it would only conflict again.
    if (!fresh.isSuccess) {
      setFailure({
        stale: true,
        message: 'The newer version could not be loaded. What you wrote is still here — try again.',
      })

      return
    }

    setBase({ notes: fresh.data.notes, revision: fresh.data.revision })
    form.reset({ notes: fresh.data.notes }, { keepDefaultValues: true })
    setFailure(null)
    // The alert and its button are gone; the notes take the focus.
    window.requestAnimationFrame(() => document.getElementById(fieldId)?.focus())
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
      className="flex flex-col gap-2.5"
    >
      <form.Field name="notes">
        {(field) => {
          const error = field.state.meta.errors[0] as string | undefined

          return (
            <>
              <label htmlFor={fieldId} className="dash-eyebrow-quiet">
                PRIVATE NOTES
              </label>
              <textarea
                id={fieldId}
                className="dash-field min-h-36 w-full resize-y px-3 py-2.5 text-[13px] leading-relaxed"
                placeholder="Only you can see these."
                value={field.state.value}
                readOnly={inTrash}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${fieldId}-error` : undefined}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              {error ? (
                <span id={`${fieldId}-error`} className="text-[12px] text-[var(--dash-red-ink)]">
                  {error}
                </span>
              ) : null}
            </>
          )
        }}
      </form.Field>

      {failure ? (
        <div role="alert" className="dash-tone-red flex flex-col items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]">
          {failure.message}
          {failure.stale ? (
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8 text-[12px] aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
              aria-disabled={reloading ? true : undefined}
              onClick={() => void loadNewer()}
            >
              {reloading ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
              Load the newer version
            </button>
          ) : null}
        </div>
      ) : null}

      {inTrash ? null : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-[var(--dash-quiet)]">
          <span className="inline-flex items-center gap-1.5" role="status">
            <span
              aria-hidden="true"
              className="size-[7px] rounded-full"
              style={{ background: dirty ? 'var(--dash-quiet)' : 'var(--dash-live)' }}
            />
            {dirty ? 'Unsaved changes' : 'Saved'}
          </span>
          <button type="submit" className="dash-btn dash-btn-quiet h-8 text-[12.5px]" disabled={!dirty || submitting}>
            {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
            {submitting ? 'Saving…' : 'Save notes'}
          </button>
        </div>
      )}
    </form>
  )
}

/* ---------------------------------------------------------------- file */

export function LeadFile({
  leadId,
  mode,
  onClose,
}: {
  leadId: string
  /** `panel` beside the list, with a close button; `page` alone, with a way back. */
  mode: 'panel' | 'page'
  onClose: () => void
}) {
  const query = useLead(leadId)
  const restore = useRestoreLead()
  const trash = useTrashLead()
  const [trashing, setTrashing] = useState(false)

  if (query.isPending) {
    return (
      <section className="dash-panel flex flex-col gap-3 p-6" aria-busy="true" aria-label="Loading lead">
        <span className="dash-skeleton h-11 w-11 rounded-[12px]" />
        <span className="dash-skeleton h-6 w-56 max-w-full rounded" />
        <span className="dash-skeleton h-3 w-40 rounded" />
        <span className="dash-skeleton mt-2 h-8 w-72 max-w-full rounded" />
        <span className="dash-skeleton mt-4 h-24 w-full rounded" />
      </section>
    )
  }

  if (query.isError) {
    const missing = query.error instanceof ApiRequestError && query.error.status === 404

    return (
      <section className="dash-panel">
        {missing ? (
          <div className="flex flex-col items-start gap-3 p-8">
            <h2 className="text-sm font-semibold">This lead does not exist</h2>
            <p className="max-w-[52ch] text-[13px] text-[var(--dash-quiet)]">
              It may have been deleted permanently, or the link is wrong. Leads that were only moved to Trash are still
              there.
            </p>
            <span className="flex flex-wrap gap-2">
              <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                All leads
              </button>
              <Link to="/dashboard/leads/trash" className="dash-btn dash-btn-ghost">
                Open Trash
              </Link>
            </span>
          </div>
        ) : (
          <LoadFailure
            title="This lead could not be loaded"
            message="The server did not answer. Nothing has been changed."
            onRetry={() => void query.refetch()}
          />
        )}
      </section>
    )
  }

  const lead = query.data
  const inTrash = lead.trashedAt !== null
  const isWon = lead.stage.kind === 'won'
  const isLost = lead.stage.kind === 'lost'

  return (
    <section className="dash-panel flex min-w-0 flex-col" aria-labelledby="lead-file-name">
      <div className="flex flex-col gap-3 border-b border-[var(--dash-line)] px-5 pt-4 pb-4 sm:px-6">
        {mode === 'page' ? (
          <button
            type="button"
            className="dash-btn dash-btn-ghost -ms-2 h-8 self-start px-2 text-[12.5px]"
            onClick={onClose}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            All leads
          </button>
        ) : null}

        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className="dash-tone-grey grid size-[46px] shrink-0 place-items-center rounded-[12px] text-[14px] font-bold"
          >
            {initialsOf(lead.name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="lead-file-name" className="dash-title text-[24px] [overflow-wrap:anywhere] sm:text-[26px]">
              {lead.name}
            </h2>
            <p className="mt-1 text-[12.5px] [overflow-wrap:anywhere] text-[var(--dash-quiet)]">
              {lead.company || 'No company'} · from {lead.source.name}
              {lead.niche ? ` · ${lead.niche.name}` : ''}
            </p>
          </div>
          {mode === 'panel' ? (
            <button
              type="button"
              className="dash-btn dash-btn-ghost h-8 px-2"
              aria-label="Close lead file"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <StageChip kind={lead.stage.kind} name={lead.stage.name} />
          <FollowUpPill followUp={lead.followUp} />
        </div>

        {inTrash ? (
          <div className="dash-tone-grey flex flex-wrap items-center justify-between gap-2 rounded-[9px] px-3 py-2.5 text-[12.5px]">
            <span>
              <strong className="text-[var(--dash-ink)]">In Trash</strong> since {formatDay(lead.trashedAt!)}. Restore
              it to change it.
            </span>
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8 text-[12px]"
              disabled={restore.isPending}
              onClick={() => restore.mutate(lead.id, { onSuccess: () => notify.success(`${lead.name} restored`) })}
            >
              {restore.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw className="size-3.5" aria-hidden="true" />
              )}
              Restore
            </button>
          </div>
        ) : (
          <StagePicker lead={lead} />
        )}

        {lead.client ? (
          <p className="flex items-start gap-2 rounded-[9px] bg-[var(--dash-furniture)] px-3 py-2.5 text-[12.5px] text-[var(--dash-quiet)]">
            <Handshake className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {isWon ? 'Won — now the client ' : 'Won before — still linked to the client '}
              <Link
                to="/dashboard/clients"
                search={{ client: lead.client.id }}
                className="font-semibold text-[var(--dash-blue-ink)] hover:underline"
              >
                {lead.client.displayName}
              </Link>
              {lead.client.inTrash ? ' (in the clients’ Trash)' : ''}
            </span>
          </p>
        ) : null}

        {lead.lastLoss ? (
          <p className="flex items-start gap-2 rounded-[9px] bg-[var(--dash-furniture)] px-3 py-2.5 text-[12.5px] text-[var(--dash-quiet)]">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {isLost ? 'Lost' : 'Was lost'} on {formatDay(lead.lastLoss.at)}:{' '}
              <strong className="font-semibold text-[var(--dash-ink)]">{lead.lastLoss.reason}</strong>
              {isLost ? '' : ' — kept as history'}
              {lead.lastLoss.notes ? (
                <span className="mt-1 block whitespace-pre-line">{lead.lastLoss.notes}</span>
              ) : null}
            </span>
          </p>
        ) : null}
      </div>

      <FollowUpSection key={lead.id} lead={lead} />

      <div className="border-b border-[var(--dash-soft)] px-5 py-4 sm:px-6">
        <h3 className="dash-eyebrow-quiet mb-2.5">CONTACT</h3>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-y-2.5">
          <Row label="Email">
            <span className="min-w-0">{lead.email}</span>
            <CopyButton value={lead.email} label="Copy email" />
          </Row>
          <Row label="Phone">
            {lead.phone ? (
              <>
                <span className="dash-num">{lead.phone}</span>
                <CopyButton value={lead.phone} label="Copy phone" />
              </>
            ) : (
              <span className="text-[var(--dash-quiet)]">Not given</span>
            )}
          </Row>
          <Row label="Country">{lead.country.name}</Row>
          <Row label="Company">{lead.company || <span className="text-[var(--dash-quiet)]">None</span>}</Row>
          <Row label="Source">{lead.source.name}</Row>
          <Row label="Niche">{lead.niche?.name ?? <span className="text-[var(--dash-quiet)]">None</span>}</Row>
          <Row label="Added">
            {formatDay(lead.createdAt)}
            {lead.fromImport ? <span className="text-[var(--dash-quiet)]">· Imported from CSV</span> : null}
          </Row>
        </dl>

        {inTrash ? null : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/dashboard/leads/$leadId/edit"
              params={{ leadId: lead.id }}
              className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit details
            </Link>
            <button
              type="button"
              className="dash-btn dash-btn-ghost h-8 text-[12.5px]"
              onClick={() => setTrashing(true)}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Move to Trash
            </button>
          </div>
        )}
      </div>

      <div className="px-5 py-4 sm:px-6">
        <NotesForm key={lead.id} lead={lead} />
      </div>

      {trashing ? (
        <ConfirmDialog
          title={`Move ${lead.name} to Trash?`}
          confirmLabel="Move to Trash"
          busyLabel="Moving…"
          danger
          onClose={() => setTrashing(false)}
          onConfirm={async () => {
            await trash.mutateAsync(lead.id)
            notify.success(`${lead.name} moved to Trash`)
            setTrashing(false)
            onClose()
          }}
        >
          <p>For a lead added by mistake. You can restore it from Trash at any time, as it was.</p>
          {isLost || isWon ? null : (
            <p>If they simply said no, move the lead to Lost instead — the reason stays as history.</p>
          )}
          {lead.followUp ? <p>Its follow-up is not counted as due while the lead is in Trash.</p> : null}
        </ConfirmDialog>
      ) : null}
    </section>
  )
}
