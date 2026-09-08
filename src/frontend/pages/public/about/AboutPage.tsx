import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { PortraitBlob } from '#/frontend/components/layout/public/PortraitBlob'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { getContent } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'

export function AboutPage() {
  const { language } = useLanguage()
  const { about } = getContent(language)

  return (
    <>
      <section className="pt-10 pb-14 sm:pt-14">
        <Container className="grid gap-12 md:grid-cols-[minmax(0,1.05fr)_minmax(280px,0.85fr)] md:items-center">
          <div className="fade-up flex max-w-2xl flex-col">
            <Eyebrow>{about.eyebrow}</Eyebrow>
            <h1 className="section-title mt-5 text-display-lg text-foreground">{about.title}</h1>
            <p className="hero-copy mt-6 text-base leading-8 sm:text-[1.05rem]">{about.intro}</p>
          </div>
          <PortraitBlob alt={about.portraitAlt} className="fade-up delay-2" />
        </Container>
      </section>

      <Section className="pt-4">
        <Container className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <h2 className="section-title max-w-sm text-display-md text-foreground">
            {about.story.title}
          </h2>
          <div className="flex flex-col gap-5">
            {about.story.paragraphs.map((paragraph) => (
              <p key={paragraph} className="m-0 text-base leading-8 text-foreground/62">
                {paragraph}
              </p>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-4">
        <Container className="flex flex-col gap-10">
          <h2 className="section-title text-display-md text-foreground">
            {about.method.title}
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {about.method.items.map((item) => (
              <div key={item.title} className="surface-card flex flex-col gap-2 rounded-[1.5rem] px-6 py-6">
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="m-0 text-sm leading-7 text-foreground/58">{item.body}</p>
              </div>
            ))}
          </div>

          <div
            className="flex max-w-3xl flex-col gap-3 rounded-[1.75rem] border border-primary/15 bg-primary/5 p-7 sm:p-9"
          >
            <h3 className="section-title text-display-sm text-foreground">{about.platform.title}</h3>
            <p className="m-0 text-base leading-8 text-foreground/62">{about.platform.body}</p>
          </div>
        </Container>
      </Section>

      <CtaBand title={about.cta.title} button={about.cta.button} />
    </>
  )
}
