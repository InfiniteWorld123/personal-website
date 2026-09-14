import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { CalendarPlus, Settings2 } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import {
  callsQuery,
  leadSettingsQuery,
  pipelineQuery,
} from '#/frontend/features/pipeline/pipeline-queries'
import { cn } from '#/frontend/lib/utils'
import type { PipelineCard } from '#/shared/types/pipeline.types'
import { DEFAULT_LEAD_PREFERENCES } from '#/shared/validation/pipeline.validation'
import { LeadDrawer } from './LeadDrawer'
import { formatCallClock, initialsOf, STAGE_COLOR, STAGE_LABEL } from './pipeline-format'

const DAY = 24 * 60 * 60 * 1000

/**
 * The calls, each one carrying the person who booked it.
 *
 * This is the lens the owner asked for when he said the booking belongs under
 * the leads: a call on its own is a row in a calendar, and a call beside its
 * lead is a conversation with a time attached. Availability and call types
 * stay in the bookings section — configuring a calendar is a different job
 * from working the people on it.
 */
export function CallsPage({ search }: { search: { lead?: string } }) {
  const navigate = useNavigate({ from: '/admin/leads/calls' })
  const settings = useQuery(leadSettingsQuery())
  const preferences = settings.data?.preferences ?? DEFAULT_LEAD_PREFERENCES
  const calls = useQuery(callsQuery({ service: 'all', search: '', sort: 'recent', withClosed: true }))
  const board = useQuery(pipelineQuery({ service: 'all', search: '', sort: 'recent', withClosed: true }))

  const setLead = (lead: string | undefined) =>
    void navigate({ search: (previous) => ({ ...previous, lead }) })

  const cards = calls.data ?? []
  const openCard = cards.find((card) => card.id === search.lead) ?? null

  const groups: Array<{ title: string; cards: PipelineCard[] }> = [
    { title: 'Today', cards: cards.filter((card) => bucket(card) === 0) },
    { title: 'Tomorrow', cards: cards.filter((card) => bucket(card) === 1) },
    { title: 'Later', cards: cards.filter((card) => bucket(card) === 2) },
    { title: 'Earlier', cards: cards.filter((card) => bucket(card) === -1) },
  ].filter((group) => group.cards.length > 0)

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Calls</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Booked calls, each one opening the person who booked it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/bookings/availability">
              <Settings2 aria-hidden="true" className="size-4" />
              Availability
            </Link>
          </Button>
          <Button asChild>
            <Link to="/admin/bookings/new">
              <CalendarPlus aria-hidden="true" className="size-4" />
              Book a call
            </Link>
          </Button>
        </div>
      </header>

      {calls.isLoading ? (
        <p className="text-muted-foreground py-12 text-center text-sm">Reading the calendar…</p>
      ) : groups.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed py-12 text-center text-sm">
          Nobody has booked a call yet.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.title} className="mb-5">
            <h2 className="text-muted-foreground mb-2 text-[0.7rem] font-medium tracking-wider uppercase">
              {group.title}
            </h2>
            <ul className="space-y-1.5">
              {group.cards.map((card) => (
                <CallRow
                  key={card.call?.id ?? card.id}
                  card={card}
                  canOpenLead={preferences.wires.callToLead}
                  onOpen={() => setLead(card.id)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      <LeadDrawer
        card={openCard}
        preferences={preferences}
        services={board.data?.services ?? []}
        onClose={() => setLead(undefined)}
      />
    </div>
  )
}

/** −1 earlier · 0 today · 1 tomorrow · 2 later. */
function bucket(card: PipelineCard): number {
  if (!card.call) return 2

  const startsIn = Date.parse(card.call.startsAt) - Date.now()

  if (startsIn < 0) return -1
  if (startsIn < DAY) return 0
  if (startsIn < 2 * DAY) return 1

  return 2
}

function CallRow({
  card,
  canOpenLead,
  onOpen,
}: {
  card: PipelineCard
  canOpenLead: boolean
  onOpen: () => void
}) {
  const call = card.call
  if (!call) return null

  const cancelled = call.status === 'CANCELLED'
  const service = call.service ?? card.service

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
          }
        }}
        className={cn(
          'bg-card hover:border-primary/45 focus-visible:ring-ring flex cursor-pointer items-center gap-3',
          'rounded-lg border p-2.5 transition-colors focus-visible:ring-2 focus-visible:outline-none',
          cancelled && 'opacity-60',
        )}
      >
        <span className={cn('min-w-14 text-sm font-semibold tabular-nums', cancelled && 'line-through')}>
          {formatCallClock(call.startsAt)}
        </span>
        <span className="bg-accent text-accent-foreground grid size-8 shrink-0 place-items-center rounded-full text-[0.65rem] font-semibold">
          {initialsOf(card.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">
            {card.name}
            {card.company ? <span className="text-muted-foreground font-normal"> · {card.company}</span> : null}
          </span>
          <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            {call.typeName} · {call.durationMinutes} min
            {service ? (
              <span
                className="rounded-full px-1.5 py-px text-[0.65rem] font-medium"
                style={{ backgroundColor: `${service.accent}20`, color: service.accent }}
              >
                {service.name}
              </span>
            ) : null}
            <span
              className="rounded-full border px-1.5 py-px text-[0.65rem]"
              style={{ borderColor: STAGE_COLOR[card.status], color: STAGE_COLOR[card.status] }}
            >
              {STAGE_LABEL[card.status]}
            </span>
            {cancelled ? (
              <span className="border-destructive/40 text-destructive rounded-full border px-1.5 py-px text-[0.65rem]">
                cancelled
              </span>
            ) : call.held ? (
              <span className="rounded-full border border-emerald-500/40 px-1.5 py-px text-[0.65rem] text-emerald-600 dark:text-emerald-400">
                held
              </span>
            ) : null}
          </span>
        </span>
        {canOpenLead ? (
          <Button size="sm" variant="outline" className="shrink-0" onClick={onOpen}>
            Open the person
          </Button>
        ) : null}
      </div>
    </li>
  )
}
