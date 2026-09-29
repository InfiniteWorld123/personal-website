import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { getContent, type IndustryId } from '#/frontend/content'
import { INDUSTRY_SLUGS, industryOrder } from '#/frontend/features/industries/industries'
import type { Language } from '#/frontend/i18n/language'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'

/**
 * `/webdesign-erfurt`: the industries at a glance, each a card that leads to
 * its own page, then the way to all packages and the call to book a call.
 */
export function IndustriesHubPage() {
  const { language } = useLanguage()
  const { industries } = getContent(language)
  const { hub } = industries
  const header = useReveal<HTMLElement>()

  return (
    <>
      <section ref={header} data-reveal-scope="" className="pt-16 pb-6 sm:pt-24">
        <Container className="flex max-w-3xl flex-col gap-5">
          <Eyebrow data-reveal>{hub.eyebrow}</Eyebrow>
          <h1 className="section-title mt-5 text-display-lg text-foreground">
            <SplitWords text={hub.title} />
          </h1>
          <p data-reveal className="hero-copy text-base leading-8 sm:text-[1.05rem]">
            {hub.intro}
          </p>
        </Container>
      </section>

      <Section>
        <Container className="flex flex-col gap-10">
          <h2 className="section-title max-w-2xl text-display-md text-foreground">
            <SplitWords text={hub.cardsTitle} />
          </h2>
          <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2">
            {industryOrder.map((id) => {
              const page = industries.pages[id]

              return (
                <li key={id} data-reveal className="flex">
                  <Link
                    to="/$lang/webdesign-erfurt/$industry"
                    params={{ lang: language, industry: INDUSTRY_SLUGS[id] }}
                    className="group border-border/60 bg-card hover:border-primary/30 flex w-full flex-col gap-3 rounded-2xl border p-6 transition-colors"
                  >
                    <h3 className="text-lg font-semibold text-foreground">{page.card.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">{page.card.body}</p>
                    <span className="text-primary mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-medium">
                      {hub.cardLink}
                      <ArrowRight className="btn-arrow size-4 rtl:-scale-x-100" />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
          <ServicesLink label={industries.servicesLink} language={language} />
        </Container>
      </Section>

      <CtaBand
        title={industries.cta.title}
        body={industries.cta.body}
        button={industries.cta.button}
        to="/$lang/booking"
      />
    </>
  )
}

/**
 * `/webdesign-erfurt/<slug>`: one industry. What its customers look for, which
 * package fits, the questions it asks, and the call to book a call.
 */
export function IndustryPage({ id }: { id: IndustryId }) {
  const { language } = useLanguage()
  const { industries } = getContent(language)
  const page = industries.pages[id]
  const header = useReveal<HTMLElement>()

  return (
    <>
      <section ref={header} data-reveal-scope="" className="pt-12 pb-6 sm:pt-16">
        <Container className="flex flex-col gap-10">
          <Link
            data-reveal
            to="/$lang/webdesign-erfurt"
            params={{ lang: language }}
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {industries.hub.eyebrow}
          </Link>

          <div className="flex max-w-3xl flex-col gap-5">
            <h1 className="section-title text-display-lg text-foreground">
              <SplitWords text={page.title} />
            </h1>
            <p data-reveal className="hero-copy max-w-2xl text-base leading-8 sm:text-[1.05rem]">
              {page.intro}
            </p>
          </div>
        </Container>
      </section>

      <Section className="pt-4">
        <Container className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <h2 className="section-title max-w-sm text-display-md text-foreground">
            <SplitWords text={page.needs.title} />
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {page.needs.items.map((item, index) => (
              <li
                key={index}
                data-reveal
                className="relative ps-[22px] leading-[1.75] text-foreground/82 before:absolute before:start-1 before:top-[0.8em] before:size-[7px] before:rounded-full before:bg-primary before:opacity-80"
              >
                {item}
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="tint">
        <Container className="grid gap-12 md:grid-cols-2">
          {[page.packages, page.local].map((block) =>
            block ? (
              <div key={block.title} className="flex max-w-xl flex-col gap-4">
                <h2 className="section-title text-display-md text-foreground">
                  <SplitWords text={block.title} />
                </h2>
                <p data-reveal className="leading-[1.9] text-foreground/82">
                  {block.body}
                </p>
                {block === page.packages ? (
                  <ServicesLink label={industries.servicesLink} language={language} />
                ) : null}
              </div>
            ) : null,
          )}
        </Container>
      </Section>

      <Section>
        <Container className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <h2 className="section-title max-w-sm text-display-md text-foreground">
            <SplitWords text={industries.faqTitle} />
          </h2>
          <dl className="hairline-y m-0 flex flex-col">
            {page.faq.map((item) => (
              <div key={item.question} data-reveal className="flex flex-col gap-2 py-6 first:pt-0 last:pb-0">
                <dt className="text-lg font-semibold text-foreground">{item.question}</dt>
                <dd className="m-0 text-base leading-8 text-foreground/62">{item.answer}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </Section>

      <CtaBand
        title={industries.cta.title}
        body={industries.cta.body}
        button={industries.cta.button}
        to="/$lang/booking"
      />
    </>
  )
}

function ServicesLink({ label, language }: { label: string; language: Language }) {
  return (
    <Link
      data-reveal
      to="/$lang/services"
      params={{ lang: language }}
      className="text-primary hover:text-primary/80 inline-flex w-fit items-center gap-1.5 text-sm font-medium"
    >
      {label}
      <ArrowRight className="btn-arrow size-4 rtl:-scale-x-100" />
    </Link>
  )
}
