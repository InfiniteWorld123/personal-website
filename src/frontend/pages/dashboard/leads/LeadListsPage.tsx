import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { revalidateLogic, useForm } from '@tanstack/react-form'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
} from 'lucide-react'
import * as v from 'valibot'
import { CreateChoiceSchema, LEAD_LIMITS, type LeadChoice, type LeadStage } from '#/backend2/contracts/lead.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { DashboardPage, PageHead, StatusChip } from '#/frontend/dashboard/primitives'
import type { ChoiceKind } from '#/frontend/features/leads-v2/api'
import { serverFieldErrors } from '#/frontend/features/leads-v2/lead-form'
import {
  leadKeys,
  useChoices,
  useCreateChoice,
  useCreateStage,
  useDeleteChoice,
  useDeleteStage,
  usePatchChoice,
  usePatchStage,
  useStages,
} from '#/frontend/features/leads-v2/queries'
import { notify } from '#/frontend/lib/notify'
import { cn } from '#/frontend/lib/utils'
import { NicheManager } from '../clients/NicheManager'
import { EmptyState, LoadFailure, Pager } from './lead-parts'

/**
 * The owner's own lists behind Leads, as approved in the Leads Design Lab
 * (23 Sep 2026): stages, sources, lost reasons and niches.
 *
 * New, Won and Lost never move and never change. Contacted and the owner's
 * stages can be reordered; the owner's own can be renamed, and deleted once no
 * lead is in them. `Unknown` and `Other` are built in. Hiding a source or a
 * reason keeps it on the leads that have it and only takes it out of new
 * choices — so a used one is hidden, never deleted. Niches are the one list
 * Clients already manages, opened here rather than copied.
 *
 * The tab lives in the address (`?tab=`), so the Lost dialog or a lead file
 * can link straight to the list it needs.
 */

export type ListsTab = 'stages' | 'sources' | 'reasons' | 'niches'

const TABS: Array<{ value: ListsTab; label: string }> = [
  { value: 'stages', label: 'Stages' },
  { value: 'sources', label: 'Sources' },
  { value: 'reasons', label: 'Lost reasons' },
  { value: 'niches', label: 'Niches' },
]

/** Fifty a page: far more than the owner keeps, and still a bounded page. */
const CHOICE_PAGE_SIZE = 50

const WORDS: Record<
  ChoiceKind,
  { one: string; title: string; many: string; add: string; search: string; empty: string }
> = {
  sources: {
    one: 'source',
    title: 'Source',
    many: 'sources',
    add: 'Add a source',
    search: 'Search sources',
    empty: 'Enter a name for the source',
  },
  'loss-reasons': {
    one: 'reason',
    title: 'Reason',
    many: 'reasons',
    add: 'Add a reason',
    search: 'Search lost reasons',
    empty: 'Enter the reason',
  },
}

/**
 * A square icon button, a little larger under a thumb. At the ends of the
 * stage order the arrows are truly disabled; a busy or in-use button is only
 * `aria-disabled`, so it keeps focus and can still say why it will not act.
 */
const ICON_BTN =
  'dash-btn dash-btn-ghost size-9 shrink-0 px-0 disabled:bg-transparent disabled:opacity-35 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 sm:size-8'

const ROW = 'flex flex-col gap-1.5 border-t border-[var(--dash-soft)] px-1 py-2 first:border-0'

const leadsWord = (count: number): string => (count === 1 ? '1 lead' : `${count} leads`)

/** Why a list could not be read — the same sentences as the rest of Leads. */
const loadMessage = (error: unknown): string => {
  if (error instanceof ApiRequestError && error.status === 401) return 'You are signed out. Sign in again, then reload.'
  if (error instanceof ApiRequestError && error.status === 403) return 'This account cannot see leads.'

  return 'The server did not answer. Nothing has been changed. Check your connection, then try again.'
}

/** Why a change did not happen. The server's sentence already names the list and the fix. */
const failureText = (caught: unknown): string => {
  if (caught instanceof ApiRequestError && caught.status === 401) {
    return 'You are signed out. Sign in again, then try again.'
  }

  return caught instanceof ApiRequestError ? caught.message : 'That did not work. Nothing was changed.'
}

/**
 * A refusal that means the screen is out of date — the choice was deleted in
 * another tab, or a lead moved into it meanwhile. Re-read, so the counts and
 * the disabled buttons tell the truth next time.
 */
const useResync = () => {
  const client = useQueryClient()

  return (caught: unknown) => {
    if (caught instanceof ApiRequestError && (caught.status === 404 || caught.status === 409)) {
      void client.invalidateQueries({ queryKey: leadKeys.all })
    }
  }
}

/** The server's own rule for every stage, source and reason name, run here first. */
const nameError = (name: string, empty: string): string | undefined => {
  const result = v.safeParse(CreateChoiceSchema, { name })

  if (result.success) return undefined

  const message = result.issues[0].message

  return message === 'Enter a name' ? empty : message
}

type Message = { tone: 'error' | 'info'; text: string }

function RowMessage({ message }: { message: Message | null }) {
  if (!message) return null

  return message.tone === 'error' ? (
    <span role="alert" className="text-[12px] text-[var(--dash-red-ink)]">
      {message.text}
    </span>
  ) : (
    <span role="status" className="text-[12px] text-[var(--dash-quiet)]">
      {message.text}
    </span>
  )
}

/** The lock where the buttons would be: fixed on purpose, and said in words beside it. */
function LockSlot({ wide = false }: { wide?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center text-[var(--dash-quiet)]',
        wide ? 'h-9 w-[78px] sm:h-8 sm:w-[70px]' : 'size-9 sm:size-8',
      )}
    >
      <Lock className="size-3.5" />
    </span>
  )
}

function RowText({ name, note }: { name: string; note: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[13px] font-semibold">{name}</span>
      <span className="block text-[11.5px] text-[var(--dash-quiet)]">{note}</span>
    </span>
  )
}

function ManageSkeleton({ rows, label }: { rows: number; label: string }) {
  return (
    <ul aria-busy="true" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <li key={index} className="flex items-center gap-2 border-t border-[var(--dash-soft)] px-1 py-3 first:border-0">
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="dash-skeleton h-3.5 w-36 max-w-full rounded" />
            <span className="dash-skeleton h-2.5 w-20 max-w-full rounded" />
          </span>
          <span className="dash-skeleton size-8 rounded-lg" />
          <span className="dash-skeleton size-8 rounded-lg" />
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ name form */

/**
 * One name field, for adding and for renaming a stage, a source or a reason.
 * Quiet until the first submit, then checked as the owner types; a name the
 * server refuses (`NAME_TAKEN`, most often) is said under the field itself.
 */
function NameForm({
  id,
  label,
  placeholder,
  initial = '',
  submitLabel,
  emptyMessage,
  onSave,
  onCancel,
}: {
  id: string
  label: string
  placeholder: string
  initial?: string
  submitLabel: string
  emptyMessage: string
  /** Throws to keep the form open with the server's sentence. */
  onSave: (name: string) => Promise<void>
  /** Present when renaming: Escape and Cancel close the field. */
  onCancel?: () => void
}) {
  const [serverError, setServerError] = useState<string | null>(null)
  const renaming = Boolean(onCancel)

  const form = useForm({
    defaultValues: { name: initial },
    validationLogic: revalidateLogic({ mode: 'submit', modeAfterSubmission: 'change' }),
    validators: {
      onDynamic: ({ value }) => {
        const error = nameError(value.name, emptyMessage)

        return error ? { fields: { name: error } } : undefined
      },
    },
    onSubmitInvalid: () => document.getElementById(id)?.focus(),
    onSubmit: async ({ value, formApi }) => {
      const name = value.name.trim()

      setServerError(null)

      // An unchanged rename has nothing to send.
      if (onCancel && name === initial) {
        onCancel()

        return
      }

      try {
        await onSave(name)

        // Adding stays open for the next one; a rename has already closed itself.
        if (!renaming) {
          formApi.reset({ name: '' })
          document.getElementById(id)?.focus()
        }
      } catch (caught) {
        setServerError(serverFieldErrors(caught).name ?? failureText(caught))
        document.getElementById(id)?.focus()
      }
    },
  })

  return (
    <form
      noValidate
      className="flex flex-col gap-1.5"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        // Enter pressed twice while the first save is still out sends nothing more.
        if (!form.state.isSubmitting) void form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {(field) => {
          const error = (field.state.meta.errors[0] as string | undefined) ?? serverError ?? undefined

          return (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={id} className="sr-only">
                  {label}
                </label>
                <input
                  id={id}
                  className={cn('dash-field h-9 min-w-0 flex-1 px-3 text-[13px]', !renaming && 'sm:max-w-[320px]')}
                  placeholder={placeholder}
                  value={field.state.value}
                  autoComplete="off"
                  autoFocus={renaming}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${id}-error` : undefined}
                  onBlur={field.handleBlur}
                  onChange={(event) => {
                    setServerError(null)
                    field.handleChange(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && onCancel) {
                      event.stopPropagation()
                      onCancel()
                    }
                  }}
                />
                <span className="flex gap-2">
                  <form.Subscribe selector={(state) => state.isSubmitting}>
                    {(submitting) => (
                      <button type="submit" className="dash-btn dash-btn-quiet h-9 text-[12.5px]" disabled={submitting}>
                        {submitting ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        ) : renaming ? null : (
                          <Plus className="size-3.5" aria-hidden="true" />
                        )}
                        {submitLabel}
                      </button>
                    )}
                  </form.Subscribe>
                  {onCancel ? (
                    <button type="button" className="dash-btn dash-btn-ghost h-9 text-[12.5px]" onClick={onCancel}>
                      Cancel
                    </button>
                  ) : null}
                </span>
              </div>
              {error ? (
                <span id={`${id}-error`} className="text-[12px] text-[var(--dash-red-ink)]">
                  {error}
                </span>
              ) : null}
            </>
          )
        }}
      </form.Field>
    </form>
  )
}

/**
 * Renaming inline, with focus handed back to the pencil that opened it —
 * whether the owner saved, cancelled or pressed Escape.
 */
const useRenaming = () => {
  const [renaming, setRenaming] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const returning = useRef(false)

  useEffect(() => {
    if (!renaming && returning.current) {
      returning.current = false
      button.current?.focus()
    }
  }, [renaming])

  return {
    renaming,
    button,
    open: () => setRenaming(true),
    close: () => {
      returning.current = true
      setRenaming(false)
    },
  }
}

/* --------------------------------------------------------------------- stages */

type Direction = 'up' | 'down'

function StageRow({
  stage,
  index,
  count,
  moving,
  onMove,
  onGone,
}: {
  stage: LeadStage
  index: number
  count: number
  moving: { id: string; dir: Direction } | null
  onMove: (stage: LeadStage, dir: Direction) => void
  onGone: () => void
}) {
  const rename = usePatchStage()
  const remove = useDeleteStage()
  const resync = useResync()
  const { renaming, button, open, close } = useRenaming()
  const [message, setMessage] = useState<Message | null>(null)
  const custom = stage.kind === 'custom'
  const inUse = stage.leadCount > 0

  if (renaming) {
    return (
      <li className={ROW}>
        <NameForm
          id={`stage-rename-${stage.id}`}
          label={`New name for ${stage.name}`}
          placeholder={stage.name}
          initial={stage.name}
          submitLabel="Save"
          emptyMessage="Enter a name for the stage"
          onCancel={close}
          onSave={async (name) => {
            await rename.mutateAsync({ id: stage.id, name })
            notify.success('Stage renamed everywhere')
            close()
          }}
        />
      </li>
    )
  }

  const erase = async () => {
    if (remove.isPending) return

    if (inUse) {
      setMessage({
        tone: 'info',
        text: `${stage.leadCount === 1 ? 'One lead is' : `${stage.leadCount} leads are`} in ${stage.name}. Move ${stage.leadCount === 1 ? 'it' : 'them'} to another stage first.`,
      })

      return
    }

    setMessage(null)

    try {
      await remove.mutateAsync(stage.id)
      notify.success(`${stage.name} deleted`)
      onGone()
    } catch (caught) {
      setMessage({ tone: 'error', text: failureText(caught) })
      resync(caught)
    }
  }

  const arrow = (dir: Direction) => {
    const busy = moving?.id === stage.id && moving.dir === dir
    const atEnd = dir === 'up' ? index === 0 : index === count - 1
    const Icon = dir === 'up' ? ChevronUp : ChevronDown

    return (
      <button
        id={`stage-${stage.id}-${dir}`}
        type="button"
        className={ICON_BTN}
        aria-label={`Move ${stage.name} ${dir}`}
        title={dir === 'up' ? 'Move up' : 'Move down'}
        disabled={atEnd}
        aria-disabled={!atEnd && moving ? true : undefined}
        onClick={() => onMove(stage, dir)}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Icon className="size-3.5" aria-hidden="true" />
        )}
      </button>
    )
  }

  return (
    <li className={ROW}>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <RowText
          name={stage.name}
          note={custom ? leadsWord(stage.leadCount) : `Permanent · ${leadsWord(stage.leadCount)}`}
        />
        {arrow('up')}
        {arrow('down')}
        {custom ? (
          <>
            <button
              ref={button}
              type="button"
              className={ICON_BTN}
              aria-label={`Rename ${stage.name}`}
              title="Rename"
              onClick={() => {
                setMessage(null)
                open()
              }}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className={ICON_BTN}
              aria-label={inUse ? `Delete ${stage.name} — move its leads first` : `Delete ${stage.name}`}
              title={inUse ? 'Move its leads first' : 'Delete'}
              aria-disabled={inUse || remove.isPending ? true : undefined}
              onClick={() => void erase()}
            >
              {remove.isPending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </>
        ) : (
          <LockSlot wide />
        )}
      </div>
      <RowMessage message={message} />
    </li>
  )
}

function FixedStageRow({ name, note }: { name: string; note: string }) {
  return (
    <li className={ROW}>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <RowText name={name} note={note} />
        <LockSlot />
      </div>
    </li>
  )
}

function StagesPanel() {
  const stages = useStages()
  const create = useCreateStage()
  const move = usePatchStage()
  const resync = useResync()
  const [moving, setMoving] = useState<{ id: string; dir: Direction } | null>(null)
  const [moveFailure, setMoveFailure] = useState<string | null>(null)
  const inFlight = useRef(false)
  const list = useRef<HTMLUListElement>(null)

  // After a move the row sits somewhere new, and at the top or the bottom the
  // arrow just pressed is disabled. Keep the owner's place: the same arrow if
  // it still works, the other one if not.
  const refocus = (id: string, dir: Direction) =>
    window.requestAnimationFrame(() => {
      const same = document.getElementById(`stage-${id}-${dir}`) as HTMLButtonElement | null
      const other = document.getElementById(`stage-${id}-${dir === 'up' ? 'down' : 'up'}`) as HTMLButtonElement | null

      ;(same && !same.disabled ? same : other)?.focus()
    })

  const shift = async (stage: LeadStage, dir: Direction) => {
    // One move at a time: two quick presses must not race each other's order.
    // The ref, not the state, is the guard — it holds before React re-renders.
    if (inFlight.current || stage.position === null) return

    inFlight.current = true
    setMoving({ id: stage.id, dir })
    setMoveFailure(null)

    try {
      await move.mutateAsync({ id: stage.id, position: stage.position + (dir === 'up' ? -1 : 1) })
      notify.success(`${stage.name} moved ${dir}`)
    } catch (caught) {
      setMoveFailure(failureText(caught))
      resync(caught)
    } finally {
      inFlight.current = false
      setMoving(null)
      refocus(stage.id, dir)
    }
  }

  if (stages.isError) {
    return (
      <LoadFailure
        title="The stages could not be loaded"
        message={loadMessage(stages.error)}
        onRetry={() => void stages.refetch()}
      />
    )
  }

  if (stages.isPending) return <ManageSkeleton rows={6} label="Loading stages" />

  const first = stages.data.find((stage) => stage.kind === 'new')
  const won = stages.data.find((stage) => stage.kind === 'won')
  const lost = stages.data.find((stage) => stage.kind === 'lost')
  const active = stages.data
    .filter((stage) => stage.kind === 'contacted' || stage.kind === 'custom')
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  return (
    <div className="flex flex-col gap-2.5">
      {moveFailure ? (
        <p role="alert" className="dash-tone-red mt-2 rounded-lg px-3 py-2 text-[12.5px]">
          {moveFailure}
        </p>
      ) : null}

      <ul ref={list} tabIndex={-1} aria-label="Stages, in order" className="outline-none">
        {first ? <FixedStageRow name={first.name} note="Always first" /> : null}
        {active.map((stage, index) => (
          <StageRow
            key={stage.id}
            stage={stage}
            index={index}
            count={active.length}
            moving={moving}
            onMove={(target, dir) => void shift(target, dir)}
            onGone={() => list.current?.focus()}
          />
        ))}
        {won ? (
          <FixedStageRow name={won.name} note="Always after the active stages · creates or links a client" />
        ) : null}
        {lost ? <FixedStageRow name={lost.name} note="Always last · asks for a reason" /> : null}
      </ul>

      <NameForm
        id="stage-new"
        label="New stage name"
        placeholder="New stage, e.g. Meeting booked"
        submitLabel="Add stage"
        emptyMessage="Enter a name for the stage"
        onSave={async (name) => {
          await create.mutateAsync(name)
          notify.success(`${name} added`)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------- sources and reasons */

function ChoiceRow({ kind, choice, onGone }: { kind: ChoiceKind; choice: LeadChoice; onGone: () => void }) {
  const patch = usePatchChoice()
  const remove = useDeleteChoice()
  const resync = useResync()
  const { renaming, button, open, close } = useRenaming()
  const [message, setMessage] = useState<Message | null>(null)
  const words = WORDS[kind]
  const inUse = choice.leadCount > 0
  const busy = patch.isPending || remove.isPending
  const hiding = patch.isPending && patch.variables?.hidden !== undefined

  if (renaming) {
    return (
      <li className={ROW}>
        <NameForm
          id={`${kind}-rename-${choice.id}`}
          label={`New name for ${choice.name}`}
          placeholder={choice.name}
          initial={choice.name}
          submitLabel="Save"
          emptyMessage={words.empty}
          onCancel={close}
          onSave={async (name) => {
            await patch.mutateAsync({ kind, id: choice.id, name })
            notify.success(`${words.title} renamed everywhere`)
            close()
          }}
        />
      </li>
    )
  }

  if (choice.locked) {
    return (
      <li className={ROW}>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <RowText name={choice.name} note="Built in — cannot be changed" />
          <LockSlot />
        </div>
      </li>
    )
  }

  const toggle = async () => {
    if (busy) return

    setMessage(null)

    try {
      const saved = await patch.mutateAsync({ kind, id: choice.id, hidden: !choice.hidden })

      notify.success(saved.hidden ? `${saved.name} hidden from new choices` : `${saved.name} shown in choices again`)
    } catch (caught) {
      setMessage({ tone: 'error', text: failureText(caught) })
      resync(caught)
    }
  }

  const erase = async () => {
    if (busy) return

    if (inUse) {
      setMessage({
        tone: 'info',
        text: `${choice.leadCount === 1 ? 'One lead uses' : `${choice.leadCount} leads use`} this ${words.one}. Hide it instead — the leads keep it.`,
      })

      return
    }

    setMessage(null)

    try {
      await remove.mutateAsync({ kind, id: choice.id })
      notify.success(`${choice.name} deleted`)
      onGone()
    } catch (caught) {
      setMessage({ tone: 'error', text: failureText(caught) })
      resync(caught)
    }
  }

  return (
    <li className={ROW}>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <RowText name={choice.name} note={leadsWord(choice.leadCount)} />
        {choice.hidden ? <StatusChip tone="outline">Hidden</StatusChip> : null}
        <button
          ref={button}
          type="button"
          className={ICON_BTN}
          aria-label={`Rename ${choice.name}`}
          title="Rename"
          aria-disabled={busy ? true : undefined}
          onClick={() => {
            if (busy) return

            setMessage(null)
            open()
          }}
        >
          <Pencil className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={ICON_BTN}
          aria-label={choice.hidden ? `Show ${choice.name} in choices again` : `Hide ${choice.name} from new choices`}
          title={choice.hidden ? 'Show in choices again' : 'Hide from new choices'}
          aria-disabled={busy ? true : undefined}
          onClick={() => void toggle()}
        >
          {hiding ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : choice.hidden ? (
            <Eye className="size-3.5" aria-hidden="true" />
          ) : (
            <EyeOff className="size-3.5" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className={ICON_BTN}
          aria-label={inUse ? `Delete ${choice.name} — in use, hide it instead` : `Delete ${choice.name}`}
          title={inUse ? 'In use — hide it instead' : 'Delete'}
          aria-disabled={inUse || busy ? true : undefined}
          onClick={() => void erase()}
        >
          {remove.isPending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </div>
      <RowMessage message={message} />
    </li>
  )
}

function ChoicesPanel({ kind }: { kind: ChoiceKind }) {
  const words = WORDS[kind]
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const create = useCreateChoice()
  const list = useRef<HTMLUListElement>(null)
  const searchField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim())
      setPage(1)
    }, 200)

    return () => window.clearTimeout(timer)
  }, [search])

  const choices = useChoices(kind, { page, pageSize: CHOICE_PAGE_SIZE, search: debounced })
  const items = choices.data?.items ?? []

  // The server clamps a page past the end (its last choice was just deleted);
  // follow it. Placeholder data is the previous page's, not an answer yet.
  useEffect(() => {
    if (choices.data && !choices.isPlaceholderData && choices.data.page !== page) setPage(choices.data.page)
  }, [choices.data, choices.isPlaceholderData, page])

  // A deleted row takes the focused button with it; land somewhere sensible.
  const landFocus = () => window.requestAnimationFrame(() => (list.current ?? searchField.current)?.focus())

  return (
    <>
      <div className="dash-panel flex flex-col gap-2.5 px-4 pt-3 pb-4 sm:px-[18px]">
        <label className="relative">
          <span className="sr-only">{words.search}</span>
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--dash-quiet)]"
            aria-hidden="true"
          />
          <input
            ref={searchField}
            type="search"
            className="dash-field h-9 w-full ps-9 pe-3 text-[13px] sm:max-w-[320px]"
            placeholder={words.search}
            value={search}
            maxLength={LEAD_LIMITS.choiceName}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        {choices.isError ? (
          <LoadFailure
            title={`The ${words.many} could not be loaded`}
            message={loadMessage(choices.error)}
            onRetry={() => void choices.refetch()}
          />
        ) : choices.isPending ? (
          <ManageSkeleton rows={6} label={`Loading ${words.many}`} />
        ) : items.length === 0 ? (
          <EmptyState title={debounced ? `No ${words.one} matches “${debounced}”` : `No ${words.many} yet`}>
            {debounced ? 'Try fewer letters, or add it below.' : 'Add the first one below.'}
          </EmptyState>
        ) : (
          <ul ref={list} tabIndex={-1} aria-label={words.many} aria-busy={choices.isFetching} className="outline-none">
            {items.map((choice) => (
              <ChoiceRow key={choice.id} kind={kind} choice={choice} onGone={landFocus} />
            ))}
          </ul>
        )}

        <NameForm
          id={`${kind}-new`}
          label={words.add}
          placeholder={words.add}
          submitLabel="Add"
          emptyMessage={words.empty}
          onSave={async (name) => {
            await create.mutateAsync({ kind, name })
            notify.success(`${name} added`)
          }}
        />
      </div>

      {choices.data ? (
        <Pager
          page={choices.data.page}
          pageCount={choices.data.pageCount}
          total={choices.data.total}
          noun={[words.one, words.many]}
          onPage={setPage}
        />
      ) : null}
    </>
  )
}

/* --------------------------------------------------------------------- niches */

function NichesPanel() {
  const [managing, setManaging] = useState(false)

  return (
    <div className="dash-panel flex flex-col items-start gap-3 px-4 py-4 sm:px-[18px]">
      <p className="max-w-[62ch] text-[13px] leading-relaxed text-[var(--dash-quiet)]">
        Niches — salon, plumbers, roofers — are one list shared with Clients, so a change here shows on both. Renaming a
        niche renames it on every lead and client. Hiding keeps it on the ones that have it but takes it out of new
        choices. Only an unused niche can be deleted.
      </p>
      <button type="button" className="dash-btn dash-btn-quiet" onClick={() => setManaging(true)}>
        <Tags className="size-4" aria-hidden="true" />
        Manage niches
      </button>
      {managing ? <NicheManager onClose={() => setManaging(false)} /> : null}
    </div>
  )
}

/* ----------------------------------------------------------------------- page */

/**
 * Real tabs: one stop in the Tab order, arrows and Home/End between them, and
 * the choice follows focus — each list is one quick read, so there is nothing
 * to lose by showing it straight away.
 */
function ListsTabs({ tab, onChoose }: { tab: ListsTab; onChoose: (tab: ListsTab) => void }) {
  const buttons = useRef<Partial<Record<ListsTab, HTMLButtonElement | null>>>({})

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1
    const next =
      event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null

    if (next === null) return

    event.preventDefault()

    const target = TABS[next]!

    buttons.current[target.value]?.focus()
    onChoose(target.value)
  }

  return (
    <div role="tablist" aria-label="Lists" className="flex gap-1 overflow-x-auto border-b border-[var(--dash-line)]">
      {TABS.map((item, index) => {
        const on = item.value === tab

        return (
          <button
            key={item.value}
            ref={(element) => {
              buttons.current[item.value] = element
            }}
            id={`lists-tab-${item.value}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls="lists-panel"
            tabIndex={on ? 0 : -1}
            onClick={() => onChoose(item.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              '-mb-px h-9 shrink-0 border-b-2 px-3 text-[13px] whitespace-nowrap',
              on
                ? 'border-[var(--dash-ink)] font-semibold text-[var(--dash-ink)]'
                : 'border-transparent font-medium text-[var(--dash-quiet)] hover:text-[var(--dash-ink)]',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

export function LeadListsPage({ tab }: { tab: ListsTab }) {
  const navigate = useNavigate()

  // Replace, not push: stepping through the tabs with the arrows should not
  // fill the Back button with every list on the way.
  const choose = (next: ListsTab) => {
    if (next === tab) return

    void navigate({
      to: '/dashboard/leads/lists',
      search: { tab: next === 'stages' ? undefined : next },
      replace: true,
    })
  }

  return (
    <DashboardPage className="gap-5">
      <PageHead
        eyebrow="PIPELINE"
        title="Stages & lists"
        description="Hiding keeps a choice on the leads that have it, but takes it out of new choices. Only unused ones can be deleted."
        actions={
          <Link to="/dashboard/leads" className="dash-btn dash-btn-quiet">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Leads
          </Link>
        }
      />

      <div className="flex flex-col gap-4">
        <ListsTabs tab={tab} onChoose={choose} />

        <div role="tabpanel" id="lists-panel" aria-labelledby={`lists-tab-${tab}`} className="flex flex-col gap-4">
          {tab === 'stages' ? (
            <div className="dash-panel px-4 pt-2 pb-4 sm:px-[18px]">
              <StagesPanel />
            </div>
          ) : tab === 'niches' ? (
            <NichesPanel />
          ) : (
            <ChoicesPanel key={tab} kind={tab === 'sources' ? 'sources' : 'loss-reasons'} />
          )}
        </div>
      </div>
    </DashboardPage>
  )
}
