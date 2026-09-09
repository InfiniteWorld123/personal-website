import { cn } from '#/frontend/lib/utils'

/**
 * The site's mark: a Y whose lower stem carries the accent colour, the way a
 * caret sits at the end of a line in an editor.
 *
 * It is one connected letter on purpose. The rejected alternative put the
 * caret beside the Y as a separate bar, which reads as a second letter — "YI"
 * — once the mark is drawn at favicon size, and disappears entirely in a
 * single-colour print.
 *
 * Stroke weight is 5 on a 48 grid because the mark stands alone on small
 * screens, with no wordmark beside it to carry the weight.
 *
 * Animation lives in `styles.css` under `.brand-glyph`, gated by `html.motion`
 * so the resting state here is already the finished letter.
 */
export function BrandMark({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <svg
      className={cn('brand-glyph', className)}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="brand-glyph-arms"
        d="M10 10 L24 27 L38 10"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path className="brand-glyph-stem" d="M24 27 V33" strokeWidth="5" strokeLinecap="round" />
      <path className="brand-glyph-caret" d="M24 34 V42" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}
