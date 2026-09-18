import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '#/frontend/lib/utils'

/**
 * The admin's one surface.
 *
 * Everything in this section is a panel floating on the canvas: the sidebar,
 * the top bar, every list, every form, every figure. That is the whole visual
 * rule, and keeping it to one component is what stops it drifting into five
 * slightly different cards by the fourth page.
 *
 * It is deliberately not `components/ui/card`. That card is shadcn's, it sits
 * on the white public site, and `ServiceCard` renders it to visitors — giving
 * the admin its own ground would have quietly restyled the marketing pages.
 */
export function Panel({
  className,
  asChild = false,
  ...props
}: ComponentProps<'div'> & { asChild?: boolean }) {
  const Surface = asChild ? Slot.Root : 'div'

  return (
    <Surface
      data-slot="panel"
      className={cn(
        'bg-panel ring-panel-border rounded-[var(--radius-panel)] ring-1',
        'shadow-[var(--shadow-card)]',
        className,
      )}
      {...props}
    />
  )
}

/** A panel that answers a click. Lifts on hover; still under reduced motion. */
export function PanelInteractive({
  className,
  ...props
}: ComponentProps<'div'> & { asChild?: boolean }) {
  return (
    <Panel
      className={cn(
        'motion-safe:transition-shadow motion-safe:duration-200',
        'hover:shadow-[var(--shadow-card-hover)]',
        'focus-within:ring-ring focus-within:ring-2',
        className,
      )}
      {...props}
    />
  )
}

export function PanelHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-header"
      className={cn('flex items-start justify-between gap-4 px-6 pt-6 pb-4', className)}
      {...props}
    />
  )
}

export function PanelTitle({ className, ...props }: ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="panel-title"
      className={cn('font-heading text-base leading-snug font-medium', className)}
      {...props}
    />
  )
}

export function PanelBody({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="panel-body" className={cn('px-6 pb-6', className)} {...props} />
}

/**
 * The quiet line a panel says when it has nothing, cannot load, or is still
 * counting. One shape for all three so they sit identically in the layout and
 * the panel does not resize as it moves between them.
 */
export function PanelNote({
  tone = 'muted',
  className,
  ...props
}: ComponentProps<'div'> & { tone?: 'muted' | 'error' }) {
  return (
    <div
      data-slot="panel-note"
      className={cn(
        'flex flex-col items-center gap-3 px-6 py-12 text-center text-sm',
        tone === 'error' ? 'text-destructive' : 'text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
