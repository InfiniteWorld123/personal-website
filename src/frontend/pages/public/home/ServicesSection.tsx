import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import { serviceOrder } from '#/frontend/content'
import type { HomeCopy, ServiceCopy, ServiceSlug } from '#/frontend/content/types'
import { ServiceCard } from '#/frontend/features/services/ServiceCard'
import type { Language } from '#/frontend/i18n/language'
import { useReveal } from '#/frontend/motion'

export function ServicesSection({
  copy,
  services,
  language,
}: {
  copy: HomeCopy['services']
  services: Record<ServiceSlug, ServiceCopy>
  language: Language
}) {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  return (
    <Section ref={ref} id="leistungen">
      <Container className="flex flex-col gap-10">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
        <div className="grid gap-5 md:grid-cols-3">
          {serviceOrder.map((slug) => (
            <ServiceCard
              key={slug}
              slug={slug}
              copy={services[slug]}
              language={language}
              fromLabel={copy.from}
              moreLabel={copy.more}
            />
          ))}
        </div>
      </Container>
    </Section>
  )
}
