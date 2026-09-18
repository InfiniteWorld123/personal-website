import type { Attachment, Person } from '#/shared/types/inbox.types'
import type { DealStage, LostReason } from '#/shared/validation/lead.validation'

/**
 * What the lead system reads. Every one of these is an explicit projection
 * built in a service — never a table row handed out.
 */

export type Deal = {
  id: string
  personId: string
  title: string
  stage: DealStage
  /** Paid once. */
  buildCents: number
  /** Paid every month, and it does not stop. Never added to the one above. */
  monthlyCents: number
  currency: string
  nextStep: string
  /** `YYYY-MM-DD`, the day he picked. Null while nothing is due. */
  followUpOn: string | null
  lostReason: LostReason | null
  lostNote: string
  stageChangedAt: string
  closedAt: string | null
  createdAt: string
}

/**
 * One row of the list — a person, and the deal that row speaks for.
 *
 * He chose that the list shows **everyone who wrote or booked**, not only
 * people with deals, so `headline` is null for most rows and the screen says
 * "no deal" rather than pretending there is one.
 */
export type LeadRow = {
  id: string
  name: string
  email: string
  company: string | null
  source: string
  lastMessageAt: string
  dealCount: number
  /** The open deal that is due soonest; failing that, the newest deal. */
  headline: Deal | null
  /** Summed across this person's open deals. */
  openBuildCents: number
  /** Summed across this person's won deals. Their real monthly figure. */
  wonMonthlyCents: number
  /** The soonest follow-up among their open deals. */
  followUpOn: string | null
}

/**
 * The four numbers he asked for, and the two the list needs to group itself.
 *
 * Every one is counted from the deals underneath it in the same request, so
 * the strip cannot disagree with the rows below it.
 */
export type LeadSummary = {
  openDeals: number
  openPeople: number
  openBuildCents: number
  /** Won deals only. The one number that says whether this business feeds him. */
  confirmedMonthlyCents: number
  won: number
  lost: number
  topLostReason: LostReason | null
  overdue: number
  dueToday: number
}

export type LeadEventKind = 'DEAL_OPENED' | 'STAGE' | 'MONEY' | 'FOLLOW_UP' | 'DEAL_REMOVED' | 'NOTE'

export type LeadEvent = {
  id: string
  dealId: string | null
  kind: LeadEventKind
  body: string
  /** False when he wrote the line himself. Drawn differently, and it matters. */
  isAutomatic: boolean
  createdAt: string
}

/**
 * A call from the booking system. **Read-only, always.**
 *
 * Booking is finished and must not be touched: this is a `SELECT` and there is
 * no route in this module that writes to it.
 */
export type BookedCall = {
  id: string
  reference: string
  title: string
  startsAt: string
  endsAt: string
  status: string
}

/** Everything one person's file needs, in one request. */
export type LeadFile = {
  person: Person
  deals: Deal[]
  events: LeadEvent[]
  calls: BookedCall[]
  /** Every document either way, gathered out of the letters they arrived in. */
  files: Attachment[]
}

export type LeadList = {
  rows: LeadRow[]
  summary: LeadSummary
}

/** The board: the same deals, read column by column. */
export type BoardCard = {
  deal: Deal
  personId: string
  personName: string
  company: string | null
}

export type Board = {
  columns: Array<{ stage: DealStage; cards: BoardCard[] }>
  summary: LeadSummary
}
