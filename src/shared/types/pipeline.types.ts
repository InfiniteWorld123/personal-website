import type { LeadLanguage, LeadSource, LeadStatus } from '#/shared/validation/lead.validation'
import type {
  AutomationRule,
  LeadChannel,
  LeadLostReason,
  LeadPreferences,
} from '#/shared/validation/pipeline.validation'

/**
 * What the board, Today and the calls read.
 *
 * Every instant crosses the wire as an ISO string and is formatted on the
 * owner's clock, exactly as the bookings contract does. Money crosses as
 * integer cents beside its currency and is never pre-formatted on the server:
 * a number the client cannot add up is a number it cannot total.
 */

export type PipelineService = {
  id: string
  slug: string
  name: string
  startPriceCents: number
  currency: string
  accent: string
}

/** A call, as the lead system sees it. */
export type LeadCall = {
  id: string
  reference: string
  startsAt: string
  endsAt: string
  status: string
  typeName: string
  durationMinutes: number
  /** The service this call type is about, when it names one. */
  service: PipelineService | null
  /** Whether it has already been written into the lead's history as held. */
  held: boolean
}

export type PipelineCard = {
  id: string
  name: string
  company: string
  email: string
  status: LeadStatus
  source: LeadSource
  channel: LeadChannel | null
  language: LeadLanguage
  service: PipelineService | null
  valueCents: number | null
  currency: string
  nextStep: string
  /** ISO instant, or null when nothing is scheduled. */
  followUpAt: string | null
  /** Whole days from today. Negative is overdue. Null when there is no date. */
  followUpInDays: number | null
  /** Days since the lead last changed stage. */
  daysInStage: number
  isUnread: boolean
  /** No movement for longer than the stale threshold. */
  isStale: boolean
  lostReason: LeadLostReason | null
  /** The next call ahead, or the most recent one behind. */
  call: LeadCall | null
  /** Set while a rule closed this lead and the owner has not seen it yet. */
  autoClosedAt: string | null
  createdAt: string
}

export type PipelineColumn = {
  status: LeadStatus
  cards: PipelineCard[]
  /** Straight sum of the column, in cents. */
  totalCents: number
}

export type PipelineStats = {
  /** Sum of open value weighted by each stage's odds, in cents. */
  weightedCents: number
  /** The same sum, unweighted. */
  rawCents: number
  openCount: number
  wonCents: number
  wonCount: number
  lostCount: number
  /** Whole percent, or null before anything has closed. */
  conversion: number | null
  /** Median hours from arrival to first reply, or null with nothing to measure. */
  medianReplyHours: number | null
  /** Messages still waiting for a first answer. */
  awaitingReply: number
  bySource: Array<{ source: LeadSource; total: number; won: number }>
  byService: Array<{ service: PipelineService; total: number; won: number; openCents: number }>
  byLostReason: Array<{ reason: LeadLostReason; count: number }>
  currency: string
}

export type PipelineBoard = {
  columns: PipelineColumn[]
  stats: PipelineStats
  services: PipelineService[]
}

/* -------------------------------------------------------------------------- */
/* Today                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Why a row is in Today.
 *
 * `call` and `unanswered` come from other screens, which is the whole point:
 * one list for the day rather than one list per tool.
 */
export type TodayReason = 'overdue' | 'due' | 'unanswered' | 'call' | 'suggestion' | 'autoClosed'

export type TodayRow = {
  reason: TodayReason
  lead: PipelineCard
  /** The sentence shown beside the name. */
  because: string
  /** Which screen raised it, for the badge. */
  from: 'inbox' | 'calls' | 'pipeline'
  /** Present on a suggestion: the rule, and what accepting will do. */
  suggestion?: { rule: AutomationRule; action: string }
  /** Sorting weight; the latest thing owed sorts first. */
  urgency: number
}

export type TodayList = {
  rows: TodayRow[]
  /** What the lazy sweep did on this read, so the page can say so once. */
  applied: { callsMarkedHeld: number; leadsAutoClosed: number }
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export type LeadSettings = {
  preferences: LeadPreferences
  services: PipelineService[]
  /**
   * The morning mail can be switched on here, but it only actually leaves on
   * a schedule that needs a deploy. The page says which of those is true
   * rather than showing a switch that quietly does nothing.
   */
  morningMailScheduled: boolean
}

export type { LeadPreferences }
