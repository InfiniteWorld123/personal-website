import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import type { HomeCopy, ServiceCopy, ServiceSlug } from '#/frontend/content/types'
import { ServiceCard } from '#/frontend/features/services/ServiceCard'
import type { Language } from '#/frontend/i18n/language'

/**
 * The home page's own card hierarchy, per `docs/content-decisions.md` C8:
 * websites, then online stores, then custom software. The shared
 * `serviceOrder` keeps its own order for `/services` and the hero pills.
 */
const homeServiceOrder: ServiceSlug[] = ['websites', 'shopify', 'software']

export function ServicesSection({
  copy,
  services,
  language,
}: {
  copy: HomeCopy['services']
  services: Record<ServiceSlug, ServiceCopy>
  language: Language
}) {
  return (
    <Section id="leistungen">
      <Container className="flex flex-col gap-10">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
        <div className="grid gap-5 md:grid-cols-3">
          {homeServiceOrder.map((slug) => (
            <ServiceCard
              key={slug}
              slug={slug}
              copy={services[slug]}
              description={copy.cards[slug]}
              language={language}
              moreLabel={copy.more}
            />
          ))}
        </div>
      </Container>
    </Section>
  )
}
