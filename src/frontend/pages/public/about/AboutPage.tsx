import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { getContent, site } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { useReveal } from '#/frontend/motion'

export function AboutPage() {
  const { language } = useLanguage()
  const { about } = getContent(language)
  const introRef = useRef<HTMLElement>(null)
  const storyRef = useRef<HTMLElement>(null)
  const methodRef = useRef<HTMLElement>(null)
  useReveal(introRef)
  useReveal(storyRef)
  useReveal(methodRef)

  return (
    <>
      <section ref={introRef} className="pt-16 pb-14 sm:pt-24">
        <Container className="grid gap-10 md:grid-cols-[2fr_1fr] md:items-end md:gap-16">
          <div className="flex flex-col gap-5">
            <Eyebrow data-reveal>{about.eyebrow}</Eyebrow>
            <h1 data-reveal className="font-heading text-display-lg">
              {about.title}
            </h1>
            <p data-reveal className="text-muted-foreground text-lg leading-relaxed">
              {about.intro}
            </p>
          </div>
          <img
            data-reveal
            src={site.portrait}
            alt={about.portraitAlt}
            width={400}
            height={400}
            className="border-border aspect-square w-full max-w-xs rounded-2xl border object-cover md:max-w-none"
          />
        </Container>
      </section>

      <Section ref={storyRef} tone="paper">
        <Container className="grid gap-8 md:grid-cols-[1fr_2fr] md:gap-16">
          <h2 data-reveal className="font-heading text-display-sm">
            {about.story.title}
          </h2>
          <div className="flex max-w-2xl flex-col gap-5">
            {about.story.paragraphs.map((paragraph) => (
              <p key={paragraph} data-reveal className="text-foreground/85 text-lg leading-relaxed">
                {paragraph}
              </p>
            ))}
          </div>
        </Container>
      </Section>

      <Section ref={methodRef}>
        <Container className="flex flex-col gap-12">
          <h2 data-reveal className="font-heading text-display-md">
            {about.method.title}
          </h2>
          <div className="grid gap-8 sm:grid-cols-2">
            {about.method.items.map((item) => (
              <div key={item.title} data-reveal className="border-border flex flex-col gap-2 border-t pt-5">
                <h3 className="text-lg font-medium">{item.title}</h3>
                <p className="text-muted-foreground leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <div data-reveal className="bg-muted flex max-w-3xl flex-col gap-3 rounded-2xl p-6 sm:p-8">
            <h3 className="font-heading text-display-sm">{about.platform.title}</h3>
            <p className="text-foreground/85 leading-relaxed">{about.platform.body}</p>
          </div>
        </Container>
      </Section>

      <CtaBand title={about.cta.title} button={about.cta.button} />
    </>
  )
}
