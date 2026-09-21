import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#/frontend/lib/utils'
import type { Tone } from './sample-data'

/**
 * The pieces every dashboard screen is built from.
 *
 * They are small on purpose. The system is six colours, six type roles and one
 * shadow rule; a screen should be readable as those, not as a pile of bespoke
 * components. Anything that needs its own shape — the metric band, the chart —
 * lives next to the screen that uses it.
 */

/** The column a screen sits in. Wide, because a bento needs room to be one. */
export function DashboardPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('mx-auto flex w-full max-w-[96rem] flex-col p-5 sm:p-6', className)}>
      {children}
    </div>
  )
}

/**
 * How every screen opens.
 *
 * Fraunces appears here and nowhere else on the screen — it names the page,
 * it does not decorate every card. The eyebrow above it is the public site's
 * own voice, and it is what makes this look like the same owner.
 */
export function PageHead({
  eyebrow,
  title,
  description,
  actions,
  aside,
  className,
}: {
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  aside?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        <p className="dash-eyebrow">{eyebrow}</p>
        <h1 className="dash-title mt-1 text-[26px] sm:text-[32px]">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-[68ch] text-[13px] text-[var(--dash-quiet)]">{description}</p>
        ) : null}
      </div>

      {actions || aside ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {aside}
          {actions}
        </div>
      ) : null}
    </header>
  )
}

/**
 * Says out loud that none of the figures below are counted.
 *
 * It is not decoration and it is not temporary politeness. Backend2 does not
 * exist, so every number on this surface comes from a fixture; a dashboard
 * whose figures look counted but are not is the failure this platform is being
 * rebuilt to avoid. It comes off the day a screen reads from a real query.
 */
export function SampleBadge() {
  return (
    <span className="flex h-[26px] items-center gap-1.5 rounded-[7px] border border-[var(--dash-blue)] px-2.5 text-[11px] font-semibold text-[var(--dash-blue-ink)]">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ background: 'var(--dash-blue)' }}
      />
      SAMPLE DATA
    </span>
  )
}

/** Marks a screen whose behaviour has not been agreed with the owner yet. */
export function NotSpecifiedBadge() {
  return (
    <span className="flex h-[30px] items-center gap-1.5 rounded-lg border border-dashed border-[var(--dash-line)] px-3 text-[11px] font-semibold text-[var(--dash-quiet)]">
      NOT SPECIFIED YET
    </span>
  )
}

export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('dash-panel flex flex-col', className)} {...props} />
}

export function PanelHead({
  title,
  count,
  countTone = 'grey',
  action,
  note,
}: {
  title: ReactNode
  count?: ReactNode
  countTone?: Tone
  action?: ReactNode
  note?: ReactNode
}) {
  return (
    <div className="flex items-center gap-2.5 px-5 pt-4.5 pb-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {count !== undefined ? (
        <StatusChip tone={countTone} className="h-[19px] min-w-5 justify-center px-1.5 font-bold">
          {count}
        </StatusChip>
      ) : null}
      {note ? <span className="text-[11px] text-[var(--dash-quiet)]">{note}</span> : null}
      {action ? <div className="ms-auto">{action}</div> : null}
    </div>
  )
}

const TONE_CLASS: Record<Tone, string> = {
  blue: 'dash-tone-blue',
  grey: 'dash-tone-grey',
  red: 'dash-tone-red',
  ink: 'dash-tone-ink',
  outline: 'dash-tone-outline',
}

/**
 * A status never rests on colour alone — the word is the status, and the tone
 * only makes it faster to find. Red is reserved for money that is late.
 */
export function StatusChip({
  tone = 'grey',
  className,
  children,
}: {
  tone?: Tone
  className?: string
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-semibold',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** The initials square that stands in for an avatar or a project thumbnail. */
export function Initials({
  children,
  tone = 'grey',
  className,
}: {
  children: ReactNode
  tone?: 'grey' | 'blue'
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-[30px] shrink-0 place-items-center rounded-[9px] text-[11px] font-bold',
        tone === 'blue' ? 'dash-tone-blue' : 'dash-tone-grey',
        className,
      )}
    >
      {children}
    </span>
  )
}
