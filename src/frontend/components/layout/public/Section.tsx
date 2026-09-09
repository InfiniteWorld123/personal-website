import type { ComponentProps } from 'react'
import { Badge } from '#/frontend/components/ui/badge'
import { SplitWords, useReveal } from '#/frontend/motion'
import { cn } from '#/frontend/lib/utils'

type SectionProps = ComponentProps<'section'> & {
  /** `tint` gives the section the soft blue wash used behind the contact area. */
  tone?: 'page' | 'tint'
}

/**
 * Every section is also a reveal scope: its `[data-reveal]` descendants rise
 * in sequence the first time the section scrolls into view.
 */
export function Section({ className, tone = 'page', ...props }: SectionProps) {
  const ref = useReveal<HTMLElement>()

  return (
    <section
      className={cn('py-section lg:py-section-lg', tone === 'tint' && 'contact-light', className)}
      data-reveal-scope=""
      {...props}
      ref={ref}
    />
  )
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  className,
}: {
  eyebrow?: string
  title: string
  sub?: string
  className?: string
}) {
  return (
    <div className={cn('flex max-w-2xl flex-col', className)}>
      {eyebrow ? <Eyebrow data-reveal>{eyebrow}</Eyebrow> : null}
      <h2 className="section-title mt-5 text-display-md text-foreground">
        <SplitWords text={title} />
      </h2>
      {sub ? (
        <p data-reveal className="mt-4 text-base leading-8 text-foreground/58 sm:text-[1.05rem]">
          {sub}
        </p>
      ) : null}
    </div>
  )
}

/** Small outlined chip above a section title. */
export function Eyebrow({ className, children, ...props }: ComponentProps<'span'>) {
  return (
    <span className={cn('inline-flex w-fit', className)} {...props}>
      <Badge variant="outline" className="section-chip rounded-full px-3 py-1 text-[0.74rem] font-semibold">
        {children}
      </Badge>
    </span>
  )
}
