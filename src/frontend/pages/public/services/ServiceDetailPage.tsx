import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import type { PublicServiceDetail } from '#/backend2/contracts/service.contract'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { getContent } from '#/frontend/content'
import { PRICE_WORDS, parseServiceBody } from '#/frontend/features/services/service-display'
import { PriceCard } from '#/frontend/features/services-public/ServicePrice'
import { SERVICE_WORDS } from '#/frontend/features/services-public/service-words'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'
import { SharedRules } from './ServicesPage'

/**
 * One service's page, as approved in the Services Design Lab: back to all
 * services, the name and short description, then what is included and the
 * longer text beside a price card that stays in view on a wide screen and
 * comes first on a phone. The shared rules and the call to action close it,
 * as they close `/services`.
 */
export function ServiceDetailPage({ service }: { service: PublicServiceDetail }) {
  const { language } = useLanguage()
  const { services } = getContent(language)
  const header = useReveal<HTMLElement>()
  const body = useReveal<HTMLElement>()
  const blocks = parseServiceBody(service.body)

  return (
    <>
      <section ref={header} data-reveal-scope="" className="pt-12 pb-6 sm:pt-16">
        <Container className="flex flex-col gap-10">
          <Link
            data-reveal
            to="/$lang/services"
            params={{ lang: language }}
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {SERVICE_WORDS[language].all}
          </Link>

          <div className="flex max-w-3xl flex-col gap-5">
            <Eyebrow data-reveal>{services.eyebrow}</Eyebrow>
            <h1 className="section-title mt-5 text-display-lg text-foreground">
              <SplitWords text={service.name} />
            </h1>
            <p data-reveal className="hero-copy max-w-2xl text-base leading-8 sm:text-[1.05rem]">
              {service.summary}
            </p>
          </div>
        </Container>
      </section>

      <section ref={body} data-reveal-scope="" className="pt-4 pb-section lg:pb-section-lg">
        <Container className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-16">
          {service.price ? (
            <aside data-reveal className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1 lg:self-start">
              <PriceCard price={service.price} language={language} />
            </aside>
          ) : null}

          <div className="flex min-w-0 flex-col gap-10 lg:col-start-1 lg:row-start-1">
            <div data-reveal className="flex flex-col gap-3">
              <h2 className="text-base font-medium">{PRICE_WORDS[language].includes}</h2>
              <ul className="hairline-y flex flex-col">
                {service.included.map((item, index) => (
                  <li key={index} className="text-foreground/80 py-2.5 text-sm leading-relaxed">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {blocks.length ? (
              <div className="flex max-w-2xl flex-col gap-4">
                {blocks.map((block, index) =>
                  block.type === 'h' ? (
                    <h3 key={index} data-reveal className="mt-2 text-[1.05rem] font-semibold text-foreground">
                      {block.text}
                    </h3>
                  ) : block.type === 'ul' ? (
                    <ul key={index} data-reveal className="flex flex-col gap-2">
                      {block.items.map((item, at) => (
                        <li
                          key={at}
                          className="relative ps-[22px] leading-[1.75] text-foreground/82 before:absolute before:start-1 before:top-[0.8em] before:size-[7px] before:rounded-full before:bg-primary before:opacity-80"
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p key={index} data-reveal className="leading-[1.9] text-foreground/88">
                      {block.text}
                    </p>
                  ),
                )}
              </div>
            ) : null}
          </div>
        </Container>
      </section>

      <SharedRules copy={services.shared} language={language} />

      <CtaBand title={services.cta.title} body={services.cta.body} button={services.cta.button} />
    </>
  )
}
