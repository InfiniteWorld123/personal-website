import type { ReactNode } from 'react'
import { cn } from '#/frontend/lib/utils'

/**
 * How every admin page opens: what this page is, on the left; what you can do
 * here, on the right.
 *
 * It is not a panel. The title sits directly on the canvas so the cards below
 * read as the contents of the page rather than as siblings of its name.
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  /** A way back, above the title, for a page reached from a list. */
  back?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {back}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground mt-1.5 max-w-prose text-sm">{description}</p>
          ) : null}
        </div>

        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

/**
 * The page's own column.
 *
 * Wider than the old `max-w-5xl` because a bento grid needs the room to be a
 * grid rather than two tall columns, and the gap is larger than the old one:
 * the space between panels is what makes them read as floating.
 */
export function AdminPage({
  children,
  width = 'wide',
  className,
}: {
  children: ReactNode
  width?: 'wide' | 'narrow' | 'full'
  className?: string
}) {
  return (
    <div
      className={cn(
        'mx-auto flex w-full flex-col gap-6',
        width === 'wide' && 'max-w-[84rem]',
        width === 'narrow' && 'max-w-4xl',
        className,
      )}
    >
      {children}
    </div>
  )
}
