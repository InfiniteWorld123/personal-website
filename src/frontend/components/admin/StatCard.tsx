import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from '#/frontend/components/ui/skeleton'
import { cn } from '#/frontend/lib/utils'
import type { PrefetchHandlers } from '#/frontend/lib/prefetch'
import { PanelInteractive } from './Panel'

/**
 * One card, one number.
 *
 * The figure is set in the site's own serif rather than the interface face.
 * It is the one place in the admin where the public brand's voice appears, and
 * it does the work a dashboard actually needs: at a glance the numbers read as
 * the content and everything around them as furniture.
 *
 * `tone` is not decoration. `brand` marks the single card that answers the
 * question he opens this page to ask; `alert` marks money that is late. If
 * every card could be brand, none of them says anything.
 */
export type StatTone = 'plain' | 'brand' | 'alert'

const SURFACE: Record<StatTone, string> = {
  plain: '',
  brand: 'bg-primary text-primary-foreground ring-primary/40',
  alert: 'bg-destructive/[0.07] ring-destructive/25',
}

const LABEL: Record<StatTone, string> = {
  plain: 'text-muted-foreground',
  brand: 'text-primary-foreground/75',
  alert: 'text-destructive',
}

const FOOT: Record<StatTone, string> = {
  plain: 'text-muted-foreground',
  brand: 'text-primary-foreground/70',
  alert: 'text-muted-foreground',
}

export function StatCard({
  label,
  value,
  foot,
  tone = 'plain',
  to,
  prefetch,
  className,
}: {
  label: string
  /** Already formatted. This card counts nothing and converts nothing. */
  value: ReactNode
  /** One line under the number saying what it is made of. */
  foot?: ReactNode
  tone?: StatTone
  to?: string
  prefetch?: PrefetchHandlers
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className={cn('text-[0.78rem] font-medium tracking-wide', LABEL[tone])}>{label}</p>
        {to ? (
          <span
            aria-hidden="true"
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-full ring-1',
              tone === 'brand'
                ? 'ring-primary-foreground/30 text-primary-foreground'
                : 'ring-foreground/15 text-muted-foreground',
              'motion-safe:transition-colors',
              tone === 'brand'
                ? 'group-hover/stat:bg-primary-foreground/15'
                : 'group-hover/stat:bg-foreground/[0.06]',
            )}
          >
            <ArrowUpRight className="size-3.5" />
          </span>
        ) : null}
      </div>

      <p className="font-heading mt-6 text-[2.6rem] leading-none font-semibold tracking-tight tabular-nums">
        {value}
      </p>

      {foot ? <p className={cn('mt-2 text-xs', FOOT[tone])}>{foot}</p> : null}
    </>
  )

  const surface = cn('group/stat flex flex-col p-6', SURFACE[tone], className)

  if (!to) return <PanelInteractive className={surface}>{body}</PanelInteractive>

  return (
    <PanelInteractive className={cn(surface, 'p-0')}>
      <Link
        to={to}
        {...prefetch}
        className="focus-visible:ring-ring flex flex-1 flex-col rounded-[inherit] p-6 focus-visible:ring-2 focus-visible:outline-none"
      >
        {body}
      </Link>
    </PanelInteractive>
  )
}

/** The same card with the figure not yet arrived. Same box, same rhythm. */
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <PanelInteractive className={cn('flex flex-col p-6', className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-7 h-9 w-28" />
      <Skeleton className="mt-3 h-3 w-32" />
    </PanelInteractive>
  )
}
