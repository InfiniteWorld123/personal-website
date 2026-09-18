import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '#/frontend/lib/utils'

/**
 * One folded band in a conversation: a title, how many things are inside, and
 * a chevron.
 *
 * Its own file because the thread uses it too. Nine one-line messages filled
 * the whole screen before anything else could be seen, and his answer was to
 * make the letters fold away the way notes already did — so Messages, Details
 * and Notes are now three bands of the same kind rather than one long scroll
 * with two bands underneath it.
 */
export function Section({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string
  count: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="border-border/60 border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="hover:bg-accent/50 focus-visible:ring-ring flex w-full items-center gap-2 px-4 py-3 text-start motion-safe:transition-colors focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'text-muted-foreground size-4 motion-safe:transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{count}</span>
      </button>

      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  )
}
