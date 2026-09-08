import { Check, Minus } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import type { HomeCopy } from '#/frontend/content/types'
import { cn } from '#/frontend/lib/utils'

export function FitSection({ copy }: { copy: HomeCopy['fit'] }) {
  return (
    <Section id="passung">
      <Container className="flex flex-col gap-10">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} />

        <div className="grid gap-5 md:grid-cols-2">
          <FitList title={copy.forTitle} items={copy.forItems} marker="check" />
          <FitList title={copy.notForTitle} items={copy.notForItems} marker="minus" />
        </div>

        <p
          data-reveal
          className="max-w-2xl border-s-[3px] border-primary/50 ps-5 text-base leading-8 text-foreground/70 sm:text-[1.05rem]"
        >
          {copy.honesty}
        </p>
      </Container>
    </Section>
  )
}

function FitList({ title, items, marker }: { title: string; items: string[]; marker: 'check' | 'minus' }) {
  const Icon = marker === 'check' ? Check : Minus

  return (
    <div data-reveal className="surface-card flex flex-col gap-4 rounded-[1.75rem] px-7 py-7">
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item} className="flex gap-3 text-sm leading-7 text-foreground/62">
            <span
              className={cn(
                'mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full',
                marker === 'check' ? 'bg-primary/10 text-primary' : 'bg-muted text-foreground/45',
              )}
            >
              <Icon aria-hidden="true" className="size-3.5" />
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
