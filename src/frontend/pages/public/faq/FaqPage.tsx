import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { getContent } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords } from '#/frontend/motion'

/**
 * The objections that come up at this deal size, answered before the visitor
 * has to ask. Every answer is visible text rather than an accordion: the page
 * is meant to be scanned, and its `FAQPage` markup should describe what is
 * actually on screen.
 */
export function FaqPage() {
  const { language } = useLanguage()
  const { faq, home } = getContent(language)

  return (
    <>
      <section className="pt-10 pb-14 sm:pt-14">
        <Container className="flex max-w-2xl flex-col">
          <Eyebrow>{faq.eyebrow}</Eyebrow>
          <h1 className="section-title mt-5 text-display-lg text-foreground">{faq.title}</h1>
          <p className="hero-copy mt-6 text-base leading-8 sm:text-[1.05rem]">{faq.intro}</p>
        </Container>
      </section>

      {faq.groups.map((group, index) => (
        <Section key={group.title} tone={index % 2 === 1 ? 'tint' : undefined} className="pt-4">
          <Container className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
            <h2 className="section-title max-w-sm text-display-md text-foreground">
              <SplitWords text={group.title} />
            </h2>
            <dl className="hairline-y m-0 flex flex-col">
              {group.items.map((item) => (
                <div key={item.question} data-reveal className="flex flex-col gap-2 py-6 first:pt-0 last:pb-0">
                  <dt className="text-lg font-semibold text-foreground">{item.question}</dt>
                  <dd className="m-0 text-base leading-8 text-foreground/62">{item.answer}</dd>
                </div>
              ))}
            </dl>
          </Container>
        </Section>
      ))}

      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}
