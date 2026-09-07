import { Check, Minus } from 'lucide-react'
import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import type { HomeCopy } from '#/frontend/content/types'
import { useReveal } from '#/frontend/motion'

export function FitSection({ copy }: { copy: HomeCopy['fit'] }) {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  return (
    <Section ref={ref} id="passung">
      <Container className="flex flex-col gap-12">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} />

        <div className="grid gap-10 md:grid-cols-2 md:gap-12">
          <FitList title={copy.forTitle} items={copy.forItems} marker="check" />
          <FitList title={copy.notForTitle} items={copy.notForItems} marker="minus" />
        </div>

        <p
          data-reveal
          className="border-primary/40 text-foreground/85 max-w-2xl border-s-2 ps-5 text-lg leading-relaxed"
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
    <div data-reveal className="flex flex-col gap-4">
      <h3 className="text-lg font-medium">{title}</h3>
      <ul className="hairline-y flex flex-col">
        {items.map((item) => (
          <li key={item} className="text-foreground/85 flex gap-3 py-3 leading-relaxed">
            <Icon
              aria-hidden="true"
              className={marker === 'check' ? 'text-primary mt-1.5 size-4 shrink-0' : 'text-muted-foreground mt-1.5 size-4 shrink-0'}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
