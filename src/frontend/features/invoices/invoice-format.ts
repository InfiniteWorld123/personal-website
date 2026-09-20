import type { Settlement } from '#/shared/validation/invoice.validation'

const BERLIN = 'Europe/Berlin'

/**
 * Money on the screen, with cents.
 *
 * `lead-format.ts` drops the cents on purpose — a deal is worth "1.490 €" and
 * nobody negotiates in cents. An invoice is the opposite: the figure here is
 * the figure on the paper and in the bank statement, and a rounded total on
 * screen would send him looking for a difference that does not exist.
 */
export const money = (cents: number, currency = 'EUR'): string =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100)

/** Today in Erfurt as `YYYY-MM-DD`, so "overdue" turns over at his midnight. */
export const today = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

/** `2026-09-18` → `18 Sep 2026`. Never re-parsed into local time. */
export const day = (value: string | null): string =>
  value === null
    ? '—'
    : new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(`${value}T00:00:00Z`))

/**
 * An **instant** — a moment a letter left — as `18 Sep 2026, 11:14`.
 *
 * Converted into Erfurt time, which is the opposite of what `day` above must
 * do and for the same reason: a letter sent at 00:40 Berlin on the 19th went
 * out on the 19th as far as he is concerned, and rendering it in UTC would
 * date it the 18th.
 *
 * `inbox-format.ts` has a near-twin that leaves the year out, because a mail
 * thread is read in the week it happened. A register of everything he has ever
 * sent is not, so the year stays.
 */
export const instant = (value: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: BERLIN,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))

/** `2026-09` → `September 2026`, for the month a figure belongs to. */
export const monthName = (value: string): string =>
  value === ''
    ? ''
    : new Intl.DateTimeFormat('en-GB', {
        timeZone: 'UTC',
        month: 'long',
        year: 'numeric',
      }).format(new Date(`${value}-01T00:00:00Z`))

export const addDays = (value: string, days: number): string =>
  new Date(Date.parse(`${value}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/**
 * Colour by settlement, as classes rather than inline styles so both themes
 * are defined where everything else is.
 *
 * Overdue is the only one that shouts. The rest are quiet on purpose: a list
 * where every row is coloured tells him nothing about which row to open.
 */
export const SETTLEMENT_CLASS: Record<Settlement, string> = {
  DRAFT: 'border-border bg-muted text-muted-foreground',
  OPEN: 'border-border bg-muted text-foreground/80',
  OVERDUE: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  PART: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  PAID: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  CANCELLED: 'border-border bg-muted text-muted-foreground line-through',
  // A correction. Quiet, like the rest: it is a document that exists, and
  // there is nothing to do about it.
  ISSUED: 'border-border bg-muted text-foreground/80',
}

/** How a row sorts when overdue goes first — switch 16. */
export const SETTLEMENT_WEIGHT: Record<Settlement, number> = {
  OVERDUE: 0,
  PART: 1,
  OPEN: 2,
  DRAFT: 3,
  PAID: 4,
  // Below paid: a correction is finished business, and so is a cancelled
  // invoice. Neither is ever the row he opened the section to find.
  ISSUED: 5,
  CANCELLED: 6,
}

export const lateLabel = (days: number): string =>
  days === 1 ? '1 day late' : `${days} days late`
