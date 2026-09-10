import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { PortraitBlob } from '#/frontend/components/layout/public/PortraitBlob'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { getContent } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useTilt } from '#/frontend/motion'

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
        <Container className="flex flex-col gap-12">
          <h2 className="section-title max-w-sm text-display-md text-foreground">
            <SplitWords text={about.story.title} />
          </h2>
          {about.story.chapters.map((chapter) => (
            <div key={chapter.title} className="grid gap-6 md:grid-cols-[0.9fr_1.1fr] md:gap-8">
              <h3 data-reveal className="text-foreground max-w-xs text-xl font-semibold">
                {chapter.title}
              </h3>
              <div className="flex flex-col gap-5">
                {chapter.paragraphs.map((paragraph) => (
                  <p key={paragraph} data-reveal className="m-0 text-base leading-8 text-foreground/62">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </Container>
      </Section>

      <Section tone="tint" className="pt-4">
        <Container className="flex flex-col gap-10">
          <h2 className="section-title text-display-md text-foreground">
            <SplitWords text={about.method.title} />
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {about.method.items.map((item) => (
              <MethodCard key={item.title} title={item.title} body={item.body} />
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pt-4">
        <Container className="flex flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-4">
            <h2 className="section-title text-display-md text-foreground">
              <SplitWords text={about.expect.title} />
            </h2>
            <p data-reveal className="m-0 text-base leading-8 text-foreground/62">
              {about.expect.intro}
            </p>
          </div>
          <dl className="hairline-y m-0 grid gap-x-10 sm:grid-cols-2">
            {about.expect.items.map((item) => (
              <div key={item.title} data-reveal className="flex flex-col gap-2 py-5">
                <dt className="text-base font-semibold text-foreground">{item.title}</dt>
                <dd className="m-0 text-sm leading-7 text-foreground/58">{item.body}</dd>
              </div>
            ))}
          </dl>

          <div
            data-reveal
            className="flex max-w-3xl flex-col items-start gap-3 rounded-[1.75rem] border border-primary/15 bg-primary/5 p-7 sm:p-9"
          >
            <h3 className="section-title text-display-sm text-foreground">{about.platform.title}</h3>
            <p className="m-0 text-base leading-8 text-foreground/62">{about.platform.body}</p>
            <Link
              to="/$lang/stack"
              params={{ lang: language }}
              className="text-primary hover:text-primary/80 mt-1 inline-flex items-center gap-1.5 text-sm font-medium"
            >
              {about.platform.link}
              <ArrowRight className="btn-arrow size-4 rtl:-scale-x-100" />
            </Link>
          </div>
        </Container>
      </Section>

      <CtaBand title={about.cta.title} body={about.cta.body} button={about.cta.button} alt={about.cta.alt} />
    </>
  )
}

/** One working principle, as a card that leans towards the pointer. */
function MethodCard({ title, body }: { title: string; body: string }) {
  const tilt = useTilt<HTMLDivElement>()

  return (
    <div
      data-reveal
      data-tilt
      ref={tilt}
      className="surface-card surface-card-hover flex flex-col gap-2 rounded-[1.5rem] px-6 py-6"
    >
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="m-0 text-sm leading-7 text-foreground/58">{body}</p>
    </div>
  )
}
