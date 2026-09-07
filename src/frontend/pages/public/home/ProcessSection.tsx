import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import type { HomeCopy } from '#/frontend/content/types'
import { useReveal } from '#/frontend/motion'

/** The steps are a real sequence, so they are numbered. */
export function ProcessSection({ copy }: { copy: HomeCopy['process'] }) {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  return (
    <Section ref={ref} id="ablauf" tone="paper">
      <Container className="flex flex-col gap-12">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {copy.steps.map((step, index) => (
            <li key={step.title} data-reveal className="border-border flex flex-col gap-3 border-t pt-5">
              <span className="font-heading text-primary tabular text-2xl">{index + 1}</span>
              <h3 className="text-lg font-medium">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  )
}
