import type { LeadStatus } from '#/shared/validation/lead.validation'

/** Every time in the admin is read on the owner's own clock. */
export const BERLIN = 'Europe/Berlin'

export const formatBerlin = (instant: string) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: BERLIN,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))

export const formatFull = (instant: string) =>
  new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN, dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(instant),
  )

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "2 hours ago" up to a week, then the date. Past a week the distance stops
 * being useful and the day is what gets looked for.
 */
export const formatRelative = (instant: string): string => {
  const elapsed = Date.now() - Date.parse(instant)

  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`
  if (elapsed < 2 * DAY) return 'yesterday'
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`

  return formatBerlin(instant)
}

export const STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal sent',
  HOLD: 'On hold',
  WON: 'Won',
  LOST: 'Lost',
}

export const STATUS_TONE: Record<LeadStatus, string> = {
  NEW: 'border-primary/40 text-primary',
  CONTACTED: '',
  QUALIFIED: 'border-primary/30 text-primary',
  PROPOSAL: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  HOLD: 'text-muted-foreground',
  WON: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  LOST: 'text-muted-foreground',
}

export const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`

/** The language the visitor wrote in, named rather than abbreviated. */
export const LANGUAGE_LABEL: Record<string, string> = { de: 'German', en: 'English', ar: 'Arabic' }
