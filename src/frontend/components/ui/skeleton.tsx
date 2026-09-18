import type { ComponentProps, ReactNode } from 'react'
import { cn } from '#/frontend/lib/utils'

/**
 * A shape standing where content will be.
 *
 * Not a spinner. A spinner says *wait*; a skeleton says *here is what is
 * coming and where it will sit*, which is why every skeleton in this admin
 * mirrors the real layout it stands in for — the same columns, the same row
 * height, the same number of rows. Anything looser and the page still jumps
 * when the data lands, which is the whole problem a skeleton exists to solve.
 *
 * The pulse is dropped under `prefers-reduced-motion`. The shape stays,
 * because the shape is the information.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('bg-foreground/[0.08] motion-safe:animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

/**
 * The frame a screenful of skeletons sits in.
 *
 * One `role="status"` around the whole placeholder rather than an aria label
 * on every grey block: a screen reader should hear *loading invoices*, once,
 * not eighty announcements of a rectangle. The blocks themselves are hidden
 * from the tree for the same reason.
 */
export function SkeletonScreen({
  label,
  className,
  children,
}: {
  /** What is loading, in the words the page itself uses. */
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  )
}
