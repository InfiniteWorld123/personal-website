import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type SyntheticEvent,
} from 'react'
import { Link } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import {
  type Active,
  type Announcements,
  type CollisionDetection,
  DndContext,
  type DragCancelEvent,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardCode,
  type KeyboardCoordinateGetter,
  KeyboardSensor,
  type Over,
  PointerSensor,
  type PointerSensorOptions,
  type ScreenReaderInstructions,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { GripVertical, Loader2 } from 'lucide-react'
import type { LeadStage, OwnerLeadListItem } from '#/backend2/contracts/lead.contract'
import type { Page } from '#/backend2/contracts/pagination.contract'
import { ApiRequestError } from '#/frontend/api/response'
import { listLeads } from '#/frontend/features/leads-v2/api'
import { isTerminal } from '#/frontend/features/leads-v2/lead-form'
import { leadKeys, useStages } from '#/frontend/features/leads-v2/queries'
import { useStageMove } from '#/frontend/features/leads-v2/useStageMove'
import { cn } from '#/frontend/lib/utils'
import { FollowUpPill, LoadFailure } from './lead-parts'

/**
 * The Board: the active leads as stage columns, as approved in the Leads
 * Design Lab (23 Sep 2026), with `@dnd-kit` in place of Swapy — the owner's
 * choice, because a swap library can only move a card by swapping it.
 *
 * Dragging moves the dragged lead and nothing else: there is no card order to
 * keep, only a stage to change. Every move goes through `useStageMove`, the
 * same path as the List and the lead's file, so Lost still asks why and Won
 * still asks about the Client. The card waits in its new column while the
 * server decides, and goes back if it refuses or the owner cancels.
 *
 * Each column reads its own pages from the server. Won and Lost are places
 * to drop a lead, not to browse: their two newest, and a link to the list.
 */

/** A column's page. The Board never asks for a whole stage at once. */
const COLUMN_PAGE = 10

/** Won and Lost show this many, newest first; the rest live in their own lists. */
const TERMINAL_SHOWN = 2

/** A little more than is shown, so a card leaving Won or Lost is replaced before the refresh arrives. */
const TERMINAL_FETCH = TERMINAL_SHOWN + 2

const columnId = (stageId: string) => `column:${stageId}`

type CardData = { lead: OwnerLeadListItem }
type ColumnData = { stage: LeadStage }

const leadOf = (active: Active | null) => (active?.data.current as CardData | undefined)?.lead
const stageOf = (over: Over | null) => (over?.data.current as ColumnData | undefined)?.stage

/** A move on its way to the server. `token` tells a newer move of the same lead from an older one. */
type Landing = { lead: OwnerLeadListItem; to: LeadStage; token: number }

/** How a move was asked for: the card's "Move to…" menu, or a drop lifted by the keyboard or by a pointer. */
type Via = 'menu' | 'keyboard' | 'pointer'

/** Where focus goes once a move has settled: a control on the lead's card, or the heading of the column it is in. */
type Refocus = { leadId: string; control: 'grip' | 'menu'; stageId: string }

/** dnd-kit hands over the event that lifted the card; a key press means the owner is on the keyboard. */
const liftedByKeyboard = (activatorEvent: Event | null) => activatorEvent instanceof KeyboardEvent

/** Read once by every card's "Move to…" menu, so a keyboard knows a choice waits to be confirmed. */
const MOVE_HINT = 'leads-board-move-hint'

/** Anything the server answered on purpose is taken at its word, as everywhere else in Leads. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

/** The server's own order: newest first, the id breaking ties. */
const newestFirst = (a: OwnerLeadListItem, b: OwnerLeadListItem) =>
  Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const failureMessage = (error: unknown): string => {
  if (error instanceof ApiRequestError && error.status === 401) return 'You are signed out. Sign in again, then reload.'
  if (error instanceof ApiRequestError && error.status === 403) return 'This account cannot see leads.'

  return 'The server did not answer. Nothing has been changed. Check your connection, then try again.'
}

/* ------------------------------------------------------------------ sensors */

/**
 * The pointer sensor for a mouse or a pen only. A finger belongs to the touch
 * sensor, which waits for a short hold — otherwise a swipe to scroll the
 * board sideways would pick up whichever card it started on.
 */
class MouseOrPenSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent: event }: ReactPointerEvent, { onActivation }: PointerSensorOptions) => {
        if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return false

        onActivation?.({ event })

        return true
      },
    },
  ]
}

/** A click stays a click: the card lifts only after 6px of travel. */
const POINTER = { activationConstraint: { distance: 6 } }

/** A tap opens the lead, a swipe scrolls; a short hold picks the card up. */
const TOUCH = { activationConstraint: { delay: 200, tolerance: 6 } }

/**
 * Arrow keys carry a lifted card a whole column left or right, in stage
 * order, instead of 25 pixels at a time. Up and down do nothing: a column has
 * no order to choose from, and the page must not scroll under the card.
 */
const neighbourColumn =
  (order: { current: string[] }): KeyboardCoordinateGetter =>
  (event, { context }) => {
    const step = event.code === KeyboardCode.Right ? 1 : event.code === KeyboardCode.Left ? -1 : 0

    if (event.code === KeyboardCode.Up || event.code === KeyboardCode.Down) event.preventDefault()
    if (step === 0) return undefined

    event.preventDefault()

    const { collisionRect, droppableRects, over, active } = context

    if (!collisionRect) return undefined

    const from = over ? String(over.id) : columnId(leadOf(active)?.stage.id ?? '')
    const index = order.current.indexOf(from)
    const next = index === -1 ? undefined : order.current[index + step]
    const rect = next ? droppableRects.get(next) : undefined

    if (!rect) return undefined

    // Just under the column's heading, so the card is plainly inside it.
    return { x: rect.left + (rect.width - collisionRect.width) / 2, y: rect.top + 36 }
  }

/** Under the pointer when there is one; otherwise — the keyboard — the column the card overlaps most. */
const detectColumn: CollisionDetection = (args) => {
  const within = pointerWithin(args)

  return within.length > 0 ? within : rectIntersection(args)
}

/* ------------------------------------------------------------ announcements */

/**
 * What a screen reader hears. The card starts over its own column, and saying
 * so straight away would talk over "Picked up…" — so a column is named only
 * once the card has left the one it came from.
 */
const makeAnnouncements = (): Announcements => {
  let wandered = false

  return {
    onDragStart: ({ active }) => {
      const lead = leadOf(active)

      wandered = false

      return lead ? `Picked up ${lead.name} from ${lead.stage.name}.` : undefined
    },
    onDragOver: ({ active, over }) => {
      const lead = leadOf(active)
      const stage = stageOf(over)

      if (!lead) return undefined
      if (stage?.id === lead.stage.id) return wandered ? `${lead.name} is back over ${stage.name}.` : undefined

      wandered = true

      return stage ? `${lead.name} is over ${stage.name}.` : `${lead.name} is not over a stage.`
    },
    onDragEnd: ({ active, over }) => {
      const lead = leadOf(active)
      const stage = stageOf(over)

      if (!lead) return undefined
      if (!stage || stage.id === lead.stage.id) return `${lead.name} was put back. It stays in ${lead.stage.name}.`
      if (isTerminal(stage.kind)) return `${lead.name} dropped on ${stage.name}. Confirm the move in the dialog.`

      return `${lead.name} moved to ${stage.name}.`
    },
    onDragCancel: ({ active }) => {
      const lead = leadOf(active)

      return lead ? `Move cancelled. ${lead.name} stays in ${lead.stage.name}.` : undefined
    },
  }
}

const instructions: ScreenReaderInstructions = {
  draggable:
    'To move this lead, press Space or Enter to pick it up. Use the left and right arrow keys to choose another stage, then press Space or Enter to drop it there, or Escape to cancel. The Move to menu on each card does the same.',
}

/** Motion is decoration here: with reduced motion the lifted card simply lands. */
const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)

    update()
    query.addEventListener('change', update)

    return () => query.removeEventListener('change', update)
  }, [])

  return reduced
}

/* -------------------------------------------------------------------- board */

export function LeadsBoard({ onOpen }: { onOpen: (id: string) => void }) {
  const stages = useStages()
  const { request, dialog, savingId } = useStageMove()
  const [landings, setLandings] = useState<Record<string, Landing>>({})
  const [lifted, setLifted] = useState<OwnerLeadListItem | null>(null)
  const [status, setStatus] = useState('')
  const [refocus, setRefocus] = useState<Refocus | null>(null)
  const token = useRef(0)
  const reduced = useReducedMotion()
  const announcements = useMemo(makeAnnouncements, [])

  const order = useRef<string[]>([])
  order.current = (stages.data ?? []).map((stage) => columnId(stage.id))

  const keyboard = useMemo(() => ({ coordinateGetter: neighbourColumn(order) }), [])
  const sensors = useSensors(
    useSensor(MouseOrPenSensor, POINTER),
    useSensor(TouchSensor, TOUCH),
    useSensor(KeyboardSensor, keyboard),
  )

  /**
   * Focus, put back where the owner can carry on. A move takes the focused
   * control with it: the card is drawn anew in another column, and a Won or
   * Lost dialog hands focus back to nothing, because what opened it is gone.
   * This runs after the commit that settled the move, when the card's
   * controls are drawn and enabled again, and focuses the same control on
   * the card — or its column's heading when the card is not shown, as in Won
   * and Lost, which show only their two newest. Only focus that was dropped
   * is put back: the owner may have gone on elsewhere while the server
   * answered.
   *
   * It replaces dnd-kit's own focus return (`restoreFocus: false` below).
   * That one focused the card in its new column straight away — behind the
   * Won or Lost dialog, so Tab walked the page under it — and on a card that
   * then went back to where it was, which left focus on nothing.
   */
  useEffect(() => {
    if (!refocus) return

    const active = document.activeElement

    if (!active || active === document.body) {
      const control = document.getElementById(`${refocus.control === 'menu' ? 'move' : 'grip'}-${refocus.leadId}`)

      ;(control ?? document.getElementById(`board-column-${refocus.stageId}`))?.focus()
    }

    setRefocus(null)
  }, [refocus])

  /**
   * One move, from a drop or from the "Move to…" menu. The card shows in its
   * new column at once; when the answer comes the server's pages have already
   * been re-read, so the stand-in is simply dropped — and on a refusal or a
   * cancelled dialog, that puts the card back where it was. Focus follows the
   * card once it has settled; see `refocus`.
   */
  const move = async (lead: OwnerLeadListItem, to: LeadStage, via: Via) => {
    if (lead.stage.id === to.id) return

    const mine = ++token.current

    setStatus('')
    setLandings((current) => ({ ...current, [lead.id]: { lead, to, token: mine } }))

    // A keyboard drop on an active column: focus goes with the card at once, while the server decides.
    if (via === 'keyboard' && !isTerminal(to.kind)) setRefocus({ leadId: lead.id, control: 'grip', stageId: to.id })

    const outcome = await request(lead, to)

    setLandings((current) =>
      current[lead.id]?.token === mine
        ? Object.fromEntries(Object.entries(current).filter(([id]) => id !== lead.id))
        : current,
    )

    if (outcome === 'failed') setStatus(`${lead.name} was not moved. It is back in ${lead.stage.name}.`)
    if (outcome === 'cancelled') setStatus(`${lead.name} stays in ${lead.stage.name}.`)

    // A mouse or finger dropping on an active column is left alone, as dnd-kit would. The menu, the
    // keyboard and a Won or Lost dialog all had focus on a control that has since gone.
    if (via !== 'pointer' || isTerminal(to.kind)) {
      setRefocus({
        leadId: lead.id,
        control: via === 'menu' ? 'menu' : 'grip',
        stageId: outcome === 'moved' ? to.id : lead.stage.id,
      })
    }
  }

  const onDragStart = ({ active }: DragStartEvent) => setLifted(leadOf(active) ?? null)

  const onDragEnd = ({ active, over, activatorEvent }: DragEndEvent) => {
    setLifted(null)

    const lead = leadOf(active)
    const to = stageOf(over)
    const keyboard = liftedByKeyboard(activatorEvent)

    if (lead && to && to.id !== lead.stage.id) void move(lead, to, keyboard ? 'keyboard' : 'pointer')
    // Put back where it was: the grip normally still has focus, and this only makes sure of it.
    else if (lead && keyboard) setRefocus({ leadId: lead.id, control: 'grip', stageId: lead.stage.id })
  }

  const onDragCancel = ({ active, activatorEvent }: DragCancelEvent) => {
    setLifted(null)

    const lead = leadOf(active)

    if (lead && liftedByKeyboard(activatorEvent)) {
      setRefocus({ leadId: lead.id, control: 'grip', stageId: lead.stage.id })
    }
  }

  const list = stages.data

  // Only when the stages were never read. A later failure — a refresh after a
  // move, or on returning to the window — keeps the board, its loaded columns
  // and any open dialog, and says the stages may be out of date.
  if (list === undefined && stages.isError) {
    return (
      <section className="dash-panel" aria-label="Board">
        <LoadFailure
          title="The board could not be loaded"
          message={failureMessage(stages.error)}
          onRetry={() => void stages.refetch()}
        />
      </section>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {stages.isRefetchError ? (
        <p role="alert" className="flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--dash-red-ink)]">
          The stages may be out of date.
          <button type="button" className="font-semibold underline" onClick={() => void stages.refetch()}>
            Refresh
          </button>
        </p>
      ) : null}

      <DndContext
        id="leads-board"
        sensors={sensors}
        collisionDetection={detectColumn}
        accessibility={{ announcements, screenReaderInstructions: instructions, restoreFocus: false }}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="overflow-x-auto pb-1.5">
          <div
            className="grid min-w-min auto-cols-[260px] grid-flow-col items-start gap-3 sm:auto-cols-[minmax(230px,1fr)]"
            aria-busy={list === undefined || undefined}
          >
            {list === undefined ? <p className="sr-only">Loading the board…</p> : null}
            {list === undefined
              ? Array.from({ length: 4 }, (_, index) => <ColumnSkeleton key={index} />)
              : list.map((stage) => (
                  <BoardColumn
                    key={stage.id}
                    stage={stage}
                    stages={list}
                    landings={landings}
                    savingId={savingId}
                    lifted={lifted}
                    onMove={(lead, to) => void move(lead, to, 'menu')}
                    onOpen={onOpen}
                  />
                ))}
          </div>
        </div>

        <DragOverlay dropAnimation={reduced ? null : undefined}>
          {lifted ? <CardFace lead={lifted} /> : null}
        </DragOverlay>
      </DndContext>

      <p className="text-[12px] text-[var(--dash-quiet)]">
        Drag a card to another column, or use its “Move to…” menu. On a phone, hold a card for a moment before dragging.
        Won and Lost show their two newest; the rest live in their own lists.
      </p>

      <p role="status" className="sr-only">
        {status}
      </p>

      <p id={MOVE_HINT} hidden>
        Choose a stage, then press Enter or the Move button. A stage picked with a mouse or a finger moves the lead at
        once.
      </p>

      {dialog}
    </div>
  )
}

/* ------------------------------------------------------------------- column */

function BoardColumn({
  stage,
  stages,
  landings,
  savingId,
  lifted,
  onMove,
  onOpen,
}: {
  stage: LeadStage
  stages: LeadStage[]
  landings: Record<string, Landing>
  savingId: string | null
  lifted: OwnerLeadListItem | null
  onMove: (lead: OwnerLeadListItem, to: LeadStage) => void
  onOpen: (id: string) => void
}) {
  const terminal = isTerminal(stage.kind)
  const view = stage.kind === 'won' ? 'won' : stage.kind === 'lost' ? 'lost' : 'active'

  // Keyed under `leadKeys.all`, so every lead write — here or on any other screen — re-reads the column.
  const column = useInfiniteQuery({
    queryKey: [...leadKeys.all, 'board', stage.id],
    queryFn: ({ pageParam }) =>
      listLeads({ stage: stage.id, view, page: pageParam, pageSize: terminal ? TERMINAL_FETCH : COLUMN_PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last: Page<OwnerLeadListItem>) => (!terminal && last.hasMore ? last.page + 1 : undefined),
    retry,
  })

  const { setNodeRef, isOver } = useDroppable({ id: columnId(stage.id), data: { stage } satisfies ColumnData })

  // A lead moved meanwhile can shift a later page onto an earlier one; show it once.
  const loaded = useMemo(() => {
    const seen = new Set<string>()

    return (column.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
  }, [column.data])

  const leaving = loaded.filter((item) => landings[item.id] && landings[item.id]!.to.id !== stage.id)
  const arriving = Object.values(landings)
    .filter((landing) => landing.to.id === stage.id && !loaded.some((item) => item.id === landing.lead.id))
    .map((landing) => landing.lead)
  const staying = leaving.length > 0 ? loaded.filter((item) => !leaving.includes(item)) : loaded
  // An active column keeps the server's order. Won and Lost show only their newest, so a card
  // dropped there waits on top, where the owner can see it while the dialog asks.
  const cards =
    arriving.length === 0 ? staying : terminal ? [...arriving, ...staying] : [...staying, ...arriving].sort(newestFirst)
  const shown = terminal ? cards.slice(0, TERMINAL_SHOWN) : cards

  const serverTotal = column.data?.pages[0]?.total ?? stage.leadCount
  const count = Math.max(0, serverTotal + arriving.length - leaving.length)
  const remaining = Math.max(0, serverTotal - loaded.length)

  // The column a card came from is not somewhere it can go.
  const target = isOver && lifted !== null && lifted.stage.id !== stage.id
  const titleId = `board-column-${stage.id}`

  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-labelledby={titleId}
      aria-busy={column.isFetching || undefined}
      className={cn(
        'flex min-h-[220px] min-w-0 flex-col gap-2 rounded-[12px] p-2.5',
        terminal ? 'border border-dashed border-[var(--dash-line)]' : 'bg-[var(--dash-furniture)]',
        target && 'ring-2 ring-[var(--dash-blue)]',
      )}
    >
      {/* Focusable from code only: where focus lands when a moved card is not shown here. */}
      <h2
        id={titleId}
        tabIndex={-1}
        className="flex items-center justify-between gap-2 px-1 pt-0.5 pb-1 text-[12.5px] font-bold"
      >
        <span className="truncate">{stage.name}</span>
        <span className="dash-num shrink-0 text-[11px] font-semibold text-[var(--dash-quiet)]">
          <span className="sr-only">, </span>
          {count}
          <span className="sr-only"> {count === 1 ? 'lead' : 'leads'}</span>
        </span>
      </h2>

      {column.isPending ? (
        <ul className="flex flex-col gap-2" aria-hidden="true">
          {Array.from({ length: terminal ? 1 : 3 }, (_, index) => (
            <CardSkeleton key={index} />
          ))}
        </ul>
      ) : column.data === undefined ? (
        // Only when nothing was ever read. A later failure keeps the cards already shown.
        <div className="[&>div]:gap-2 [&>div]:p-2">
          <LoadFailure
            title={`${stage.name} could not be loaded`}
            message={failureMessage(column.error)}
            onRetry={() => void column.refetch()}
          />
        </div>
      ) : shown.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {shown.map((lead) => (
            <BoardCard
              key={lead.id}
              lead={lead}
              stages={stages}
              landing={landings[lead.id]}
              saving={savingId === lead.id}
              onMove={onMove}
              onOpen={onOpen}
            />
          ))}
        </ul>
      ) : (
        <p className="sr-only">No leads in {stage.name}.</p>
      )}

      {/* The pointer's target. The whole column accepts a drop; this says so while a card is lifted. */}
      <div
        aria-hidden="true"
        className={cn(
          'grid min-h-[54px] place-items-center rounded-[10px] border-2 border-dashed text-[11.5px] text-[var(--dash-quiet)]',
          target
            ? 'border-[var(--dash-blue)] bg-[var(--dash-blue-tint)] text-[var(--dash-blue-ink)]'
            : lifted !== null || (column.data !== undefined && shown.length === 0)
              ? 'border-[var(--dash-line)]'
              : 'border-transparent',
        )}
      >
        Drop here
      </div>

      {!terminal && column.hasNextPage ? (
        <button
          type="button"
          className="rounded-lg p-1.5 text-[12px] font-semibold text-[var(--dash-blue-ink)] hover:bg-[var(--dash-hover)] disabled:text-[var(--dash-quiet)]"
          disabled={column.isFetchingNextPage}
          onClick={() => void column.fetchNextPage()}
        >
          {column.isFetchingNextPage ? 'Loading…' : `Load ${Math.min(COLUMN_PAGE, Math.max(1, remaining))} more`}
        </button>
      ) : null}

      {column.isFetchNextPageError ? (
        <p role="alert" className="px-1 text-[11.5px] text-[var(--dash-red-ink)]">
          More leads could not be loaded. Try again.
        </p>
      ) : column.isRefetchError ? (
        <p role="alert" className="flex flex-wrap items-center gap-x-2 px-1 text-[11.5px] text-[var(--dash-red-ink)]">
          This column may be out of date.
          <button type="button" className="font-semibold underline" onClick={() => void column.refetch()}>
            Refresh
          </button>
        </p>
      ) : null}

      {terminal && count > TERMINAL_SHOWN ? (
        <Link
          to="/dashboard/leads"
          search={{ view: stage.kind === 'won' ? 'won' : 'lost', layout: undefined, lead: undefined }}
          className="rounded-lg p-1.5 text-center text-[12px] font-semibold text-[var(--dash-blue-ink)] hover:bg-[var(--dash-hover)]"
        >
          See all {count} in the {stage.name} list
        </Link>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------------- card */

/** The menu is its own control: pressing, touching or typing in it never lifts the card. */
const keepToMenu = (event: SyntheticEvent) => event.stopPropagation()

function BoardCard({
  lead,
  stages,
  landing,
  saving,
  onMove,
  onOpen,
}: {
  lead: OwnerLeadListItem
  stages: LeadStage[]
  landing: Landing | undefined
  saving: boolean
  onMove: (lead: OwnerLeadListItem, to: LeadStage) => void
  onOpen: (id: string) => void
}) {
  const moving = landing !== undefined || saving
  const { setNodeRef, setActivatorNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: lead.id,
    data: { lead } satisfies CardData,
    disabled: moving,
  })

  // Dropped on Won or Lost and waiting for the dialog: not saving yet, only asking.
  const asking = landing !== undefined && !saving && isTerminal(landing.to.kind)

  /**
   * "Move to…" keeps the choice apart from the move. A closed select changes
   * its value on every arrow key (Chrome on Windows and Linux, Firefox) and
   * on every typed letter (everywhere), so saving on each change moved the
   * lead while the owner was only looking through the stages. A stage picked
   * from the open list with a mouse or a finger is a choice made on purpose
   * and still moves the lead at once, as approved; one reached by the
   * keyboard waits here until Enter or the Move button confirms it.
   */
  const [choice, setChoice] = useState('')
  const picking = useRef(false)
  const chosen = stages.find((stage) => stage.id === choice && stage.id !== lead.stage.id)

  const commit = (to: LeadStage) => {
    setChoice('')
    onMove(lead, to)
  }

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      aria-busy={saving || undefined}
      className={cn(
        'relative flex cursor-grab touch-manipulation flex-col gap-1.5 rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-surface)] px-[11px] py-2.5 select-none [-webkit-touch-callout:none]',
        isDragging && 'opacity-40',
        saving && 'opacity-55',
        asking && 'outline-2 outline-offset-2 outline-[var(--dash-blue)] outline-dashed',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        {/* The whole card opens the lead: the button's box is stretched over it. */}
        <button
          type="button"
          onClick={() => onOpen(lead.id)}
          data-lead-row={lead.id}
          className="min-w-0 text-start text-[13px] leading-snug font-semibold break-words after:absolute after:inset-0 after:rounded-[10px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--dash-blue)]"
        >
          {lead.name}
        </button>
        <button
          ref={setActivatorNodeRef}
          id={`grip-${lead.id}`}
          {...attributes}
          type="button"
          aria-label={`Drag ${lead.name} to another stage`}
          className="relative z-10 -me-1 -mt-0.5 grid size-6 shrink-0 cursor-grab place-items-center rounded-md text-[var(--dash-quiet)] hover:bg-[var(--dash-hover)] hover:text-[var(--dash-ink)]"
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <GripVertical className="size-3.5" aria-hidden="true" />
          )}
        </button>
      </div>

      <span className="truncate text-[11.5px] text-[var(--dash-quiet)]">{cardMeta(lead)}</span>

      {/* Wraps only when a waiting choice adds the Move button and the card is too narrow for it. */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <FollowUpPill followUp={lead.followUp} />
        <div
          className="relative z-10 ms-auto flex items-center gap-1"
          onPointerDown={keepToMenu}
          onTouchStart={keepToMenu}
          onKeyDown={keepToMenu}
        >
          <label className="sr-only" htmlFor={`move-${lead.id}`}>
            Move {lead.name} to
          </label>
          <select
            id={`move-${lead.id}`}
            className="dash-field h-[26px] max-w-[130px] rounded-[7px] px-1.5 text-[11.5px]"
            value={chosen ? chosen.id : ''}
            disabled={moving}
            aria-describedby={MOVE_HINT}
            // A press or a touch opens the list; what is picked there is picked on purpose.
            onPointerDown={() => {
              picking.current = true
            }}
            onKeyDown={(event) => {
              picking.current = false

              if (event.key === 'Enter' && chosen) {
                event.preventDefault()
                commit(chosen)
              } else if (event.key === 'Escape' && chosen) {
                setChoice('')
              }
            }}
            onChange={(event) => {
              const to = stages.find((stage) => stage.id === event.target.value)
              const picked = picking.current

              picking.current = false

              if (to && picked) commit(to)
              else setChoice(to ? to.id : '')
            }}
          >
            <option value="">{saving ? 'Moving…' : 'Move to…'}</option>
            {stages
              .filter((stage) => stage.id !== lead.stage.id)
              .map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
          </select>
          {chosen && !moving ? (
            <button
              type="button"
              className="dash-btn dash-btn-primary h-[26px] rounded-[7px] px-2 text-[11.5px]"
              aria-label={`Move ${lead.name} to ${chosen.name}`}
              onClick={() => commit(chosen)}
            >
              Move
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

/** Company, or the country when there is none — and the niche. */
const cardMeta = (lead: OwnerLeadListItem): string =>
  `${lead.company || lead.country.name}${lead.niche ? ` · ${lead.niche.name}` : ''}`

/** The lifted card under the pointer: the same face, raised, with nothing to press. */
function CardFace({ lead }: { lead: OwnerLeadListItem }) {
  return (
    <div className="flex cursor-grabbing flex-col gap-1.5 rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-surface)] px-[11px] py-2.5 text-[var(--dash-ink)] shadow-[var(--dash-shadow)]">
      <span className="text-[13px] leading-snug font-semibold break-words">{lead.name}</span>
      <span className="truncate text-[11.5px] text-[var(--dash-quiet)]">{cardMeta(lead)}</span>
      <span className="flex">
        <FollowUpPill followUp={lead.followUp} />
      </span>
    </div>
  )
}

/* ---------------------------------------------------------------- skeletons */

function CardSkeleton() {
  return (
    <li className="flex flex-col gap-2 rounded-[10px] border border-[var(--dash-line)] bg-[var(--dash-surface)] px-[11px] py-2.5">
      <span className="dash-skeleton h-3.5 w-3/4 rounded" />
      <span className="dash-skeleton h-2.5 w-1/2 rounded" />
      <span className="flex items-center justify-between gap-2">
        <span className="dash-skeleton h-5 w-16 rounded" />
        <span className="dash-skeleton h-[26px] w-20 rounded-[7px]" />
      </span>
    </li>
  )
}

function ColumnSkeleton() {
  return (
    <div
      className="flex min-h-[220px] flex-col gap-2 rounded-[12px] bg-[var(--dash-furniture)] p-2.5"
      aria-hidden="true"
    >
      <span className="flex items-center justify-between px-1 pt-0.5 pb-1">
        <span className="dash-skeleton h-3 w-20 rounded" />
        <span className="dash-skeleton h-3 w-5 rounded" />
      </span>
      <ul className="flex flex-col gap-2">
        {Array.from({ length: 3 }, (_, index) => (
          <CardSkeleton key={index} />
        ))}
      </ul>
    </div>
  )
}
