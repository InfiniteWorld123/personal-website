import { CalendarClock, Sparkles } from 'lucide-react'
import { cn } from '#/frontend/lib/utils'
import type { PipelineCard } from '#/shared/types/pipeline.types'
import type { LeadPreferences } from '#/shared/validation/pipeline.validation'
import {
  CHANNEL_LABEL,
  describeCall,
  formatDue,
  formatMoney,
  formatStageAge,
  LOST_REASON_LABEL,
  SOURCE_LABEL,
} from './pipeline-format'

/**
 * One person on the board.
 *
 * Every line is a switch on the settings page, because the owner asked to be
 * able to turn any of it off. What cannot be switched off is the name: a card
 * that does not say who it is about is not a card.
 */
export function LeadCard({
  card,
  preferences,
  onOpen,
  isDragging,
}: {
  card: PipelineCard
  preferences: LeadPreferences
  onOpen: (id: string) => void
  isDragging?: boolean
}) {
  const { card: show } = preferences
  const overdue = preferences.followUp.overdueRed && card.followUpInDays !== null && card.followUpInDays < 0
  const stale = preferences.followUp.staleWarning && card.isStale

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData('text/lead-id', card.id)
        event.dataTransfer.effectAllowed = 'move'
      }}
      onClick={() => onOpen(card.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen(card.id)
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`${card.name}, ${card.status}`}
      className={cn(
        'bg-card hover:border-primary/45 focus-visible:ring-ring cursor-pointer rounded-lg border p-2.5',
        'border-s-[3px] border-s-transparent transition-colors focus-visible:ring-2 focus-visible:outline-none',
        overdue && 'border-destructive/55 bg-destructive/5',
        stale && 'border-s-amber-500',
        isDragging && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-2">
        {show.unread && card.isUnread ? (
          <span aria-hidden="true" className="bg-primary size-1.5 shrink-0 rounded-full" />
        ) : null}
        <span className="truncate text-sm font-semibold">{card.name}</span>
        {show.value ? (
          <span className="ms-auto text-sm font-semibold whitespace-nowrap">
            {formatMoney(card.valueCents, card.currency)}
          </span>
        ) : null}
      </div>

      {card.company ? <p className="text-muted-foreground mt-0.5 truncate text-xs">{card.company}</p> : null}

      {show.nextStep && card.nextStep ? <p className="mt-1.5 text-xs leading-snug">{card.nextStep}</p> : null}

      {show.call && card.call ? (
        <p
          className={cn(
            'mt-1.5 flex items-center gap-1 text-xs font-medium',
            card.call.status === 'CANCELLED' || Date.parse(card.call.startsAt) < Date.now()
              ? 'text-muted-foreground font-normal'
              : 'text-teal-600 dark:text-teal-400',
          )}
        >
          <CalendarClock aria-hidden="true" className="size-3" />
          {describeCall(card.call)}
        </p>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1">
        {show.service && card.service ? (
          <span
            className="rounded-full px-1.5 py-px text-[0.65rem] font-medium"
            style={{ backgroundColor: `${card.service.accent}20`, color: card.service.accent }}
          >
            {card.service.name}
          </span>
        ) : null}
        {show.source ? (
          <span className="border-primary/35 text-primary rounded-full border px-1.5 py-px text-[0.65rem]">
            {card.source === 'MANUAL' && card.channel ? CHANNEL_LABEL[card.channel] : SOURCE_LABEL[card.source]}
          </span>
        ) : null}
        {show.language ? (
          <span className="text-muted-foreground rounded-full border px-1.5 py-px text-[0.65rem]">
            {card.language.toUpperCase()}
          </span>
        ) : null}
        {card.status === 'LOST' && card.lostReason ? (
          <span className="border-destructive/40 text-destructive rounded-full border px-1.5 py-px text-[0.65rem]">
            {LOST_REASON_LABEL[card.lostReason]}
          </span>
        ) : null}
      </div>

      {card.autoClosedAt ? (
        <p className="text-primary mt-1.5 flex items-center gap-1 text-[0.7rem]">
          <Sparkles aria-hidden="true" className="size-3" />
          Closed by a rule
        </p>
      ) : null}

      {show.age || show.followUp ? (
        <div className="text-muted-foreground mt-2 flex items-center gap-2 text-[0.7rem]">
          {show.age ? <span>{formatStageAge(card.daysInStage)}</span> : null}
          {show.followUp && card.followUpInDays !== null ? (
            <span className={cn('ms-auto', overdue && 'text-destructive font-semibold')}>
              {formatDue(card.followUpInDays)}
            </span>
          ) : null}
        </div>
      ) : null}
    </article>
  )
}
