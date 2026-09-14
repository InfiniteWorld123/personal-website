import type { LeadStatus } from '#/shared/validation/lead.validation'
import type { LeadChannel, LeadLostReason } from '#/shared/validation/pipeline.validation'
import type { LeadSource } from '#/shared/validation/lead.validation'

/**
 * The words and shapes the lead lenses share.
 *
 * Kept beside the pages rather than in the contract: these are labels for one
 * admin in one language, and the server has no business deciding how a
 * number reads. Admin copy is English, the owner's own decision.
 */

/** Board order. The database allows these seven and nothing else. */
export const STAGE_ORDER: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'HOLD',
  'WON',
  'LOST',
]

export const STAGE_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal sent',
  HOLD: 'On hold',
  WON: 'Won',
  LOST: 'Lost',
}

/**
 * One colour per stage, as a raw value rather than a Tailwind class: the same
 * value paints a dot, a border and a chip, and three class strings that must
 * be kept in step is how a palette drifts.
 */
export const STAGE_COLOR: Record<LeadStatus, string> = {
  NEW: 'var(--color-primary)',
  CONTACTED: '#7c6cf0',
  QUALIFIED: '#0ea5a5',
  PROPOSAL: '#c2810a',
  HOLD: '#8b8fa3',
  WON: '#10a06a',
  LOST: 'var(--color-destructive)',
}

export const LOST_REASON_LABEL: Record<LeadLostReason, string> = {
  PRICE: 'Too expensive',
  SILENCE: 'Never answered',
  TIMING: 'Wrong timing',
  ELSEWHERE: 'Went elsewhere',
  NOT_A_FIT: 'Not a fit',
  DECLINED: 'I turned it down',
}

export const CHANNEL_LABEL: Record<LeadChannel, string> = {
  REFERRAL: 'Referral',
  INSTAGRAM: 'Instagram',
  WHATSAPP: 'WhatsApp',
  IN_PERSON: 'Met in person',
  PHONE: 'Phone',
  OTHER: 'Other',
}

export const SOURCE_LABEL: Record<LeadSource, string> = {
  CONTACT_FORM: 'Contact form',
  BOOKING: 'Booked a call',
  MANUAL: 'Added by hand',
}

/** Integer cents, never a pre-formatted string from the server. */
export const formatMoney = (cents: number | null, currency = 'EUR'): string => {
  if (cents === null) return '—'

  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

/**
 * How a follow-up date reads on a card.
 *
 * Whole days, computed on the server against the owner's own midnight, so a
 * page left open overnight does not start calling today "tomorrow".
 */
export const formatDue = (days: number | null): string => {
  if (days === null) return ''
  if (days < 0) return `${Math.abs(days)}d overdue`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'

  return `in ${days}d`
}

export const formatStageAge = (days: number): string => (days === 0 ? 'today' : `${days}d here`)

/** `2026-09-19`, which is what a date input wants. */
export const toDateInput = (instant: string | null): string =>
  instant ? new Date(instant).toISOString().slice(0, 10) : ''

const CALL_FORMAT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Berlin',
})

export const formatCallTime = (instant: string): string => CALL_FORMAT.format(new Date(instant))

export const formatCallClock = (instant: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  }).format(new Date(instant))

/**
 * What a card says about its call in one line: what is ahead if anything is,
 * otherwise what already happened.
 */
export const describeCall = (call: { startsAt: string; status: string; held: boolean }): string => {
  if (call.status === 'CANCELLED') return 'Call cancelled'

  const startsIn = Date.parse(call.startsAt) - Date.now()

  if (startsIn < 0) return call.held ? 'Call held' : 'Call time passed'
  if (startsIn < 60 * 60 * 1000) return `Call in ${Math.max(1, Math.round(startsIn / 60000))} min`
  if (startsIn < 24 * 60 * 60 * 1000) return `Call today ${formatCallClock(call.startsAt)}`
  if (startsIn < 48 * 60 * 60 * 1000) return `Call tomorrow ${formatCallClock(call.startsAt)}`

  return `Call ${formatCallTime(call.startsAt)}`
}

export const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
