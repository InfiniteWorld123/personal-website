import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { List } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { DUE_CLASS, STAGE_CLASS, dueLabel, dueTone, money } from '#/frontend/features/leads/lead-format'
import { boardQuery, useMoveDealOnBoard } from '#/frontend/features/leads/lead-queries'
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
 */
export function BoardPage() {
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
    <div className="flex w-full flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
        <Button asChild size="sm" variant="outline" className="ms-auto">
          <Link to="/admin/leads">
            <List aria-hidden="true" />
            List
          </Link>
        </Button>
      </header>

      {board.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
          <div className="grid min-w-[52rem] grid-cols-5 gap-3">
            {DEAL_STAGES.map((stage) => {
              const column = board.data?.columns.find((entry) => entry.stage === stage)
              const cards = column?.cards ?? []
              const build = cards.reduce((sum, card) => sum + card.deal.buildCents, 0)

              return (
                <section
                  key={stage}
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
                  className={cn(
                    'border-border bg-muted/40 flex min-h-48 flex-col gap-2 rounded-xl border p-2 transition-colors',
                    over === stage && 'border-primary bg-primary/5',
                  )}
                >
                  <header className="flex items-baseline gap-2 px-1">
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
    </div>
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
  const tone = dueTone(card.deal.followUpOn)

  return (
    <article
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="border-border bg-card cursor-grab rounded-lg border p-2 active:cursor-grabbing"
    >
      <Link
        to="/admin/leads/$personId"
        params={{ personId: card.personId }}
        className="block min-w-0"
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
          'border-border bg-background mt-2 h-7 w-full rounded-md border px-1 text-[11px]',
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
  )
}
