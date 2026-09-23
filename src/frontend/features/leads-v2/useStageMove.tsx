import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { ClientCandidate } from '#/backend2/contracts/client.contract'
import {
  LEAD_LIMITS,
  type FollowUp,
  type LeadStage,
  type OwnerLead,
  type StageChange,
} from '#/backend2/contracts/lead.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { BlogDialog, DialogActions, DialogAlert, DialogTitle } from '#/frontend/features/blog-v2/BlogDialog'
import { findDuplicates as findClientDuplicates } from '#/frontend/features/clients/api'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { readLead } from './api'
import { serverFieldErrors } from './lead-form'
import { useChangeStage, useChoices } from './queries'

/**
 * Moving a Lead — the one path every screen uses (`docs/v2/leads.md`).
 *
 * The List's stage control, the Board's drag and "Move to…" menu, and the
 * lead's own file all call `request(lead, stage)`. An ordinary stage saves at
 * once. **Lost** first asks for the reason; **Won** first asks whether to
 * create a new Client or link an existing one with the same email. Cancelling
 * either dialog changes nothing, and the promise says so, so the Board can put
 * a dragged card back. Once the save has been sent it cannot be called back,
 * so Cancel, Escape and the backdrop wait for its answer instead of claiming
 * the lead stayed.
 *
 * The server is the judge: a refusal (a Client that appeared meanwhile, a
 * Client in Trash) is shown inside the dialog and the Lead stays where it was.
 */

export type MovableLead = {
  id: string
  name: string
  email: string
  company: string
  stage: { id: string; kind: LeadStage['kind']; name: string }
  wonAt: string | null
  /**
   * The Client this Lead is linked to, when the caller knows: the lead's file
   * does, a Board card does not (`undefined`). `wonAt` cannot stand in for it —
   * it stays when a Won lead moves back, while the link goes when its Client
   * is deleted for good.
   */
  client?: { id: string; displayName: string; inTrash: boolean } | null
  followUp: FollowUp | null
}

/**
 * A busy or not-yet-ready dialog button is only `aria-disabled`, and its
 * handler refuses. A native `disabled` on the button that has focus drops
 * focus to the page behind the dialog, and the next Tab would leave the modal.
 * These give it the disabled look `.dash-btn:disabled` gives a real one.
 */
const PRIMARY_BUSY =
  'aria-disabled:cursor-not-allowed aria-disabled:bg-[var(--dash-chip)] aria-disabled:text-[var(--dash-quiet)] aria-disabled:filter-none'
const GHOST_BUSY = 'aria-disabled:cursor-not-allowed aria-disabled:opacity-40'

export type MoveOutcome = 'moved' | 'cancelled' | 'failed'

type Pending = { lead: MovableLead; target: LeadStage; resolve: (outcome: MoveOutcome) => void }

export function useStageMove(options: { onMoved?: (lead: OwnerLead) => void } = {}) {
  const change = useChangeStage()
  const [pending, setPending] = useState<Pending | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const onMoved = useRef(options.onMoved)
  onMoved.current = options.onMoved

  const save = async (
    lead: MovableLead,
    target: LeadStage,
    extra: Omit<StageChange, 'stageId'> = {},
  ): Promise<OwnerLead> => {
    setSavingId(lead.id)

    try {
      const saved = await change.mutateAsync({ id: lead.id, change: { stageId: target.id, ...extra } })
      onMoved.current?.(saved)

      return saved
    } finally {
      setSavingId(null)
    }
  }

  const request = (lead: MovableLead, target: LeadStage): Promise<MoveOutcome> => {
    if (lead.stage.id === target.id) return Promise.resolve('cancelled')

    if (target.kind === 'lost' || target.kind === 'won') {
      return new Promise((resolve) => setPending({ lead, target, resolve }))
    }

    return save(lead, target).then(
      () => {
        notify.success(`${lead.name} moved to ${target.name}`)

        return 'moved' as const
      },
      // The failure itself is announced once, by the Dashboard's mutation handler.
      () => 'failed' as const,
    )
  }

  const close = (outcome: MoveOutcome) => {
    pending?.resolve(outcome)
    setPending(null)
  }

  let dialog: ReactNode = null

  if (pending?.target.kind === 'lost') {
    dialog = (
      <LostDialog
        lead={pending.lead}
        onCancel={() => close('cancelled')}
        onConfirm={async (lost) => {
          await save(pending.lead, pending.target, { lost })
          notify.success(`${pending.lead.name} moved to Lost`)
          close('moved')
        }}
      />
    )
  }

  if (pending?.target.kind === 'won') {
    dialog = (
      <WonDialog
        lead={pending.lead}
        onCancel={() => close('cancelled')}
        onConfirm={async (won) => {
          const saved = await save(pending.lead, pending.target, won ? { won } : {})
          notify.success(
            saved.client
              ? `${pending.lead.name} is won — client ${saved.client.displayName}`
              : `${pending.lead.name} is won`,
          )
          close('moved')
        }}
      />
    )
  }

  return { request, dialog, savingId, busy: change.isPending }
}

/* --------------------------------------------------------------------- Lost */

function LostDialog({
  lead,
  onCancel,
  onConfirm,
}: {
  lead: MovableLead
  onCancel: () => void
  onConfirm: (lost: { reasonId: string; reasonText: string; notes: string }) => Promise<void>
}) {
  const reasons = useChoices('loss-reasons', { hidden: 'exclude', pageSize: 100 })
  const [failure, setFailure] = useState<string | null>(null)
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({})
  // Read at once by Cancel, Escape and the backdrop; rendered state lags a render behind.
  const saving = useRef(false)
  // Other — the locked reason — last, where people look for it.
  const items = [...(reasons.data?.items ?? [])].sort((a, b) => Number(a.locked) - Number(b.locked))
  const otherId = items.find((reason) => reason.locked)?.id

  const form = useForm({
    defaultValues: { reasonId: '', reasonText: '', notes: '' },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const fields: Record<string, string> = {}

        if (!value.reasonId) fields.reasonId = 'Choose why this lead was lost'
        if (value.reasonId && value.reasonId === otherId && value.reasonText.trim() === '') {
          fields.reasonText = 'Write the reason'
        }
        if (value.notes.length > LEAD_LIMITS.lostNotes)
          fields.notes = `Keep the notes under ${LEAD_LIMITS.lostNotes} characters`

        return Object.keys(fields).length > 0 ? { fields } : undefined
      },
    },
    onSubmitInvalid: () =>
      window.requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('#lost-form [aria-invalid="true"]')?.focus(),
      ),
    onSubmit: async ({ value }) => {
      setFailure(null)
      setServerErrors({})
      saving.current = true

      try {
        await onConfirm({
          reasonId: value.reasonId,
          reasonText: value.reasonId === otherId ? value.reasonText.trim() : '',
          notes: value.notes,
        })
      } catch (caught) {
        const fields = serverFieldErrors(caught)
        const mapped: Record<string, string> = {}

        if (fields['lost.reasonId']) mapped.reasonId = fields['lost.reasonId']
        if (fields['lost.reasonText']) mapped.reasonText = fields['lost.reasonText']
        setServerErrors(mapped)
        setFailure(
          Object.keys(mapped).length > 0 ? null : caught instanceof Error ? caught.message : 'The lead was not moved.',
        )
      } finally {
        saving.current = false
      }
    },
  })

  // The request cannot be called back: cancelling mid-save would say the lead stayed while the server moves it.
  const cancel = () => {
    if (!saving.current) onCancel()
  }

  return (
    <BlogDialog labelledBy="lost-title" describedBy="lost-lead" onClose={cancel}>
      <form
        id="lost-form"
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          // The button stays focusable while busy, so a second Enter must not send the move twice.
          if (saving.current || form.state.isSubmitting) return
          void form.handleSubmit()
        }}
      >
        <DialogTitle id="lost-title">Why was {lead.name} lost?</DialogTitle>
        <p id="lost-lead" className="text-[13px] text-[var(--dash-quiet)]">
          The lead leaves the active list and waits in Lost. You can reopen it later; this reason stays as history.
          {lead.followUp
            ? ' Its open follow-up is cancelled — recorded as cancelled because of the loss, not as done.'
            : ''}
        </p>

        <form.Field name="reasonId">
          {(field) => {
            const error = (field.state.meta.errors[0] as string | undefined) ?? serverErrors.reasonId

            return (
              <fieldset className="flex flex-col gap-1.5" aria-describedby={error ? 'lost-reason-error' : undefined}>
                <legend className="mb-1.5 text-[12.5px] font-semibold">Reason</legend>
                {reasons.isPending ? (
                  <p className="text-[13px] text-[var(--dash-quiet)]">Loading reasons…</p>
                ) : reasons.isError ? (
                  <DialogAlert>The reasons could not be loaded. Close this and try again.</DialogAlert>
                ) : (
                  <div role="radiogroup" className="flex flex-col gap-1.5">
                    {items.map((reason, index) => (
                      <label
                        key={reason.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-2.5 rounded-[9px] border px-3 py-2 text-[13px]',
                          field.state.value === reason.id
                            ? 'border-[var(--dash-blue)] bg-[var(--dash-blue-tint)]'
                            : 'border-[var(--dash-line)]',
                        )}
                      >
                        <input
                          type="radio"
                          name="lost-reason"
                          value={reason.id}
                          checked={field.state.value === reason.id}
                          aria-invalid={index === 0 && error ? true : undefined}
                          onChange={() => {
                            setServerErrors({})
                            field.handleChange(reason.id)
                          }}
                          className="accent-[var(--dash-brand)]"
                        />
                        {reason.name}
                      </label>
                    ))}
                  </div>
                )}
                {error ? (
                  <span
                    id="lost-reason-error"
                    className="flex items-center gap-1.5 text-[12px] text-[var(--dash-red-ink)]"
                  >
                    <AlertTriangle className="size-3.5" aria-hidden="true" />
                    {error}
                  </span>
                ) : null}
              </fieldset>
            )
          }}
        </form.Field>

        <form.Subscribe selector={(state) => state.values.reasonId}>
          {(reasonId) =>
            reasonId && reasonId === otherId ? (
              <form.Field name="reasonText">
                {(field) => {
                  const error = (field.state.meta.errors[0] as string | undefined) ?? serverErrors.reasonText

                  return (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="lost-other" className="text-[12.5px] font-semibold">
                        The reason
                      </label>
                      <input
                        id="lost-other"
                        className="dash-field h-10 px-3 text-[13px]"
                        maxLength={LEAD_LIMITS.lostText}
                        value={field.state.value}
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? 'lost-other-error' : undefined}
                        onChange={(event) => field.handleChange(event.target.value)}
                        onBlur={field.handleBlur}
                      />
                      {error ? (
                        <span id="lost-other-error" className="text-[12px] text-[var(--dash-red-ink)]">
                          {error}
                        </span>
                      ) : null}
                    </div>
                  )
                }}
              </form.Field>
            ) : null
          }
        </form.Subscribe>

        <form.Field name="notes">
          {(field) => {
            const error = field.state.meta.errors[0] as string | undefined

            return (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="lost-notes" className="text-[12.5px] font-semibold">
                  Notes <span className="font-normal text-[var(--dash-quiet)]">(optional)</span>
                </label>
                <textarea
                  id="lost-notes"
                  className="dash-field min-h-20 resize-y px-3 py-2 text-[13px]"
                  value={field.state.value}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? 'lost-notes-error' : undefined}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                />
                {error ? (
                  <span id="lost-notes-error" className="text-[12px] text-[var(--dash-red-ink)]">
                    {error}
                  </span>
                ) : null}
              </div>
            )
          }}
        </form.Field>

        {failure ? <DialogAlert>{failure}</DialogAlert> : null}

        <DialogActions>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(submitting) => (
              <>
                <button
                  type="button"
                  className={cn('dash-btn dash-btn-ghost', GHOST_BUSY)}
                  aria-disabled={submitting ? true : undefined}
                  onClick={cancel}
                >
                  Cancel — keep in {lead.stage.name}
                </button>
                <button
                  type="submit"
                  className={cn('dash-btn dash-btn-primary', PRIMARY_BUSY)}
                  aria-disabled={submitting ? true : undefined}
                >
                  {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  {submitting ? 'Moving…' : 'Move to Lost'}
                </button>
              </>
            )}
          </form.Subscribe>
        </DialogActions>
      </form>
    </BlogDialog>
  )
}

/* ---------------------------------------------------------------------- Won */

type WonChoice = NonNullable<StageChange['won']>

/**
 * What Won has to ask depends on whether the Lead still has its Client.
 *
 * - `reuse` — it does: the server uses that Client again, nothing to choose.
 * - `choose` — it does not: create a new Client or link one with this email.
 * - `checking` — not known yet: a Board card carries no Client, so the lead
 *   is read once.
 *
 * `wonAt` alone cannot tell. It stays when a Won lead moves back, but the link
 * goes when its Client is deleted for good — and then the Lead may create a
 * new one (`docs/v2/clients.md`). Trusting `wonAt` left such a lead with
 * nothing to choose while the server kept asking for a choice.
 */
type WonMode = 'checking' | 'reuse' | 'choose'

const initialMode = (lead: MovableLead): WonMode => {
  if (lead.client !== undefined) return lead.client ? 'reuse' : 'choose'

  return lead.wonAt === null ? 'choose' : 'checking'
}

/**
 * Every Client with the Lead's email — in Trash or not, as the server counts
 * them when it refuses a duplicate — and the choice to start from: the only
 * linkable one, a new Client when none can be linked, or nothing yet when the
 * owner must pick between several.
 */
const fromMatches = (found: ClientCandidate[]): { matches: ClientCandidate[]; choice: string } => {
  const matches = found.filter((candidate) => candidate.matchedOn.includes('email'))
  const linkable = matches.filter((candidate) => !candidate.inTrash)

  return { matches, choice: linkable.length === 1 ? linkable[0]!.id : linkable.length === 0 ? 'new' : '' }
}

function WonDialog({
  lead,
  onCancel,
  onConfirm,
}: {
  lead: MovableLead
  onCancel: () => void
  /** `null` when the Lead already has its Client: the server reuses it. */
  onConfirm: (won: WonChoice | null) => Promise<void>
}) {
  const [mode, setMode] = useState<WonMode>(() => initialMode(lead))
  // Won before, but its Client has been deleted for good since.
  const [linkGone, setLinkGone] = useState(lead.client === null && lead.wonAt !== null)
  const [matches, setMatches] = useState<ClientCandidate[] | null>(null)
  const [choice, setChoice] = useState<string>('')
  const [failure, setFailure] = useState<{ message: string; trash?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  // Read at once by Cancel, Escape, the backdrop and a second click; `busy` lags a render behind.
  const saving = useRef(false)

  // Only a Client out of Trash can be linked; one in Trash is named, with the way to restore it.
  const candidates = (matches ?? []).filter((candidate) => !candidate.inTrash)
  const trashed = (matches ?? []).filter((candidate) => candidate.inTrash)

  // A Board card does not say whether its Client still exists; the lead itself does.
  useEffect(() => {
    if (mode !== 'checking') return

    let live = true

    readLead(lead.id).then(
      (fresh) => {
        if (!live) return

        setLinkGone(fresh.client === null)
        setMode(fresh.client ? 'reuse' : 'choose')
      },
      () => {
        // Asking is safe either way: a lead that still has its Client reuses it whatever is chosen.
        if (live) setMode('choose')
      },
    )

    return () => {
      live = false
    }
  }, [mode, lead.id])

  // Which Clients already have this email — asked once there is a choice to make.
  useEffect(() => {
    if (mode !== 'choose') return

    let live = true

    findClientDuplicates({ email: lead.email })
      .then(({ candidates: found }) => {
        if (!live) return

        const next = fromMatches(found)
        setMatches(next.matches)
        setChoice(next.choice)
      })
      .catch(() => {
        if (!live) return
        // Unknown is safer than "none": the server still refuses a duplicate.
        setMatches([])
        setChoice('new')
      })

    return () => {
      live = false
    }
  }, [mode, lead.email])

  const loading = mode === 'checking' || (mode === 'choose' && matches === null)
  const ready = !busy && (mode === 'reuse' || (mode === 'choose' && matches !== null && choice !== ''))

  const confirm = async () => {
    if (saving.current || !ready) return

    saving.current = true
    setFailure(null)
    setBusy(true)

    try {
      if (mode === 'reuse') await onConfirm(null)
      // Every Client with this email, Trash included, was on screen: a new one beside them is the owner's choice.
      else if (choice === 'new') await onConfirm({ mode: 'create', allowDuplicate: (matches?.length ?? 0) > 0 })
      else await onConfirm({ mode: 'link', clientId: choice })
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === 'CLIENT_DUPLICATE') {
        const next = fromMatches((caught.details as { candidates?: ClientCandidate[] } | undefined)?.candidates ?? [])
        setMatches(next.matches)
        setChoice(next.choice)
        setFailure({
          message: next.matches.some((candidate) => !candidate.inTrash)
            ? 'A client with this email appeared meanwhile. Choose what to do.'
            : 'A client in the clients’ Trash has this email. Restore it to link it, or create a new client anyway.',
        })
      } else if (caught instanceof ApiRequestError && caught.code === 'CLIENT_IN_TRASH') {
        setFailure({ message: caught.message, trash: true })
      } else if (mode === 'reuse' && serverFieldErrors(caught).won) {
        // Its Client was deleted for good after this screen was read, and the link went with it: ask again.
        setMatches(null)
        setChoice('')
        setMode('choose')
        setFailure({
          message: 'This lead’s earlier client no longer exists. Create a new client or link an existing one.',
        })
      } else {
        setFailure({ message: caught instanceof Error ? caught.message : 'The lead was not moved.' })
      }
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  // The request cannot be called back: cancelling mid-save would say the lead stayed while the server moves it.
  const cancel = () => {
    if (!saving.current) onCancel()
  }

  return (
    <BlogDialog labelledBy="won-title" describedBy="won-lead" onClose={cancel}>
      <DialogTitle id="won-title">Move {lead.name} to Won</DialogTitle>

      <div id="won-lead" className="flex flex-col gap-2.5 text-[13px] leading-relaxed text-[var(--dash-quiet)]">
        {mode === 'reuse' ? (
          <p>
            This lead was won before. Its client is used again — nothing new is created and no notes are copied twice.
          </p>
        ) : loading ? (
          <p className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {mode === 'checking'
              ? 'Checking whether this lead still has its client…'
              : `Checking whether a client already has ${lead.email}…`}
          </p>
        ) : (
          <>
            {linkGone ? <p>This lead was won before, but that client has since been deleted for good.</p> : null}
            {candidates.length === 0 ? (
              <p>
                A new <strong className="text-[var(--dash-ink)]">Person</strong> client is created with {lead.name}’s
                details, niche and notes
                {lead.company ? `; “${lead.company}” is kept as where they work — you can make it a Company later` : ''}
                .
              </p>
            ) : (
              <p>
                {candidates.length === 1 ? 'A client already has' : `${candidates.length} clients already have`} this
                email. Link the lead to {candidates.length === 1 ? 'it' : 'one of them'} instead of creating a second
                client. The lead’s notes are added once, below theirs.
              </p>
            )}
            {trashed.length > 0 ? (
              <p>
                {trashed.length === 1 ? (
                  <>
                    <strong className="text-[var(--dash-ink)]">{trashed[0]!.displayName}</strong>, in the clients’
                    Trash, has this email too.
                  </>
                ) : (
                  `${trashed.length} clients in the clients’ Trash have this email too.`
                )}{' '}
                A client in Trash cannot be linked — restore it first if the lead belongs with it.{' '}
                <Link to="/dashboard/clients/trash" className="font-semibold underline">
                  Open the clients’ Trash
                </Link>
              </p>
            ) : null}
          </>
        )}
        {lead.followUp ? <p>The open follow-up closes as no longer needed.</p> : null}
      </div>

      {mode === 'choose' && !loading && candidates.length + trashed.length > 0 ? (
        <div role="radiogroup" aria-label="Which client" className="flex flex-col gap-1.5">
          {candidates.map((candidate) => (
            <label
              key={candidate.id}
              className={cn(
                'flex cursor-pointer items-start gap-2.5 rounded-[9px] border px-3 py-2 text-[13px]',
                choice === candidate.id
                  ? 'border-[var(--dash-blue)] bg-[var(--dash-blue-tint)]'
                  : 'border-[var(--dash-line)]',
              )}
            >
              <input
                type="radio"
                name="won-choice"
                checked={choice === candidate.id}
                onChange={() => setChoice(candidate.id)}
                className="mt-1 accent-[var(--dash-brand)]"
              />
              <span>
                <strong className="block">Link to {candidate.displayName}</strong>
                <span className="text-[12px] text-[var(--dash-quiet)]">
                  {candidate.kind === 'company' ? 'Company' : 'Person'} ·{' '}
                  {candidate.status === 'active' ? 'Active' : 'Inactive'} · {candidate.email}
                </span>
              </span>
            </label>
          ))}
          <label
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-[9px] border px-3 py-2 text-[13px]',
              choice === 'new' ? 'border-[var(--dash-blue)] bg-[var(--dash-blue-tint)]' : 'border-[var(--dash-line)]',
            )}
          >
            <input
              type="radio"
              name="won-choice"
              checked={choice === 'new'}
              onChange={() => setChoice('new')}
              className="mt-1 accent-[var(--dash-brand)]"
            />
            <span>
              <strong className="block">Create a new client anyway</strong>
              <span className="text-[12px] text-[var(--dash-quiet)]">
                Only if this is really someone else sharing the email.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {failure ? (
        <DialogAlert>
          {failure.message}
          {failure.trash ? (
            <>
              {' '}
              <Link to="/dashboard/clients/trash" className="font-semibold underline">
                Open the clients’ Trash
              </Link>
            </>
          ) : null}
        </DialogAlert>
      ) : null}

      <p className="text-[11.5px] text-[var(--dash-quiet)]">If saving fails, nothing changes on either side.</p>

      <DialogActions>
        <button
          type="button"
          className={cn('dash-btn dash-btn-ghost', GHOST_BUSY)}
          aria-disabled={busy ? true : undefined}
          onClick={cancel}
        >
          Cancel — keep in {lead.stage.name}
        </button>
        <button
          type="button"
          className={cn('dash-btn dash-btn-primary', PRIMARY_BUSY)}
          aria-disabled={ready ? undefined : true}
          onClick={() => void confirm()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? 'Moving…' : 'Move to Won'}
        </button>
      </DialogActions>
    </BlogDialog>
  )
}
