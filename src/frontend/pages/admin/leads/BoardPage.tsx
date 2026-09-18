import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { List } from 'lucide-react'
import { AdminPage, PageHeader } from '#/frontend/components/admin/PageHeader'
import { Panel, PanelInteractive, PanelNote } from '#/frontend/components/admin/Panel'
import { Button } from '#/frontend/components/ui/button'
import { Skeleton, SkeletonScreen } from '#/frontend/components/ui/skeleton'
import { DUE_CLASS, STAGE_CLASS, dueLabel, dueTone, money } from '#/frontend/features/leads/lead-format'
import {
  boardQuery,
  leadFileQuery,
  leadsQuery,
  useMoveDealOnBoard,
} from '#/frontend/features/leads/lead-queries'
import { usePrefetch } from '#/frontend/lib/prefetch'
import { cn } from '#/frontend/lib/utils'
import type { BoardCard } from '#/shared/types/lead.types'
import { DEAL_STAGES, STAGE_LABEL, type DealStage, type LostReason } from '#/shared/validation/lead.validation'
import { LostDialog } from './LostDialog'

/**
 * The board: the same deals, read column by column.
 *
 * A tab beside the list rather than the section's front page — five columns do
 * not fit a phone, and he works from his phone. Here it earns its place for
 * the one question a list answers badly: how much is stuck where.
 *
 * **Dragging is not the only way to move a card.** Native drag-and-drop does
 * not exist on a touch screen, so every card also carries a stage picker that
 * does exactly the same thing. A board that can only be operated with a mouse
 * would be a screen he cannot use where he actually works.
 *
 * Each column is a panel and each card is a smaller panel inside it, so the
 * thing you pick up looks like a thing that can be picked up.
 */
export function BoardPage() {
  const prefetch = usePrefetch()
  const board = useQuery(boardQuery())
  const move = useMoveDealOnBoard()

  const [dragging, setDragging] = useState<BoardCard | null>(null)
  const [over, setOver] = useState<DealStage | null>(null)
  const [losing, setLosing] = useState<BoardCard | null>(null)

  const send = (card: BoardCard, stage: DealStage) => {
    if (stage === card.deal.stage) return

    if (stage === 'LOST') {
      setLosing(card)

      return
    }

    move.mutate({
      personId: card.personId,
      dealId: card.deal.id,
      stage,
      lostReason: null,
      lostNote: '',
    })
  }

  return (
    <AdminPage>
      <PageHeader
        title="Board"
        description="The same deals as the list, read column by column. Drag a card, or use the picker on it."
        actions={
          <Button asChild className="rounded-full" size="sm" variant="outline">
            {/* The list opens on 'Everyone' with an empty search — the two
                arguments its own `useState` starts with, so the warmed entry
                is the one it actually reads. */}
            <Link to="/admin/leads" {...prefetch(leadsQuery('ALL', ''))}>
              <List aria-hidden="true" />
              List
            </Link>
          </Button>
        }
      />

      {board.isPending ? (
        <ColumnsSkeleton />
      ) : board.isError ? (
        /*
          A board that cannot load used to render five empty columns, which
          reads as "there are no deals anywhere" — the worst possible answer
          to give about a pipeline that may well be full.
        */
        <Panel>
          <PanelNote tone="error">
            <div>
              <p className="font-medium">The board could not be loaded.</p>
              <p className="text-muted-foreground mt-1">
                {board.error instanceof Error ? board.error.message : 'Something went wrong.'}
              </p>
            </div>
            <Button onClick={() => void board.refetch()} size="sm" variant="outline">
              Try again
            </Button>
          </PanelNote>
        </Panel>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          <div className="grid min-w-[52rem] grid-cols-5 gap-4">
            {DEAL_STAGES.map((stage) => {
              const column = board.data?.columns.find((entry) => entry.stage === stage)
              const cards = column?.cards ?? []
              const build = cards.reduce((sum, card) => sum + card.deal.buildCents, 0)

              return (
                <Panel
                  asChild
                  key={stage}
                  className={cn(
                    'motion-safe:transition-colors',
                    // The drop target says so with the brand ring rather than
                    // a second border, so nothing in the column shifts by a
                    // pixel while a card is held over it.
                    over === stage && 'ring-primary bg-primary/5 ring-2',
                  )}
                >
                  <section
                    onDragOver={(event) => {
                      event.preventDefault()
                      setOver(stage)
                    }}
                    onDragLeave={() => setOver((current) => (current === stage ? null : current))}
                    onDrop={(event) => {
                      event.preventDefault()
                      setOver(null)

                      if (dragging) send(dragging, stage)

                      setDragging(null)
                    }}
                    className="flex min-h-48 flex-col gap-2 p-3"
                  >
                    <header className="flex items-baseline gap-2 px-1 pb-1">
                      <h2 className="text-[10px] font-semibold tracking-widest uppercase">
                        {STAGE_LABEL[stage]}
                      </h2>
                      <span className="text-muted-foreground text-[10px] tabular-nums">
                        {cards.length}
                      </span>
                      {build > 0 ? (
                        <span className="text-muted-foreground ms-auto text-[10px] tabular-nums">
                          {money(build)}
                        </span>
                      ) : null}
                    </header>

                    {cards.map((card) => (
                      <Card
                        key={card.deal.id}
                        card={card}
                        onDragStart={() => setDragging(card)}
                        onDragEnd={() => setDragging(null)}
                        onPick={(next) => send(card, next)}
                      />
                    ))}

                    {cards.length === 0 ? (
                      <p className="text-muted-foreground/70 px-1 text-[11px]">Nothing here.</p>
                    ) : null}
                  </section>
                </Panel>
              )
            })}
          </div>
        </div>
      )}

      {move.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {(move.error as Error).message}
        </p>
      ) : null}

      <LostDialog
        open={losing !== null}
        onOpenChange={(next) => !next && setLosing(null)}
        personName={losing?.personName ?? ''}
        pending={move.isPending}
        onConfirm={(reason: LostReason, note: string) => {
          if (!losing) return

          move.mutate(
            {
              personId: losing.personId,
              dealId: losing.deal.id,
              stage: 'LOST',
              lostReason: reason,
              lostNote: note,
            },
            { onSuccess: () => setLosing(null) },
          )
        }}
      />
    </AdminPage>
  )
}

/**
 * Five columns at their real width, each already holding card-shaped blocks —
 * so the strip is scrollable and the right height before the deals land in it.
 */
function ColumnsSkeleton() {
  return (
    <SkeletonScreen
      className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6"
      label="Loading the board"
    >
      <div className="grid min-w-[52rem] grid-cols-5 gap-4">
        {DEAL_STAGES.map((stage, column) => (
          <Panel className="flex min-h-48 flex-col gap-2 p-3" key={stage}>
            <div className="flex items-baseline gap-2 px-1 pb-1">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-2.5 w-4" />
            </div>

            {Array.from({ length: column === 0 ? 3 : 2 }, (_, index) => (
              <div className="ring-panel-border rounded-xl p-2.5 ring-1" key={index}>
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-2.5 w-32" />
                <Skeleton className="mt-2.5 h-2.5 w-20" />
                <Skeleton className="mt-2.5 h-7 w-full rounded-md" />
              </div>
            ))}
          </Panel>
        ))}
      </div>
    </SkeletonScreen>
  )
}

function Card({
  card,
  onDragStart,
  onDragEnd,
  onPick,
}: {
  card: BoardCard
  onDragStart: () => void
  onDragEnd: () => void
  onPick: (stage: DealStage) => void
}) {
  const prefetch = usePrefetch()
  const tone = dueTone(card.deal.followUpOn)

  return (
    <PanelInteractive asChild className="rounded-xl">
      <article
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        className="cursor-grab p-2.5 active:cursor-grabbing"
      >
        <Link
          to="/admin/leads/$personId"
          params={{ personId: card.personId }}
          // The whole file behind this card, warmed on the hover that is also
          // the gesture that starts a drag.
          {...prefetch(leadFileQuery(card.personId))}
          className="focus-visible:ring-ring block min-w-0 rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <span dir="auto" className="block truncate text-xs font-medium">
            {card.personName}
          </span>
          <span dir="auto" className="text-muted-foreground block truncate text-[11px]">
            {card.deal.title}
          </span>
        </Link>

        <p className="mt-1 text-[11px] tabular-nums">
          {money(card.deal.buildCents, card.deal.currency)}
          {card.deal.monthlyCents > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              {' · '}
              {money(card.deal.monthlyCents, card.deal.currency)}/mo
            </span>
          ) : null}
        </p>

        {card.deal.followUpOn ? (
          <p className={cn('text-[11px]', DUE_CLASS[tone])}>{dueLabel(card.deal.followUpOn)}</p>
        ) : null}

        {/* The touch half of the same act. `aria-label` names the deal, because
            five identical "Stage" selects on one screen name nothing. */}
        <select
          value={card.deal.stage}
          onChange={(event) => onPick(event.currentTarget.value as DealStage)}
          aria-label={`Stage of ${card.deal.title}`}
          className={cn(
            'border-border focus-visible:ring-ring mt-2 h-7 w-full rounded-md border px-1 text-[11px] focus-visible:ring-2 focus-visible:outline-none',
            STAGE_CLASS[card.deal.stage],
          )}
        >
          {DEAL_STAGES.map((stage) => (
            <option key={stage} value={stage}>
              {STAGE_LABEL[stage]}
            </option>
          ))}
        </select>
      </article>
    </PanelInteractive>
  )
}
