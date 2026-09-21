import type { CSSProperties } from 'react'
import { BrandMark } from '#/frontend/components/layout/public/BrandMark'
import { cn } from '#/frontend/lib/utils'

/**
 * The owner's own mark, in the dashboard's colours.
 *
 * It is the public site's `BrandMark` rather than a drawing of its own, so the
 * two can never drift apart: the letter, the caret and the proportions are
 * defined once. Only the colours are answered here.
 *
 * The glyph strokes its arms with `currentColor`, which the sidebar already
 * sets, and its caret with `--primary` — a public-site token the dashboard
 * deliberately does not inherit. That variable is reassigned on this wrapper
 * alone, so the caret takes the dashboard's accent and nothing outside this
 * span is affected.
 *
 * The accent, not the brand fill: on the public site the caret follows
 * `--primary`, which lightens in dark so it still reads against a dark header.
 * `--dash-blue` is the dashboard's token that does the same, and it is the
 * same `#355cff` in light.
 *
 * It is set inline rather than in `dashboard.css` because the rule it has to
 * beat is unlayered, and everything in that file sits in Tailwind's
 * `components` layer — where it would lose.
 */
export function DashboardMark({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn('grid shrink-0 place-items-center', className)}
      style={{ '--primary': 'var(--dash-blue)' } as CSSProperties}
    >
      <BrandMark size={size} />
    </span>
  )
}
