import * as v from 'valibot'

import { LEAD_STATUSES, type LeadStatus } from './lead.validation'

/**
 * The pipeline contract.
 *
 * Deliberately its own file beside `lead.validation.ts`: that one describes a
 * message arriving and being answered, this one describes the same person
 * being worked. They share `LEAD_STATUSES` and nothing else, and keeping the
 * seam visible is what stops the inbox and the board growing two vocabularies
 * for the same row — which is exactly the fault this round exists to fix.
 */

/* -------------------------------------------------------------------------- */
/* Stages                                                                     */
/* -------------------------------------------------------------------------- */

/** Stages a lead is still being worked in. WON and LOST are the ends. */
export const OPEN_STAGES = ['NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'HOLD'] as const

export const CLOSED_STAGES = ['WON', 'LOST'] as const

export const isOpenStage = (status: LeadStatus): boolean =>
  (OPEN_STAGES as readonly string[]).includes(status)

/**
 * How much of a lead's value counts towards the pipeline figure while it sits
 * in each stage.
 *
 * Derived from the stage rather than typed per lead: asking the owner to
 * guess a percentage for every enquiry produces numbers nobody trusts, and a
 * board position is a judgement he is already making.
 *
 * `HOLD` is low on purpose. A deal parked until January is real, but counting
 * it at half would make a quiet quarter look busy.
 */
export const STAGE_WEIGHT: Record<LeadStatus, number> = {
  NEW: 0.1,
  CONTACTED: 0.25,
  QUALIFIED: 0.5,
  PROPOSAL: 0.7,
  HOLD: 0.2,
  WON: 1,
  LOST: 0,
}

/* -------------------------------------------------------------------------- */
/* Closing                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Six reasons, no free text. Free text cannot be counted, and the only point
 * of recording why a deal died is to be able to count it six months later.
 */
export const LEAD_LOST_REASONS = [
  'PRICE',
  'SILENCE',
  'TIMING',
  'ELSEWHERE',
  'NOT_A_FIT',
  'DECLINED',
] as const

export type LeadLostReason = (typeof LEAD_LOST_REASONS)[number]

/** Where a hand-added lead actually came from. */
export const LEAD_CHANNELS = [
  'REFERRAL',
  'INSTAGRAM',
  'WHATSAPP',
  'IN_PERSON',
  'PHONE',
  'OTHER',
] as const

export type LeadChannel = (typeof LEAD_CHANNELS)[number]

/* -------------------------------------------------------------------------- */
/* Automation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every rule that fires because something happened somewhere else.
 *
 * `arrive` carries no mode: a message that lands and does not become a lead
 * is a lost message, so it is not a preference. It is listed anyway, because
 * a settings page that hides a rule is worse than one that shows it locked.
 */
export const AUTOMATION_RULES = [
  'arrive',
  'reply',
  'booked',
  'held',
  'noShow',
  'cancelled',
  'rescheduled',
  'proposal',
  'silence',
] as const

export type AutomationRule = (typeof AUTOMATION_RULES)[number]

/**
 * `auto` acts. `suggest` writes the same line into Today with an accept
 * button and changes nothing until it is pressed. `off` does neither.
 */
export const RULE_MODES = ['auto', 'suggest', 'off'] as const

export type RuleMode = (typeof RULE_MODES)[number]

/** The one rule that cannot be turned off, and the reason. */
export const LOCKED_RULES: readonly AutomationRule[] = ['arrive']

/* -------------------------------------------------------------------------- */
/* Suggestions                                                                */
/* -------------------------------------------------------------------------- */

/**
 * What a `suggest`-mode rule offers. The id is the rule that raised it, so
 * accepting reuses exactly the code path the `auto` mode would have run —
 * there is one implementation of "what happens", not two.
 */
export const SuggestionDecisionSchema = v.object({
  rule: v.picklist(AUTOMATION_RULES),
  decision: v.picklist(['accept', 'dismiss']),
})

export type SuggestionDecisionInput = v.InferOutput<typeof SuggestionDecisionSchema>

/* -------------------------------------------------------------------------- */
/* Writing a lead's own fields                                                */
/* -------------------------------------------------------------------------- */

const optionalText = (max: number) =>
  v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max, 'That text is too long'))

/** An ISO day (`2026-09-19`) or null to clear the date. */
const nullableDay = v.nullable(
  v.pipe(v.string(), v.trim(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'That is not a date')),
)

export const LeadFieldsWriteSchema = v.object({
  /** Integer cents, or null for "not valued yet" — different from zero. */
  valueCents: v.optional(
    v.nullable(v.pipe(v.number(), v.integer('Use whole cents'), v.minValue(0, 'That cannot be negative'))),
  ),
  serviceId: v.optional(v.nullable(v.pipe(v.string(), v.uuid('That is not a valid service')))),
  followUpOn: v.optional(nullableDay),
  nextStep: v.optional(optionalText(200)),
  channel: v.optional(v.nullable(v.picklist(LEAD_CHANNELS))),
})

export type LeadFieldsWriteInput = v.InferOutput<typeof LeadFieldsWriteSchema>

/**
 * Moving a lead. A stage and, when that stage is LOST, the reason — the
 * database refuses the pair any other way, so the contract asks for it here
 * rather than letting the write fail at the constraint.
 */
export const LeadStageWriteSchema = v.object({
  status: v.picklist(LEAD_STATUSES),
  lostReason: v.optional(v.nullable(v.picklist(LEAD_LOST_REASONS))),
})

export type LeadStageWriteInput = v.InferOutput<typeof LeadStageWriteSchema>

export const LeadSnoozeSchema = v.object({
  /** Days from today. The settings page sets the button's default. */
  days: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)),
})

export type LeadSnoozeInput = v.InferOutput<typeof LeadSnoozeSchema>

/* -------------------------------------------------------------------------- */
/* Adding one by hand                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Someone met at a fair, or writing on WhatsApp. `source = MANUAL` has been a
 * legal value since the bookings migration and nothing has ever written it:
 * a lead system that only accepts what its own form catches misses half of
 * what actually happens.
 */
export const ManualLeadSchema = v.object({
  name: v.pipe(v.string('A name is required'), v.trim(), v.nonEmpty('A name is required'), v.maxLength(120)),
  email: v.pipe(
    v.string('An email address is required'),
    v.trim(),
    v.nonEmpty('An email address is required'),
    v.maxLength(254),
    v.email('That email address does not look right'),
  ),
  company: optionalText(160),
  phone: optionalText(40),
  note: optionalText(4000),
  language: v.optional(v.picklist(['de', 'en', 'ar'] as const), 'de'),
  serviceId: v.optional(v.nullable(v.pipe(v.string(), v.uuid()))),
  valueCents: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0)))),
  channel: v.optional(v.nullable(v.picklist(LEAD_CHANNELS)), 'OTHER'),
  followUpOn: v.optional(nullableDay),
  /** Set once the duplicate warning has been seen and overruled. */
  allowDuplicate: v.optional(v.boolean(), false),
})

export type ManualLeadInput = v.InferOutput<typeof ManualLeadSchema>

/* -------------------------------------------------------------------------- */
/* Reading the board                                                          */
/* -------------------------------------------------------------------------- */

export const PIPELINE_SORTS = ['recent', 'value', 'oldest', 'due'] as const

export type PipelineSort = (typeof PIPELINE_SORTS)[number]

export const PipelineFilterSchema = v.object({
  /** A service id, or `all`. */
  service: v.optional(v.string(), 'all'),
  search: optionalText(120),
  sort: v.optional(v.picklist(PIPELINE_SORTS), 'recent'),
  /** Whether the two closed columns are drawn at all. */
  withClosed: v.optional(v.boolean(), true),
})

export type PipelineFilterInput = v.InferOutput<typeof PipelineFilterSchema>

/* -------------------------------------------------------------------------- */
/* Preferences                                                                */
/* -------------------------------------------------------------------------- */

export const CARD_KEYS = [
  'value',
  'nextStep',
  'followUp',
  'age',
  'source',
  'service',
  'language',
  'unread',
  'call',
] as const

export const NUMBER_KEYS = ['pipeline', 'won', 'conversion', 'replyTime', 'bySource', 'byService', 'lost'] as const

export const FOLLOW_UP_KEYS = ['todayStrip', 'overdueRed', 'snooze', 'autoFollowUp', 'staleWarning', 'morningMail'] as const

export const CLOSING_KEYS = ['lostReasonRequired', 'lockValueOnWon', 'makeClientButton'] as const

export const MANUAL_KEYS = ['addButton', 'channelField', 'duplicateHint'] as const

/**
 * The wires between the parts. Each one is a place where a screen learns
 * something that happened on another screen; turning them all off leaves the
 * separate tools this round replaced.
 */
export const WIRE_KEYS = [
  'timeline',
  'callsLens',
  'callsInToday',
  'bookFromLead',
  'callToLead',
  'serviceSpine',
  'serviceFilter',
  'serviceNumbers',
  'oneBadge',
] as const

export const KEYBOARD_KEYS = ['shortcuts', 'bulk'] as const

type Keys = readonly string[]

export type LeadPreferences = {
  card: Record<(typeof CARD_KEYS)[number], boolean>
  numbers: Record<(typeof NUMBER_KEYS)[number], boolean>
  followUp: Record<(typeof FOLLOW_UP_KEYS)[number], boolean>
  closing: Record<(typeof CLOSING_KEYS)[number], boolean>
  manual: Record<(typeof MANUAL_KEYS)[number], boolean>
  wires: Record<(typeof WIRE_KEYS)[number], boolean>
  keyboard: Record<(typeof KEYBOARD_KEYS)[number], boolean>
  rules: Record<AutomationRule, RuleMode>
  timing: LeadTimings
}

/**
 * The numbers behind the switches. A settings page of booleans alone would
 * still hide the decisions that matter: how long is too long, and when the
 * morning mail goes out.
 */
export type LeadTimings = {
  /** Days added when a stage change suggests a follow-up. */
  chaseDays: number
  /** The same, for a proposal — the one worth chasing sooner. */
  proposalChaseDays: number
  /** What the snooze button does. */
  snoozeDays: number
  /** No movement for this many days earns the stale mark. */
  staleDays: number
  /** Silence for this long raises the `silence` rule. */
  silenceDays: number
  /** Hour on the owner's clock the morning mail is sent. */
  morningMailHour: number
  /** A message unanswered this long shows in Today. */
  unansweredHours: number
}

export const DEFAULT_TIMINGS: LeadTimings = {
  chaseDays: 3,
  proposalChaseDays: 5,
  snoozeDays: 7,
  staleDays: 10,
  silenceDays: 14,
  morningMailHour: 8,
  unansweredHours: 24,
}

const allOn = <K extends Keys>(keys: K): Record<K[number], boolean> =>
  Object.fromEntries(keys.map((key) => [key, true])) as Record<K[number], boolean>

/**
 * Everything on, every rule automatic.
 *
 * This is the owner's stated way of working and his verdict from the system
 * lab: turn it all on, then turn off whatever gets in the way. The one rule
 * that closes a lead by itself is answered by `auto_closed_at` — a lead a
 * rule closed is announced in Today for a day with an undo, so the automation
 * he asked for never costs him a lead silently.
 */
export const DEFAULT_LEAD_PREFERENCES: LeadPreferences = {
  card: allOn(CARD_KEYS),
  numbers: allOn(NUMBER_KEYS),
  followUp: allOn(FOLLOW_UP_KEYS),
  closing: allOn(CLOSING_KEYS),
  manual: allOn(MANUAL_KEYS),
  wires: allOn(WIRE_KEYS),
  keyboard: { shortcuts: true, bulk: false },
  rules: Object.fromEntries(AUTOMATION_RULES.map((rule) => [rule, 'auto'])) as Record<AutomationRule, RuleMode>,
  timing: DEFAULT_TIMINGS,
}

const booleanGroup = <K extends Keys>(keys: K) =>
  v.optional(
    v.object(Object.fromEntries(keys.map((key) => [key, v.optional(v.boolean(), true)])) as never),
    {} as never,
  )

export const LeadPreferencesSchema = v.object({
  card: booleanGroup(CARD_KEYS),
  numbers: booleanGroup(NUMBER_KEYS),
  followUp: booleanGroup(FOLLOW_UP_KEYS),
  closing: booleanGroup(CLOSING_KEYS),
  manual: booleanGroup(MANUAL_KEYS),
  wires: booleanGroup(WIRE_KEYS),
  keyboard: booleanGroup(KEYBOARD_KEYS),
  rules: v.optional(
    v.object(
      Object.fromEntries(AUTOMATION_RULES.map((rule) => [rule, v.optional(v.picklist(RULE_MODES), 'auto')])) as never,
    ),
    {} as never,
  ),
  timing: v.optional(
    v.object({
      chaseDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(90)), DEFAULT_TIMINGS.chaseDays),
      proposalChaseDays: v.optional(
        v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(90)),
        DEFAULT_TIMINGS.proposalChaseDays,
      ),
      snoozeDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)), DEFAULT_TIMINGS.snoozeDays),
      staleDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(180)), DEFAULT_TIMINGS.staleDays),
      silenceDays: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)), DEFAULT_TIMINGS.silenceDays),
      morningMailHour: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(23)), DEFAULT_TIMINGS.morningMailHour),
      unansweredHours: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(168)), DEFAULT_TIMINGS.unansweredHours),
    }),
    {} as never,
  ),
})

/**
 * A stored row may predate a switch or carry one that was removed. Reading
 * goes through here so the page always receives the full set, exactly as the
 * inbox preferences do.
 */
export const readLeadPreferences = (value: unknown): LeadPreferences => {
  const stored = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>

  const group = <K extends Keys>(name: string, keys: K, fallback: Record<K[number], boolean>) => {
    const raw = (typeof stored[name] === 'object' && stored[name] !== null ? stored[name] : {}) as Record<string, unknown>

    return Object.fromEntries(
      keys.map((key) => [key, typeof raw[key] === 'boolean' ? raw[key] : fallback[key as K[number]]]),
    ) as Record<K[number], boolean>
  }

  const storedRules = (typeof stored.rules === 'object' && stored.rules !== null ? stored.rules : {}) as Record<string, unknown>
  const storedTiming = (typeof stored.timing === 'object' && stored.timing !== null ? stored.timing : {}) as Record<string, unknown>

  return {
    card: group('card', CARD_KEYS, DEFAULT_LEAD_PREFERENCES.card),
    numbers: group('numbers', NUMBER_KEYS, DEFAULT_LEAD_PREFERENCES.numbers),
    followUp: group('followUp', FOLLOW_UP_KEYS, DEFAULT_LEAD_PREFERENCES.followUp),
    closing: group('closing', CLOSING_KEYS, DEFAULT_LEAD_PREFERENCES.closing),
    manual: group('manual', MANUAL_KEYS, DEFAULT_LEAD_PREFERENCES.manual),
    wires: group('wires', WIRE_KEYS, DEFAULT_LEAD_PREFERENCES.wires),
    keyboard: group('keyboard', KEYBOARD_KEYS, DEFAULT_LEAD_PREFERENCES.keyboard),
    rules: Object.fromEntries(
      AUTOMATION_RULES.map((rule) => {
        if (LOCKED_RULES.includes(rule)) return [rule, 'auto']
        const mode = storedRules[rule]

        return [rule, (RULE_MODES as readonly string[]).includes(mode as string) ? (mode as RuleMode) : 'auto']
      }),
    ) as Record<AutomationRule, RuleMode>,
    timing: Object.fromEntries(
      (Object.keys(DEFAULT_TIMINGS) as Array<keyof LeadTimings>).map((key) => {
        const stored = storedTiming[key]

        return [key, typeof stored === 'number' && Number.isInteger(stored) ? stored : DEFAULT_TIMINGS[key]]
      }),
    ) as LeadTimings,
  }
}
