import type { ComponentProps } from 'react'
import { cn } from '#/frontend/lib/utils'

type SectionProps = ComponentProps<'section'> & {
  /** `paper` lifts the section onto a white surface; `page` stays on the ground. */
  tone?: 'page' | 'paper'
}

export function Section({ className, tone = 'page', ...props }: SectionProps) {
  return (
    <section
      className={cn(
        'py-section lg:py-section-lg',
        tone === 'paper' && 'surface-paper border-border border-y',
        className,
      )}
      {...props}
    />
  )
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = 'start',
  className,
}: {
  eyebrow?: string
  title: string
  sub?: string
  align?: 'start' | 'center'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex max-w-2xl flex-col gap-3',
        align === 'center' && 'mx-auto items-center text-center',
        className,
      )}
    >
      {eyebrow ? <Eyebrow data-reveal>{eyebrow}</Eyebrow> : null}
      <h2 data-reveal className="font-heading text-display-md text-foreground">
        {title}
      </h2>
      {sub ? (
        <p data-reveal className="text-muted-foreground text-base leading-relaxed sm:text-lg">
          {sub}
        </p>
      ) : null}
    </div>
  )
}

export function Eyebrow({ className, ...props }: ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'text-primary text-xs font-medium tracking-[0.12em] uppercase',
        'rtl:tracking-normal',
        className,
      )}
      {...props}
    />
  )
}
