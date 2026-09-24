import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { getContent } from '#/frontend/content'
import type { Language } from '#/frontend/i18n/language'
import { useLanguage } from '#/frontend/i18n/language-provider'
import type { ServicesPageData } from '#/frontend/features/services-public/server/services-source'
import { ServicesListV2 } from '#/frontend/features/services-public/ServicesListV2'
import { SplitWords, useReveal } from '#/frontend/motion'

/**
 * The services page: the header, Backend2's approved list
 * (`docs/v2/public-cutover.md` step 2), the shared rules and the call to action.
 */
export function ServicesPage({ data, page = 1 }: { data: ServicesPageData; page?: number }) {
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

      <ServicesListV2 data={data} page={page} language={language} />

      <SharedRules copy={services.shared} language={language} />

      <CtaBand title={services.cta.title} body={services.cta.body} button={services.cta.button} />
    </>
  )
}

export function SharedRules({
  copy,
  language,
}: {
  copy: ReturnType<typeof getContent>['services']['shared']
  language: Language
}) {
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
        <Link
          data-reveal
          to="/$lang/faq"
          params={{ lang: language }}
          className="text-primary hover:text-primary/80 inline-flex w-fit items-center gap-1.5 text-sm font-medium"
        >
          {copy.faqLink}
          <ArrowRight className="btn-arrow size-4 rtl:-scale-x-100" />
        </Link>
      </Container>
    </Section>
  )
}
