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
    <Section ref={ref} id="ablauf">
      <Container className="flex flex-col gap-10">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {copy.steps.map((step, index) => (
            <li
              key={step.title}
              data-reveal
              className="surface-card flex flex-col gap-3 rounded-[1.5rem] px-6 py-6"
            >
              <span className="brand-mark tabular text-sm font-black text-primary">{index + 1}</span>
              <h3 className="text-lg leading-snug font-semibold text-foreground">{step.title}</h3>
              <p className="m-0 text-sm leading-7 text-foreground/58">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  )
}
