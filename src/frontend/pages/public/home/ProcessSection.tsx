import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import type { HomeCopy } from '#/frontend/content/types'
import { ProcessConnector } from './ProcessConnector'

/**
 * The steps are a real sequence, so they are numbered, tilted like four cards
 * dropped on a desk, and joined by a line that draws itself as the section
 * arrives. Nothing here reacts to hover: the cards are a diagram, not a menu.
 */
export function ProcessSection({ copy }: { copy: HomeCopy['process'] }) {
  return (
    <Section id="ablauf">
      <Container className="flex flex-col gap-10">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
        <div className="steps-stage">
          <ProcessConnector />
          <ol className="steps-grid">
            {copy.steps.map((step, index) => (
              <li className="step-wrap" key={step.title}>
                <article className="step">
                  <i className="step-anchor step-anchor-out" aria-hidden="true" />
                  <i className="step-anchor step-anchor-in" aria-hidden="true" />
                  <span className="step-num tabular" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="section-title text-display-sm text-foreground">{step.title}</h3>
                  <p className="m-0 text-sm leading-7 text-foreground/58">{step.body}</p>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </Container>
    </Section>
  )
}
