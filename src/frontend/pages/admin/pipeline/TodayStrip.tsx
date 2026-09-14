import { Link } from '@tanstack/react-router'
import { RotateCcw, Sparkles, Sun } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import {
  useDecideSuggestion,
  useReopenLead,
  useSnoozeLead,
} from '#/frontend/features/pipeline/pipeline-queries'
import { cn } from '#/frontend/lib/utils'
import type { TodayList, TodayRow } from '#/shared/types/pipeline.types'
import type { LeadPreferences } from '#/shared/validation/pipeline.validation'
import { formatCallClock, initialsOf } from './pipeline-format'

const FROM_TONE = {
  inbox: 'border-primary/40 text-primary',
  calls: 'border-teal-500/45 text-teal-600 dark:text-teal-400',
  pipeline: 'border-amber-500/45 text-amber-700 dark:text-amber-300',
} as const

/**
 * What wants the owner today, from wherever it came.
 *
 * One list, not one per tool: an overdue chase, a message nobody answered, an
 * appointment in two hours and a rule asking permission all belong to the
 * same question — what do I do now.
 */
export function TodayStrip({
  today,
  preferences,
  full,
  onOpen,
}: {
  today: TodayList
  preferences: LeadPreferences
  full: boolean
  onOpen: (id: string) => void
}) {
  const rows = full ? today.rows : today.rows.slice(0, 4)
  const hidden = today.rows.length - rows.length

  return (
    <section className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
      <h2 className="mb-2 flex items-center gap-2 text-[0.7rem] font-medium tracking-wider text-amber-700 uppercase dark:text-amber-400">
        <Sun aria-hidden="true" className="size-3.5" />
        Today
        {preferences.followUp.morningMail ? (
          <span className="font-normal normal-case opacity-80">· also sent as a morning mail</span>
        ) : null}
        <span className="ms-auto font-normal">
          {today.rows.length} {today.rows.length === 1 ? 'thing' : 'things'}
        </span>
      </h2>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing waiting. Everything open has a date in the future.
        </p>
      ) : (
        <ul className="divide-y divide-amber-500/20">
          {rows.map((row) => (
            <TodayItem key={`${row.reason}-${row.lead.id}`} row={row} preferences={preferences} onOpen={onOpen} />
          ))}
        </ul>
      )}

      {!full && hidden > 0 ? (
        <Link
          to="/admin/leads/today"
          search={{ lead: undefined }}
          className="text-muted-foreground mt-2 inline-block text-xs hover:underline"
        >
          + {hidden} more
        </Link>
      ) : null}
    </section>
  )
}

function TodayItem({
  row,
  preferences,
  onOpen,
}: {
  row: TodayRow
  preferences: LeadPreferences
  onOpen: (id: string) => void
}) {
  const decide = useDecideSuggestion()
  const snooze = useSnoozeLead()
  const reopen = useReopenLead()
  const late = row.reason === 'overdue' || row.reason === 'unanswered'

  return (
    <li
      className={cn(
        'flex flex-wrap items-center gap-2 py-1.5 text-sm',
        row.reason === 'suggestion' && 'bg-primary/5 -mx-1 rounded px-1',
      )}
    >
      <span className="bg-accent text-accent-foreground grid size-6 shrink-0 place-items-center rounded-full text-[0.6rem] font-semibold">
        {initialsOf(row.lead.name)}
      </span>

      <button type="button" onClick={() => onOpen(row.lead.id)} className="min-w-0 text-start hover:underline">
        <span className="font-medium">{row.lead.name}</span>
        <span className="text-muted-foreground"> · {row.because}</span>
        {row.reason === 'call' && row.lead.call ? (
          <span className="font-medium text-teal-600 dark:text-teal-400">
            {' '}
            at {formatCallClock(row.lead.call.startsAt)}
          </span>
        ) : null}
      </button>

      <span className="ms-auto flex items-center gap-1.5">
        <span className={cn('rounded border px-1 py-px text-[0.6rem] tracking-wide uppercase', FROM_TONE[row.from])}>
          {row.from}
        </span>

        {late ? <span className="text-destructive text-[0.7rem] font-semibold">late</span> : null}

        {row.reason === 'autoClosed' ? (
          <>
            <Sparkles aria-hidden="true" className="text-primary size-3.5" />
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={reopen.isPending}
              onClick={() => reopen.mutate({ id: row.lead.id })}
            >
              <RotateCcw aria-hidden="true" className="size-3" />
              Undo
            </Button>
          </>
        ) : row.suggestion ? (
          <>
            <Button
              size="sm"
              className="h-7"
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate({
                  id: row.lead.id,
                  input: { rule: row.suggestion!.rule, decision: 'accept' },
                })
              }
            >
              {row.suggestion.action}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate({
                  id: row.lead.id,
                  input: { rule: row.suggestion!.rule, decision: 'dismiss' },
                })
              }
            >
              No
            </Button>
          </>
        ) : (
          <>
            {preferences.followUp.snooze ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                disabled={snooze.isPending}
                onClick={() => snooze.mutate({ id: row.lead.id, days: preferences.timing.snoozeDays })}
              >
                Snooze
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-7" onClick={() => onOpen(row.lead.id)}>
              Open
            </Button>
          </>
        )}
      </span>
    </li>
  )
}
