import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { getContent, serviceOrder, servicePrices } from '#/frontend/content'
import type { ServiceCopy, ServiceSlug } from '#/frontend/content/types'
import type { Language } from '#/frontend/i18n/language'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { formatEuro } from '#/frontend/lib/format'
import { SplitWords, useReveal } from '#/frontend/motion'

export function ServicesPage() {
  const { language } = useLanguage()
  const { services } = getContent(language)
  const header = useReveal<HTMLElement>()

  return (
    <>
      <section ref={header} data-reveal-scope="" className="pt-16 pb-6 sm:pt-24">
        <Container className="flex max-w-3xl flex-col gap-5">
          <Eyebrow data-reveal>{services.eyebrow}</Eyebrow>
          <h1 className="section-title mt-5 text-display-lg text-foreground">
            <SplitWords text={services.title} />
          </h1>
          <p data-reveal className="hero-copy text-base leading-8 sm:text-[1.05rem]">
            {services.intro}
          </p>
        </Container>
      </section>

      {serviceOrder.map((slug, index) => (
        <ServiceDetail
          key={slug}
          slug={slug}
          copy={services.items[slug]}
          language={language}
          fromLabel={services.from}
          tone={index % 2 === 0 ? 'tint' : 'page'}
        />
      ))}

      <SharedRules copy={services.shared} />

      <CtaBand title={services.cta.title} body={services.cta.body} button={services.cta.button} />
    </>
  )
}

function ServiceDetail({
  slug,
  copy,
  language,
  fromLabel,
  tone,
}: {
  slug: ServiceSlug
  copy: ServiceCopy
  language: Language
  fromLabel: string
  tone: 'tint' | 'page'
}) {
  return (
    <Section id={slug} tone={tone} className="scroll-mt-20">
      <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <h2 className="section-title text-display-md text-foreground">
            <SplitWords text={copy.name} />
          </h2>
          <p data-reveal className="text-primary tabular text-lg font-medium">
            {fromLabel} {formatEuro(servicePrices[slug], language)}
          </p>
          <p data-reveal className="text-muted-foreground leading-relaxed">
            {copy.short}
          </p>
        </div>

        <div className="flex flex-col gap-10">
          <p data-reveal className="text-foreground/90 text-lg leading-relaxed">
            {copy.promise}
          </p>

          <div className="grid gap-10 sm:grid-cols-2">
            <DetailList title={copy.audienceTitle} items={copy.audience} />
            <DetailList title={copy.includesTitle} items={copy.includes} />
          </div>

          <div data-reveal className="border-border flex flex-col gap-2 border-t pt-6">
            <h3 className="text-base font-medium">{copy.priceTitle}</h3>
            <p className="section-title tabular text-2xl text-primary">{copy.price}</p>
            <p className="text-muted-foreground text-sm leading-relaxed">{copy.priceNote}</p>
          </div>

          <div data-reveal className="border-border flex flex-col gap-2 border-t pt-6">
            <h3 className="text-base font-medium">{copy.boundaryTitle}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed">{copy.boundary}</p>
          </div>
        </div>
      </Container>
    </Section>
  )
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div data-reveal className="flex flex-col gap-3">
      <h3 className="text-base font-medium">{title}</h3>
      <ul className="hairline-y flex flex-col">
        {items.map((item) => (
          <li key={item} className="text-foreground/80 py-2.5 text-sm leading-relaxed">
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function SharedRules({ copy }: { copy: ReturnType<typeof getContent>['services']['shared'] }) {
  return (
    <Section>
      <Container className="flex flex-col gap-10">
        <h2 className="section-title max-w-2xl text-display-md text-foreground">
          <SplitWords text={copy.title} />
        </h2>
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {copy.items.map((item) => (
            <div key={item.title} data-reveal className="border-border flex flex-col gap-2 border-t pt-5">
              <h3 className="text-base font-medium">{item.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{item.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </Section>
  )
}
