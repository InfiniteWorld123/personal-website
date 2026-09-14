import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { CalendarClock, Check, Info, Loader2 } from 'lucide-react'
import { Input } from '#/frontend/components/ui/input'
import { Switch } from '#/frontend/components/ui/switch'
import { leadSettingsQuery, useSaveLeadSettings } from '#/frontend/features/pipeline/pipeline-queries'
import { cn } from '#/frontend/lib/utils'
import {
  AUTOMATION_RULES,
  DEFAULT_LEAD_PREFERENCES,
  LOCKED_RULES,
  RULE_MODES,
  type AutomationRule,
  type LeadPreferences,
  type LeadTimings,
  type RuleMode,
} from '#/shared/validation/pipeline.validation'

/**
 * Every switch the section offers, on one page.
 *
 * Stored as a single `app_settings` JSON row, which is why a new switch here
 * is never a migration — the same trade the inbox settings made.
 *
 * Not everything is a switch. The stage names are a database constraint, one
 * lead is one person, and the history has one source: those are the shape of
 * the thing rather than a preference, and a toggle for them would be a lie.
 */
export function LeadSettingsPage() {
  const settings = useQuery(leadSettingsQuery())
  const save = useSaveLeadSettings()
  const [draft, setDraft] = useState<LeadPreferences>(DEFAULT_LEAD_PREFERENCES)

  useEffect(() => {
    if (settings.data) setDraft(settings.data.preferences)
  }, [settings.data])

  const patch = (next: LeadPreferences) => {
    setDraft(next)
    save.mutate(next)
  }

  const group =
    <K extends keyof Pick<LeadPreferences, 'card' | 'numbers' | 'followUp' | 'closing' | 'manual' | 'wires' | 'keyboard'>>(
      key: K,
    ) =>
    (name: keyof LeadPreferences[K]) =>
    (value: boolean) =>
      patch({ ...draft, [key]: { ...draft[key], [name]: value } })

  const timing = (name: keyof LeadTimings) => (value: number) =>
    patch({ ...draft, timing: { ...draft.timing, [name]: value } })

  const rule = (name: AutomationRule) => (mode: RuleMode) =>
    patch({ ...draft, rules: { ...draft.rules, [name]: mode } })

  return (
    <div className="max-w-3xl">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Lead settings</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Everything this section does, switchable. Saved as you change it.
          </p>
        </div>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {save.isPending ? (
            <>
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
              Saving…
            </>
          ) : save.isSuccess ? (
            <>
              <Check aria-hidden="true" className="size-3.5" />
              Saved
            </>
          ) : null}
        </p>
      </header>

      <Section title="Automation" note="what moves on its own">
        {AUTOMATION_RULES.map((name) => (
          <Row key={name} label={RULE_COPY[name].when} hint={RULE_COPY[name].then}>
            <ModePicker
              value={draft.rules[name]}
              locked={LOCKED_RULES.includes(name)}
              onChange={rule(name)}
            />
          </Row>
        ))}
        <p className="text-muted-foreground border-t px-3 py-2 text-xs leading-relaxed">
          <Info aria-hidden="true" className="me-1 inline size-3 align-[-2px]" />
          “Suggest” is not a notification that gets lost: the line appears in Today with one accept
          button. A lead a rule closes by itself is announced there for a day, with an undo.
        </p>
      </Section>

      <Section title="Timing" note="the numbers behind the switches">
        <NumberRow
          label="Chase after a stage change"
          hint="Days added when a lead moves forward"
          value={draft.timing.chaseDays}
          onChange={timing('chaseDays')}
          unit="days"
        />
        <NumberRow
          label="Chase a proposal"
          hint="Sooner, because this is the stage that costs money when it goes quiet"
          value={draft.timing.proposalChaseDays}
          onChange={timing('proposalChaseDays')}
          unit="days"
        />
        <NumberRow
          label="Snooze length"
          hint="What the snooze button does"
          value={draft.timing.snoozeDays}
          onChange={timing('snoozeDays')}
          unit="days"
        />
        <NumberRow
          label="Stale warning"
          hint="Mark anything without movement for this long"
          value={draft.timing.staleDays}
          onChange={timing('staleDays')}
          unit="days"
        />
        <NumberRow
          label="Silence closes a lead"
          hint="How long before the silence rule acts or asks"
          value={draft.timing.silenceDays}
          onChange={timing('silenceDays')}
          unit="days"
        />
        <NumberRow
          label="Unanswered shows in Today"
          hint="A message nobody has answered for this long"
          value={draft.timing.unansweredHours}
          onChange={timing('unansweredHours')}
          unit="hours"
        />
        <NumberRow
          label="Morning mail hour"
          hint="On your own clock"
          value={draft.timing.morningMailHour}
          onChange={timing('morningMailHour')}
          unit="o’clock"
        />
      </Section>

      <Section title="How the parts talk" note="the wires">
        <Row label="One timeline" hint="Calls, messages, notes and stages in one strip">
          <Toggle value={draft.wires.timeline} onChange={group('wires')('timeline')} />
        </Row>
        <Row label="Calls lens" hint="Booked calls listed under Leads">
          <Toggle value={draft.wires.callsLens} onChange={group('wires')('callsLens')} />
        </Row>
        <Row label="Calls in Today" hint="Today’s appointments in the same list as the follow-ups">
          <Toggle value={draft.wires.callsInToday} onChange={group('wires')('callsInToday')} />
        </Row>
        <Row label="Book a call from a lead" hint="Without leaving the person">
          <Toggle value={draft.wires.bookFromLead} onChange={group('wires')('bookFromLead')} />
        </Row>
        <Row label="Open the person from a call" hint="The other direction">
          <Toggle value={draft.wires.callToLead} onChange={group('wires')('callToLead')} />
        </Row>
        <Row label="Service as one vocabulary" hint="Form, call type, worth and filters agree on three names">
          <Toggle value={draft.wires.serviceSpine} onChange={group('wires')('serviceSpine')} />
        </Row>
        <Row label="Filter every lens by service" hint="“Show me only the shops”">
          <Toggle value={draft.wires.serviceFilter} onChange={group('wires')('serviceFilter')} />
        </Row>
        <Row label="Numbers by service" hint="How many shops actually sold">
          <Toggle value={draft.wires.serviceNumbers} onChange={group('wires')('serviceNumbers')} />
        </Row>
        <Row label="Sidebar badge counts everything" hint="Not only unread messages">
          <Toggle value={draft.wires.oneBadge} onChange={group('wires')('oneBadge')} />
        </Row>
      </Section>

      <Section title="The board" note="what every card carries">
        <Row label="Worth" hint="Suggested from the service, editable">
          <Toggle value={draft.card.value} onChange={group('card')('value')} />
        </Row>
        <Row label="Next step" hint="One sentence of what happens next">
          <Toggle value={draft.card.nextStep} onChange={group('card')('nextStep')} />
        </Row>
        <Row label="Follow-up date" hint="The field that stops leads going quiet">
          <Toggle value={draft.card.followUp} onChange={group('card')('followUp')} />
        </Row>
        <Row label="Age in stage" hint="“11 days here”">
          <Toggle value={draft.card.age} onChange={group('card')('age')} />
        </Row>
        <Row label="Source badge" hint="Form · call · by hand">
          <Toggle value={draft.card.source} onChange={group('card')('source')} />
        </Row>
        <Row label="Service" hint="Website · shop · software">
          <Toggle value={draft.card.service} onChange={group('card')('service')} />
        </Row>
        <Row label="Language" hint="A small DE/EN/AR badge">
          <Toggle value={draft.card.language} onChange={group('card')('language')} />
        </Row>
        <Row label="Unread dot" hint="The same blue dot the inbox uses">
          <Toggle value={draft.card.unread} onChange={group('card')('unread')} />
        </Row>
        <Row label="The call" hint="“Call tomorrow 10:00”, or that it was held">
          <Toggle value={draft.card.call} onChange={group('card')('call')} />
        </Row>
      </Section>

      <Section title="Follow-up">
        <Row label="Today strip" hint="Above the board, and in the morning mail">
          <Toggle value={draft.followUp.todayStrip} onChange={group('followUp')('todayStrip')} />
        </Row>
        <Row label="Mark overdue in red" hint="The card itself turns">
          <Toggle value={draft.followUp.overdueRed} onChange={group('followUp')('overdueRed')} />
        </Row>
        <Row label="Suggest a date on stage change" hint="Moving a lead forward schedules the chase">
          <Toggle value={draft.followUp.autoFollowUp} onChange={group('followUp')('autoFollowUp')} />
        </Row>
        <Row label="Snooze button" hint="Pushes a follow-up without changing the stage">
          <Toggle value={draft.followUp.snooze} onChange={group('followUp')('snooze')} />
        </Row>
        <Row label="Stale warning" hint="A mark on anything sitting still">
          <Toggle value={draft.followUp.staleWarning} onChange={group('followUp')('staleWarning')} />
        </Row>
        <Row
          label="Morning mail"
          hint={
            settings.data?.morningMailScheduled
              ? 'One letter each morning with what is due'
              : 'Ready, but nothing is scheduled to send it until the worker is deployed with a cron trigger'
          }
        >
          <Toggle value={draft.followUp.morningMail} onChange={group('followUp')('morningMail')} />
        </Row>
      </Section>

      <Section title="Numbers on the page">
        <Row label="Pipeline value" hint="Weighted by each stage’s odds">
          <Toggle value={draft.numbers.pipeline} onChange={group('numbers')('pipeline')} />
        </Row>
        <Row label="Won" hint="What actually closed">
          <Toggle value={draft.numbers.won} onChange={group('numbers')('won')} />
        </Row>
        <Row label="Conversion rate" hint="Meaningful after about thirty leads">
          <Toggle value={draft.numbers.conversion} onChange={group('numbers')('conversion')} />
        </Row>
        <Row label="First reply time" hint="Median from arrival to your first answer">
          <Toggle value={draft.numbers.replyTime} onChange={group('numbers')('replyTime')} />
        </Row>
        <Row label="By source" hint="Which door brings paying clients">
          <Toggle value={draft.numbers.bySource} onChange={group('numbers')('bySource')} />
        </Row>
        <Row label="By service" hint="Website against shop against software">
          <Toggle value={draft.numbers.byService} onChange={group('numbers')('byService')} />
        </Row>
        <Row label="Why I lose" hint="The six reasons, counted">
          <Toggle value={draft.numbers.lost} onChange={group('numbers')('lost')} />
        </Row>
      </Section>

      <Section title="Closing">
        <Row label="Lost reason required" hint="Nothing closes as lost without one">
          <Toggle value={draft.closing.lostReasonRequired} onChange={group('closing')('lostReasonRequired')} />
        </Row>
        <Row label="Lock the price on Won" hint="The agreed price stops changing afterwards">
          <Toggle value={draft.closing.lockValueOnWon} onChange={group('closing')('lockValueOnWon')} />
        </Row>
        <Row label="“Make a client” button" hint="Shown disabled until the invoicing block">
          <Toggle value={draft.closing.makeClientButton} onChange={group('closing')('makeClientButton')} />
        </Row>
      </Section>

      <Section title="Adding by hand">
        <Row label="New lead button" hint="For WhatsApp, Instagram, people you meet">
          <Toggle value={draft.manual.addButton} onChange={group('manual')('addButton')} />
        </Row>
        <Row label="“How they reached me”" hint="Feeds the source numbers with what happens off the site">
          <Toggle value={draft.manual.channelField} onChange={group('manual')('channelField')} />
        </Row>
        <Row label="Duplicate warning" hint="If the address already exists">
          <Toggle value={draft.manual.duplicateHint} onChange={group('manual')('duplicateHint')} />
        </Row>
      </Section>

      <Section title="Keyboard">
        <Row label="Shortcuts" hint="Arrows to walk the board, 1–7 to move a stage">
          <Toggle value={draft.keyboard.shortcuts} onChange={group('keyboard')('shortcuts')} />
        </Row>
        <Row label="Multi-select" hint="Move several cards at once">
          <Toggle value={draft.keyboard.bulk} onChange={group('keyboard')('bulk')} />
        </Row>
      </Section>

      <section className="bg-muted mt-4 rounded-lg border p-3 text-xs">
        <p className="mb-1.5 flex items-center gap-1.5 font-medium">
          <CalendarClock aria-hidden="true" className="size-3.5" />
          The calendar itself
        </p>
        <p className="text-muted-foreground leading-relaxed">
          When you are free and what kinds of call can be booked are settings for the calendar, not
          for the people on it, so they stay where they are.{' '}
          <Link to="/admin/bookings/availability" className="underline">
            Availability
          </Link>{' '}
          ·{' '}
          <Link to="/admin/bookings/types" className="underline">
            Call types
          </Link>
        </p>
      </section>
    </div>
  )
}

const RULE_COPY: Record<AutomationRule, { when: string; then: string }> = {
  arrive: { when: 'A message arrives', then: '→ New. Locked: a message that becomes nothing is a message lost.' },
  reply: { when: 'You reply', then: '→ Contacted' },
  booked: { when: 'They book a call', then: '→ Qualified' },
  held: { when: 'The call time passes', then: '→ written into the history, follow up tomorrow' },
  noShow: { when: 'You mark a no-show', then: '→ follow up today' },
  cancelled: { when: 'They cancel a call', then: '→ follow up tomorrow' },
  rescheduled: { when: 'They move a call', then: '→ dates updated, no chase while the call is ahead' },
  proposal: { when: 'You move one to Proposal sent', then: '→ chased on the proposal timer' },
  silence: { when: 'Silence for the window below', then: '→ closed as “Never answered”, announced with an undo' },
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card mb-3 overflow-hidden rounded-lg border">
      <h2 className="bg-muted flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
        {title}
        {note ? <span className="text-muted-foreground ms-auto text-xs font-normal">{note}</span> : null}
      </h2>
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint ? <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">{hint}</span> : null}
      </span>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <Switch checked={value} onCheckedChange={onChange} />
}

function NumberRow({
  label,
  hint,
  value,
  unit,
  onChange,
}: {
  label: string
  hint: string
  value: number
  unit: string
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(String(value))

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  return (
    <Row label={label} hint={hint}>
      <span className="flex shrink-0 items-center gap-1.5">
        <Input
          inputMode="numeric"
          value={draft}
          onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ''))}
          onBlur={() => {
            const next = Number(draft)
            if (Number.isInteger(next) && next > 0 && next !== value) onChange(next)
            else setDraft(String(value))
          }}
          className="h-8 w-16 text-center"
        />
        <span className="text-muted-foreground w-12 text-xs">{unit}</span>
      </span>
    </Row>
  )
}

function ModePicker({
  value,
  locked,
  onChange,
}: {
  value: RuleMode
  locked: boolean
  onChange: (mode: RuleMode) => void
}) {
  return (
    <span className="flex shrink-0 overflow-hidden rounded-md border">
      {RULE_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          disabled={locked}
          aria-pressed={value === mode}
          onClick={() => onChange(mode)}
          className={cn(
            'px-2 py-1 text-xs transition-colors',
            value === mode ? 'bg-accent text-accent-foreground font-medium' : 'text-muted-foreground hover:bg-muted',
            locked && 'cursor-not-allowed opacity-50',
          )}
        >
          {mode}
        </button>
      ))}
    </span>
  )
}
