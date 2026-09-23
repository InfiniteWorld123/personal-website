import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { revalidateLogic, useForm, useStore } from '@tanstack/react-form'
import { ArrowLeft, Copy, Handshake, Loader2, Pause, Pencil, Play, RotateCcw, Trash2, User, X } from 'lucide-react'
import { CLIENT_LIMITS, type OwnerClient } from '#/backend2/contracts/client.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { StatusChip } from '#/frontend/dashboard/primitives'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { clientSubline, formatDay } from '#/frontend/features/clients/client-form'
import {
  useClient,
  useClientStatus,
  usePatchClient,
  useRestoreClient,
  useTrashClient,
} from '#/frontend/features/clients/queries'
import { notify } from '#/frontend/lib/notify'
import { ClientMark, KindChip, LoadFailure, StateChip } from './client-parts'

/**
 * One Client's file: contact details, private notes, Active or Inactive, and
 * where the Client came from. Approved in the Design Lab (23 Sep 2026) as a
 * panel beside the directory on a computer and a full screen on a phone.
 *
 * No Inbox, Booking, Project or Invoice history is shown: `docs/v2/clients.md`
 * adds each only when its own module can link a Client properly.
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

/** The private notes, saved with a button, never silently. */
function NotesForm({ client }: { client: OwnerClient }) {
  const patch = usePatchClient()
  const [failure, setFailure] = useState<{ message: string; stale: boolean } | null>(null)
  const reload = useClient(client.id)
  const inTrash = client.trashedAt !== null
  // The version these notes were loaded from. A save sends its revision, never
  // the newest one a background refresh brought in, so a change made in
  // another tab is refused as stale instead of silently overwritten.
  const [base, setBase] = useState({ notes: client.notes, revision: client.revision })
  const [initial] = useState(() => ({ notes: client.notes }))

  const form = useForm({
    defaultValues: initial,
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) =>
        value.notes.length > CLIENT_LIMITS.notes
          ? { fields: { notes: `Keep the notes under ${CLIENT_LIMITS.notes.toLocaleString('en')} characters` } }
          : undefined,
    },
    onSubmitInvalid: () => document.getElementById(`notes-${client.id}`)?.focus(),
    onSubmit: async ({ value, formApi }) => {
      setFailure(null)

      try {
        const saved = await patch.mutateAsync({ id: client.id, revision: base.revision, notes: value.notes })
        const typed = formApi.state.values.notes

        setBase({ notes: saved.notes, revision: saved.revision })
        formApi.reset({ notes: saved.notes }, { keepDefaultValues: true })
        // What was typed while the save ran stays, still unsaved.
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
    if (submitting || client.revision <= base.revision) return
    // Typing over notes changed elsewhere keeps the older base, so its save is refused as stale.
    if (dirty && client.notes !== base.notes) return

    setBase({ notes: client.notes, revision: client.revision })
    if (!dirty) form.reset({ notes: client.notes }, { keepDefaultValues: true })
  }, [client.notes, client.revision, submitting, dirty])

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
              <label htmlFor={`notes-${client.id}`} className="dash-eyebrow-quiet">
                PRIVATE NOTES
              </label>
              <textarea
                id={`notes-${client.id}`}
                className="dash-field min-h-36 w-full resize-y px-3 py-2.5 text-[13px] leading-relaxed"
                placeholder="Anything worth remembering about this client. Only you can see it."
                value={field.state.value}
                readOnly={inTrash}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `notes-${client.id}-error` : undefined}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
              {error ? (
                <span id={`notes-${client.id}-error`} className="text-[12px] text-[var(--dash-red-ink)]">
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
              className="dash-btn dash-btn-quiet h-8 text-[12px]"
              onClick={async () => {
                const fresh = await reload.refetch()

                if (fresh.isSuccess) {
                  setBase({ notes: fresh.data.notes, revision: fresh.data.revision })
                  form.reset({ notes: fresh.data.notes }, { keepDefaultValues: true })
                  setFailure(null)
                }
              }}
            >
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
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <button
                type="submit"
                className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
                disabled={!dirty || submitting}
              >
                {submitting ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                {submitting ? 'Saving…' : 'Save notes'}
              </button>
            )}
          </form.Subscribe>
        </div>
      )}
    </form>
  )
}

function TrashDialog({
  client,
  onClose,
  onTrashed,
}: {
  client: OwnerClient
  onClose: () => void
  onTrashed: () => void
}) {
  const trash = useTrashClient()
  const status = useClientStatus()
  const [failure, setFailure] = useState<string | null>(null)
  const busy = trash.isPending || status.isPending

  return (
    <BlogDialog labelledBy="trash-title" describedBy="trash-text" size="sm" onClose={onClose}>
      <DialogTitle id="trash-title">Move {client.displayName} to Trash?</DialogTitle>
      <p id="trash-text" className="text-[13px] leading-relaxed text-[var(--dash-quiet)]">
        For a client created by mistake. You can restore it from Trash at any time.
        {client.status === 'active'
          ? ' For a past client you simply no longer work with, mark it inactive instead.'
          : ''}
      </p>
      {failure ? <DialogAlert>{failure}</DialogAlert> : null}
      <DialogActions>
        <button type="button" className="dash-btn dash-btn-ghost" onClick={onClose} data-autofocus>
          Cancel
        </button>
        {client.status === 'active' ? (
          <button
            type="button"
            className="dash-btn dash-btn-quiet"
            disabled={busy}
            onClick={() =>
              status.mutate(
                { id: client.id, status: 'inactive' },
                {
                  onSuccess: () => {
                    notify.success(`${client.displayName} marked inactive`)
                    onClose()
                  },
                  onError: (error) => setFailure(error.message),
                },
              )
            }
          >
            Mark inactive
          </button>
        ) : null}
        <button
          type="button"
          className="dash-btn dash-tone-red"
          disabled={busy}
          onClick={() =>
            trash.mutate(client.id, {
              onSuccess: () => {
                notify.success(`${client.displayName} moved to Trash`)
                onTrashed()
              },
              onError: (error) => setFailure(error.message),
            })
          }
        >
          {trash.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          Move to Trash
        </button>
      </DialogActions>
    </BlogDialog>
  )
}

export function ClientFile({
  clientId,
  onClose,
  mode,
}: {
  clientId: string
  onClose: () => void
  /** `panel` beside the list, with a close button; `page` alone, with a way back. */
  mode: 'panel' | 'page'
}) {
  const query = useClient(clientId)
  const status = useClientStatus()
  const restore = useRestoreClient()
  const [trashing, setTrashing] = useState(false)

  if (query.isPending) {
    return (
      <section className="dash-panel flex flex-col gap-3 p-6" aria-busy="true" aria-label="Loading client">
        <span className="dash-skeleton h-11 w-11 rounded-[12px]" />
        <span className="dash-skeleton h-6 w-56 max-w-full rounded" />
        <span className="dash-skeleton h-3 w-40 rounded" />
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
            <h2 className="text-sm font-semibold">This client does not exist</h2>
            <p className="max-w-[52ch] text-[13px] text-[var(--dash-quiet)]">
              It may have been deleted permanently, or the link is wrong. Clients that were only moved to Trash are
              still there.
            </p>
            <span className="flex flex-wrap gap-2">
              <button type="button" className="dash-btn dash-btn-quiet" onClick={onClose}>
                <ArrowLeft className="size-4" aria-hidden="true" />
                All clients
              </button>
              <Link to="/dashboard/clients/trash" className="dash-btn dash-btn-ghost">
                Open Trash
              </Link>
            </span>
          </div>
        ) : (
          <LoadFailure
            title="This client could not be loaded"
            message="The server did not answer. Nothing has been changed."
            onRetry={() => void query.refetch()}
          />
        )}
      </section>
    )
  }

  const client = query.data
  const inTrash = client.trashedAt !== null
  const lead = client.leads[0]

  return (
    <section className="dash-panel flex min-w-0 flex-col" aria-labelledby="client-file-name">
      <div className="flex flex-col gap-3 border-b border-[var(--dash-line)] px-5 pt-4 pb-4 sm:px-6">
        {mode === 'page' ? (
          <button
            type="button"
            className="dash-btn dash-btn-ghost -ms-2 h-8 self-start px-2 text-[12.5px]"
            onClick={onClose}
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            All clients
          </button>
        ) : null}

        <div className="flex items-start gap-3.5">
          <ClientMark kind={client.kind} name={client.displayName} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 id="client-file-name" className="dash-title text-[24px] [overflow-wrap:anywhere] sm:text-[26px]">
              {client.displayName}
            </h2>
            <p className="mt-1 text-[12.5px] text-[var(--dash-quiet)]">
              {client.kind === 'company' ? `Primary contact: ${client.name}` : clientSubline(client)} · since{' '}
              {formatDay(client.createdAt)}
            </p>
          </div>
          {mode === 'panel' ? (
            <button
              type="button"
              className="dash-btn dash-btn-ghost h-8 px-2"
              aria-label="Close client file"
              onClick={onClose}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <KindChip kind={client.kind} />
          {client.status === 'active' ? (
            <StatusChip tone="blue">Active</StatusChip>
          ) : (
            <StateChip status={client.status} />
          )}
          {client.niche ? <StatusChip tone="outline">{client.niche.name}</StatusChip> : null}
        </div>

        {inTrash ? (
          <div className="dash-tone-grey flex flex-wrap items-center justify-between gap-2 rounded-[9px] px-3 py-2.5 text-[12.5px]">
            <span>
              <strong className="text-[var(--dash-ink)]">In Trash</strong> since {formatDay(client.trashedAt!)}. Restore
              it to edit it.
            </span>
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8 text-[12px]"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate(client.id, { onSuccess: () => notify.success(`${client.displayName} restored`) })
              }
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              Restore
            </button>
          </div>
        ) : null}

        <p className="flex items-center gap-2 rounded-[9px] bg-[var(--dash-furniture)] px-3 py-2.5 text-[12.5px] text-[var(--dash-quiet)]">
          {lead ? (
            <>
              <Handshake className="size-3.5 shrink-0" aria-hidden="true" />
              {lead.how === 'created'
                ? `Came from a lead you won on ${formatDay(lead.linkedAt)}.`
                : `A lead was linked to this client on ${formatDay(lead.linkedAt)}.`}
            </>
          ) : (
            <>
              <User className="size-3.5 shrink-0" aria-hidden="true" />
              Added directly — there is no lead behind this client.
            </>
          )}
        </p>

        {inTrash ? null : (
          <div className="flex flex-wrap gap-2">
            <Link
              to="/dashboard/clients/$clientId/edit"
              params={{ clientId: client.id }}
              className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit details
            </Link>
            <button
              type="button"
              className="dash-btn dash-btn-quiet h-8 text-[12.5px]"
              disabled={status.isPending}
              onClick={() => {
                const next = client.status === 'active' ? 'inactive' : 'active'

                status.mutate(
                  { id: client.id, status: next },
                  {
                    onSuccess: () =>
                      notify.success(
                        next === 'inactive'
                          ? `${client.displayName} marked inactive`
                          : `${client.displayName} reactivated`,
                      ),
                  },
                )
              }}
            >
              {client.status === 'active' ? (
                <Pause className="size-3.5" aria-hidden="true" />
              ) : (
                <Play className="size-3.5" aria-hidden="true" />
              )}
              {client.status === 'active' ? 'Mark inactive' : 'Reactivate'}
            </button>
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

      <div className="border-b border-[var(--dash-soft)] px-5 py-4 sm:px-6">
        <h3 className="dash-eyebrow-quiet mb-2.5">CONTACT</h3>
        <dl className="grid grid-cols-1 gap-x-4 gap-y-0.5 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-y-2.5">
          {client.kind === 'company' ? (
            <>
              <Row label="Company">{client.companyName}</Row>
              <Row label="Primary contact">{client.name}</Row>
            </>
          ) : (
            <Row label="Name">{client.name}</Row>
          )}
          <Row label="Email">
            <span className="min-w-0">{client.email}</span>
            <CopyButton value={client.email} label="Copy email" />
          </Row>
          <Row label="Phone">
            {client.phone ? (
              <>
                <span className="dash-num">{client.phone}</span>
                <CopyButton value={client.phone} label="Copy phone" />
              </>
            ) : (
              <span className="text-[var(--dash-quiet)]">Not given</span>
            )}
          </Row>
          <Row label="Country">{client.country.name}</Row>
          {client.kind === 'person' ? (
            <Row label="Company">{client.companyName || <span className="text-[var(--dash-quiet)]">None</span>}</Row>
          ) : null}
          <Row label="Niche">{client.niche?.name ?? <span className="text-[var(--dash-quiet)]">None</span>}</Row>
        </dl>
      </div>

      <div className="px-5 py-4 sm:px-6">
        <NotesForm key={client.id} client={client} />
      </div>

      {trashing ? (
        <TrashDialog
          client={client}
          onClose={() => setTrashing(false)}
          onTrashed={() => {
            setTrashing(false)
            onClose()
          }}
        />
      ) : null}
    </section>
  )
}
