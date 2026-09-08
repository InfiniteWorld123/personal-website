import type { ComponentProps } from 'react'
import { Badge } from '#/frontend/components/ui/badge'
import { cn } from '#/frontend/lib/utils'

type SectionProps = ComponentProps<'section'> & {
  /** `tint` gives the section the soft blue wash used behind the contact area. */
  tone?: 'page' | 'tint'
}

export function Section({ className, tone = 'page', ...props }: SectionProps) {
  return (
    <section
      className={cn('py-section lg:py-section-lg', tone === 'tint' && 'contact-light', className)}
      {...props}
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
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="section-title mt-5 text-display-md text-foreground">
        {title}
      </h2>
      {sub ? (
        <p className="mt-4 text-base leading-8 text-foreground/58 sm:text-[1.05rem]">
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
