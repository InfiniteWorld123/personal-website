import { cn } from '#/frontend/lib/utils'

/**
 * The dashboard's own mark.
 *
 * The public site's `BrandMark` is a drawn `Y` with an animated caret; it
 * introduces the site to a visitor who has never seen it. This one sits in a
 * corner the owner looks at every morning, so it is the same letter with the
 * caret folded into it, set solid inside the brand square — legible at 32px,
 * still the same shape, and it never animates.
 */
export function DashboardMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center rounded-[9px]', className)}
      style={{ width: size, height: size, background: 'var(--dash-brand)' }}
    >
      <svg
        width={Math.round(size * 0.53)}
        height={Math.round(size * 0.53)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d="M6 6l6 8 6-8" />
        <path d="M12 15v4" />
      </svg>
    </span>
  )
}
