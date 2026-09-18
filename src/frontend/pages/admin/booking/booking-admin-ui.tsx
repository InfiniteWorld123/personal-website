import { cn } from '#/frontend/lib/utils'

/**
 * The few things every booking screen says the same way.
 *
 * The status pill was written out three times across this section, each with a
 * slightly different border, which is how a list and the page it opens end up
 * disagreeing about what "cancelled" looks like. One pill, one clock, one
 * formatter — the pages themselves stay about their own job.
 */

/** Every time in the admin is read on the owner's own clock. */
export const BERLIN = 'Europe/Berlin'

/** The list's short form: weekday, date, and the time it starts. */
export const formatBerlin = (instant: string) =>
  new Intl.DateTimeFormat('de-DE', {
    timeZone: BERLIN,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))

/** The detail's long form, on whichever clock is being asked about. */
export const formatOn = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat('de-DE', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(
    new Date(instant),
  )

/**
 * Only a booking that is still going to happen carries the brand colour. A
 * cancelled one goes quiet, a no-show goes red: the pill is a fact about the
 * call, not decoration on a row.
 */
export const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'border-primary/40 text-primary',
  CANCELLED: 'text-muted-foreground',
  COMPLETED: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  NO_SHOW: 'border-destructive/40 text-destructive',
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'border-border rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        STATUS_TONE[status],
        className,
      )}
    >
      {status}
    </span>
  )
}
