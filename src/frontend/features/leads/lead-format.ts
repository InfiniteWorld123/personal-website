import type { DealStage } from '#/shared/validation/lead.validation'

const BERLIN = 'Europe/Berlin'

/**
 * Money, the way he writes it: `1.490 €`.
 *
 * Whole euros, because every price in `docs/services` is a whole euro and
 * cents on a screen invite arithmetic nobody asked for. The two figures are
 * always formatted separately — there is no helper here that adds a build
 * price to a monthly one, and that absence is deliberate.
 */
export const money = (cents: number, currency = 'EUR'): string =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)

/** Today in Erfurt as `YYYY-MM-DD`, so "overdue" turns over at his midnight. */
export const today = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

  return parts
}

export const daysUntil = (day: string): number => {
  const from = Date.parse(`${today()}T00:00:00Z`)
  const to = Date.parse(`${day}T00:00:00Z`)

  return Math.round((to - from) / 86_400_000)
}

export type DueTone = 'late' | 'today' | 'soon' | 'later' | 'none'

export const dueTone = (day: string | null): DueTone => {
  if (day === null) return 'none'

  const days = daysUntil(day)

  if (days < 0) return 'late'
  if (days === 0) return 'today'
  if (days <= 3) return 'soon'

  return 'later'
}

/** "3 days late" · "today" · "in 2 days" · "Fri 24 Oct". */
export const dueLabel = (day: string | null): string => {
  if (day === null) return ''

  const days = daysUntil(day)

  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} late`
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days <= 7) return `in ${days} days`

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${day}T00:00:00Z`))
}

/**
 * Stage colour, as classes rather than inline styles so both themes are
 * defined in the same place as everything else.
 */
export const STAGE_CLASS: Record<DealStage, string> = {
  NEW: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  TALKING: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  PROPOSAL: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  WON: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  LOST: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
}

export const DUE_CLASS: Record<DueTone, string> = {
  late: 'text-rose-600 dark:text-rose-400 font-medium',
  today: 'text-primary font-medium',
  soon: 'text-foreground/80',
  later: 'text-muted-foreground',
  none: 'text-muted-foreground',
}
