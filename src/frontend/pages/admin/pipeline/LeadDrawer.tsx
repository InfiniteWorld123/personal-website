import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowRightLeft,
  CalendarClock,
  CalendarPlus,
  Check,
  CircleSlash,
  Mail,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { Input } from '#/frontend/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/frontend/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '#/frontend/components/ui/sheet'
import { leadQuery } from '#/frontend/features/inbox/inbox-queries'
import {
  useMarkNoShow,
  useReopenLead,
  useSetLeadFields,
  useSetLeadStage,
  useSnoozeLead,
} from '#/frontend/features/pipeline/pipeline-queries'
import { cn } from '#/frontend/lib/utils'
import type { PipelineCard, PipelineService } from '#/shared/types/pipeline.types'
import type { AdminLeadEvent } from '#/shared/types/lead.types'
import type { LeadStatus } from '#/shared/validation/lead.validation'
import {
  LEAD_LOST_REASONS,
  type LeadLostReason,
  type LeadPreferences,
} from '#/shared/validation/pipeline.validation'
import {
  CHANNEL_LABEL,
  describeCall,
  formatCallTime,
  formatDue,
  formatMoney,
  initialsOf,
  LOST_REASON_LABEL,
  SOURCE_LABEL,
  STAGE_COLOR,
  STAGE_LABEL,
  STAGE_ORDER,
  toDateInput,
} from './pipeline-format'

/**
 * One lead, one detail surface.
 *
 * Opened from the board, from Today, from the calls and from the table, and
 * it reads the same record the inbox reads — the pipeline fields from the
 * card, the conversation and the history from the inbox's own projection.
 * Two detail views of one person is how two vocabularies start.
 */
export function LeadDrawer({
  card,
  preferences,
  services,
  onClose,
}: {
  card: PipelineCard | null
  preferences: LeadPreferences
  services: PipelineService[]
  onClose: () => void
}) {
  const detail = useQuery(leadQuery(card?.id))
  const setStage = useSetLeadStage()
  const setFields = useSetLeadFields()
  const snooze = useSnoozeLead()
  const noShow = useMarkNoShow()
  const reopen = useReopenLead()

  const [value, setValue] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [nextStep, setNextStep] = useState('')
  const [pendingLoss, setPendingLoss] = useState(false)

  // The drafts follow the record, so a card opened after another one never
  // shows the previous person's numbers.
  useEffect(() => {
    if (!card) return

    setValue(card.valueCents === null ? '' : String(Math.round(card.valueCents / 100)))
    setFollowUp(toDateInput(card.followUpAt))
    setNextStep(card.nextStep)
    setPendingLoss(false)
  }, [card?.id, card?.valueCents, card?.followUpAt, card?.nextStep])

  if (!card) return null

  const lockedValue = preferences.closing.lockValueOnWon && card.status === 'WON'

  const moveTo = (status: LeadStatus, lostReason?: LeadLostReason) => {
    if (status === 'LOST' && preferences.closing.lostReasonRequired && !lostReason && !card.lostReason) {
      setPendingLoss(true)

      return
    }

    setPendingLoss(false)
    setStage.mutate({ id: card.id, status, lostReason: lostReason ?? card.lostReason ?? undefined })
  }

  const saveFields = (patch: Parameters<typeof setFields.mutate>[0]['input']) =>
    setFields.mutate({ id: card.id, input: patch })

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b pb-4">
          <div className="flex items-start gap-3">
            <span className="bg-accent text-accent-foreground grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold">
              {initialsOf(card.name)}
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-base">{card.name}</SheetTitle>
              <p className="text-muted-foreground truncate text-xs">
                {card.company ? `${card.company} · ` : ''}
                {card.email}
              </p>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 p-4">
          {card.autoClosedAt ? (
            <AutoClosedNotice
              days={preferences.timing.silenceDays}
              onUndo={() => reopen.mutate({ id: card.id })}
              pending={reopen.isPending}
            />
          ) : null}

          {preferences.followUp.overdueRed && card.followUpInDays !== null && card.followUpInDays < 0 ? (
            <p className="border-destructive/40 bg-destructive/10 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
              Follow-up {formatDue(card.followUpInDays)}
              {card.nextStep ? ` — ${card.nextStep}` : ''}
              <Button
                size="sm"
                variant="outline"
                className="ms-auto h-7"
                onClick={() => snooze.mutate({ id: card.id, days: preferences.timing.snoozeDays })}
              >
                Snooze
              </Button>
            </p>
          ) : null}

          <Stages card={card} onMove={moveTo} pending={setStage.isPending} />

          {(card.status === 'LOST' || pendingLoss) && preferences.closing.lostReasonRequired ? (
            <LostReason
              value={card.lostReason}
              highlight={pendingLoss}
              onPick={(reason) => moveTo('LOST', reason)}
            />
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={lockedValue ? 'Agreed price (fixed)' : 'Worth'}>
              <Input
                inputMode="numeric"
                value={value}
                disabled={lockedValue}
                onChange={(event) => setValue(event.target.value.replace(/[^\d]/g, ''))}
                onBlur={() => {
                  const cents = value === '' ? null : Number(value) * 100
                  if (cents !== card.valueCents) saveFields({ valueCents: cents })
                }}
                placeholder="990"
              />
            </Field>
            <Field label="Follow up on">
              <Input
                type="date"
                value={followUp}
                onChange={(event) => {
                  setFollowUp(event.target.value)
                  saveFields({ followUpOn: event.target.value || null })
                }}
              />
            </Field>
          </div>

          <Field label="Next step">
            <Input
              value={nextStep}
              onChange={(event) => setNextStep(event.target.value)}
              onBlur={() => nextStep !== card.nextStep && saveFields({ nextStep })}
              placeholder="What happens next…"
            />
          </Field>

          {preferences.wires.serviceSpine ? (
            <Field label="Service">
              <Select
                value={card.service?.id ?? 'none'}
                onValueChange={(next) => saveFields({ serviceId: next === 'none' ? null : next })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} — from {formatMoney(service.startPriceCents, service.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          <dl className="bg-muted grid grid-cols-2 gap-3 rounded-lg border p-3 text-xs sm:grid-cols-3">
            <Fact label="Source" value={SOURCE_LABEL[card.source]} />
            {card.channel ? <Fact label="Channel" value={CHANNEL_LABEL[card.channel]} /> : null}
            <Fact label="Language" value={card.language.toUpperCase()} />
            <Fact label="In stage" value={`${card.daysInStage}d`} />
          </dl>

          <Actions card={card} preferences={preferences} onNoShow={() => noShow.mutate({ id: card.id })} />

          <section>
            <h3 className="text-muted-foreground mb-2 flex items-center gap-2 text-[0.7rem] font-medium tracking-wider uppercase">
              {preferences.wires.timeline ? 'Everything that happened' : 'Messages'}
              {preferences.wires.timeline ? (
                <span className="text-muted-foreground/80 ms-auto flex gap-1 text-[0.6rem] normal-case">
                  <SourceBadge source="inbox" />
                  <SourceBadge source="calls" />
                  <SourceBadge source="pipeline" />
                </span>
              ) : null}
            </h3>
            <Timeline
              events={detail.data?.events ?? []}
              loading={detail.isLoading}
              showAll={preferences.wires.timeline}
            />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AutoClosedNotice({ days, onUndo, pending }: { days: number; onUndo: () => void; pending: boolean }) {
  return (
    <p className="border-primary/40 bg-primary/10 flex items-center gap-2 rounded-md border px-3 py-2 text-xs">
      <Sparkles aria-hidden="true" className="text-primary size-3.5 shrink-0" />
      <span>Closed by a rule after {days} days of silence.</span>
      <Button size="sm" variant="outline" className="ms-auto h-7" disabled={pending} onClick={onUndo}>
        <RotateCcw aria-hidden="true" className="size-3" />
        Undo
      </Button>
    </p>
  )
}

function Stages({
  card,
  onMove,
  pending,
}: {
  card: PipelineCard
  onMove: (status: LeadStatus) => void
  pending: boolean
}) {
  return (
    <div>
      <p className="text-muted-foreground mb-1.5 text-[0.7rem] font-medium tracking-wider uppercase">Stage</p>
      <div className="flex flex-wrap gap-1.5">
        {STAGE_ORDER.map((status) => {
          const active = card.status === status

          return (
            <button
              key={status}
              type="button"
              disabled={pending}
              aria-pressed={active}
              onClick={() => !active && onMove(status)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
                active ? 'font-medium text-white' : 'text-muted-foreground hover:bg-muted',
              )}
              style={active ? { backgroundColor: STAGE_COLOR[status], borderColor: STAGE_COLOR[status] } : undefined}
            >
              {STAGE_LABEL[status]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function LostReason({
  value,
  highlight,
  onPick,
}: {
  value: LeadLostReason | null
  highlight: boolean
  onPick: (reason: LeadLostReason) => void
}) {
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        highlight ? 'border-destructive/50 bg-destructive/5' : 'border-border',
      )}
    >
      <p className="text-muted-foreground mb-1.5 text-[0.7rem] font-medium tracking-wider uppercase">
        Why lost {highlight ? '— pick one to close it' : ''}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {LEAD_LOST_REASONS.map((reason) => (
          <button
            key={reason}
            type="button"
            aria-pressed={value === reason}
            onClick={() => onPick(reason)}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs',
              value === reason
                ? 'bg-destructive border-destructive text-white'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {LOST_REASON_LABEL[reason]}
          </button>
        ))}
      </div>
    </div>
  )
}

function Actions({
  card,
  preferences,
  onNoShow,
}: {
  card: PipelineCard
  preferences: LeadPreferences
  onNoShow: () => void
}) {
  const callPassed = card.call && Date.parse(card.call.endsAt) < Date.now() && card.call.status === 'CONFIRMED'

  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild size="sm" variant="outline">
        <Link to="/admin/inbox" search={{ lead: card.id }}>
          <MessageSquare aria-hidden="true" className="size-3.5" />
          Open the conversation
        </Link>
      </Button>
      {preferences.wires.bookFromLead ? (
        <Button asChild size="sm" variant="outline">
          <Link to="/admin/bookings/new">
            <CalendarPlus aria-hidden="true" className="size-3.5" />
            Book a call
          </Link>
        </Button>
      ) : null}
      {callPassed ? (
        <Button size="sm" variant="outline" onClick={onNoShow}>
          <CircleSlash aria-hidden="true" className="size-3.5" />
          Did not show up
        </Button>
      ) : null}
      {preferences.closing.makeClientButton ? (
        <Button size="sm" variant="outline" disabled title="Arrives with the invoicing block">
          <ArrowRightLeft aria-hidden="true" className="size-3.5" />
          Make a client
        </Button>
      ) : null}
      {card.call ? (
        <p className="text-muted-foreground flex w-full items-center gap-1.5 text-xs">
          <CalendarClock aria-hidden="true" className="size-3.5" />
          {card.call.typeName} · {formatCallTime(card.call.startsAt)} · {describeCall(card.call)}
        </p>
      ) : null}
    </div>
  )
}

const EVENT_ICON: Record<string, typeof Mail> = {
  ARRIVED: Mail,
  INBOUND: Mail,
  NOTIFIED: Mail,
  REPLIED: MessageSquare,
  PROPOSAL: MessageSquare,
  NOTE: Pencil,
  BOOKED: CalendarClock,
  CALL_HELD: Check,
  RESCHEDULED: ArrowRightLeft,
  CANCELLED: X,
  NO_SHOW: CircleSlash,
  WON: Star,
  LOST: X,
  AUTO_CLOSED: Sparkles,
  CREATED: Plus,
  REOPENED: RotateCcw,
}

const SOURCE_TONE = {
  inbox: 'border-primary/40 text-primary',
  calls: 'border-teal-500/45 text-teal-600 dark:text-teal-400',
  pipeline: 'border-amber-500/45 text-amber-600 dark:text-amber-400',
} as const

function SourceBadge({ source }: { source: AdminLeadEvent['source'] }) {
  return (
    <span className={cn('rounded border px-1 py-px text-[0.6rem] tracking-wide uppercase', SOURCE_TONE[source])}>
      {source}
    </span>
  )
}

/**
 * The one timeline.
 *
 * With the wire off it shows only what the inbox knows, and says how much is
 * missing — which is exactly the state this round was built to end.
 */
function Timeline({
  events,
  loading,
  showAll,
}: {
  events: AdminLeadEvent[]
  loading: boolean
  showAll: boolean
}) {
  if (loading) return <p className="text-muted-foreground text-xs">Reading the history…</p>

  const ordered = [...events].reverse()
  const shown = showAll ? ordered : ordered.filter((event) => event.source === 'inbox')
  const hidden = ordered.length - shown.length

  return (
    <>
      <ol className="space-y-0">
        {shown.map((event, index) => {
          const Icon = EVENT_ICON[event.kind] ?? Check

          return (
            <li key={event.id} className="flex gap-2.5">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <span
                  className={cn(
                    'bg-muted text-muted-foreground grid size-6 place-items-center rounded-full border',
                    event.source === 'calls' && 'border-teal-500/40 bg-teal-500/10 text-teal-600 dark:text-teal-400',
                  )}
                >
                  <Icon aria-hidden="true" className="size-3" />
                </span>
                {index < shown.length - 1 ? <span className="bg-border w-px flex-1" /> : null}
              </div>
              <div className="min-w-0 flex-1 pb-3">
                <p className="text-sm leading-snug">
                  {event.detail || event.kind.replace(/_/g, ' ').toLowerCase()}
                  {showAll ? <span className="ms-1.5 inline-block align-middle"><SourceBadge source={event.source} /></span> : null}
                  {event.isAutomatic ? (
                    <span className="text-muted-foreground ms-1.5 text-[0.65rem]">· by a rule</span>
                  ) : null}
                </p>
                <p className="text-muted-foreground text-[0.7rem]">
                  {new Intl.DateTimeFormat('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Europe/Berlin',
                  }).format(new Date(event.createdAt))}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      {!showAll && hidden > 0 ? (
        <p className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-md border px-3 py-2 text-xs">
          {hidden} {hidden === 1 ? 'thing' : 'things'} happened to this person somewhere else and{' '}
          {hidden === 1 ? 'is' : 'are'} not shown here.
        </p>
      ) : null}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-[0.7rem] font-medium tracking-wider uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-[0.65rem] tracking-wider uppercase">{label}</dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  )
}
