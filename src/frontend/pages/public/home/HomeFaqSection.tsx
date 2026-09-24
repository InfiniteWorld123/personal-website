import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import type { FaqCopy } from '#/frontend/content/types'

/**
 * The landing page repeats the FAQ's single source of truth in compact,
 * keyboard-accessible native disclosure controls. The full FAQ page keeps the
 * answers visible for readers who want to scan everything at once.
 */
export function HomeFaqSection({ copy }: { copy: FaqCopy }) {
  return (
    <Section id="faq" tone="tint">
      <Container className="flex flex-col gap-10">
        <SectionHeading
          eyebrow={copy.eyebrow}
          title={copy.title}
          sub={copy.intro}
        />
        <div className="grid gap-8 lg:grid-cols-3">
          {copy.groups.map((group, index) => (
            <section key={group.title} className="flex flex-col" aria-labelledby={`faq-group-${index}`}>
              <div className="mb-5 border-primary/80 border-l-2 pl-3 rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-3">
                <h3 id={`faq-group-${index}`} data-reveal className="text-base font-semibold text-foreground">
                  {group.title}
                </h3>
              </div>
              <div className="border-border/60 border-y">
                {group.items.map((item) => (
                  <HomeFaqItem
                    key={item.question}
                    item={item}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </Container>
    </Section>
  )
}

function HomeFaqItem({ item }: { item: FaqCopy['groups'][number]['items'][number] }) {
  const [open, setOpen] = useState(false)
  const answerId = useId()
  return (
    <div data-reveal className="border-border/60 border-b py-4 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-full cursor-pointer items-start justify-between gap-4 text-start text-sm font-semibold leading-6 text-foreground"
      >
        <span>
          {item.question}
        </span>
        <ChevronDown className={`mt-1 size-4 shrink-0 text-primary transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <div id={answerId}>
          <p className="mb-0 mt-3 pr-6 text-sm leading-7 text-foreground/62 rtl:pr-0 rtl:pl-6">
            {item.answer}
          </p>
        </div>
      ) : null}
    </div>
  )
}
