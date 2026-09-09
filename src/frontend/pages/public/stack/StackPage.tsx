import { Link } from '@tanstack/react-router'
import { ArrowRight, Github, Linkedin, Mail } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { getContent, site } from '#/frontend/content'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords } from '#/frontend/motion'

/**
 * The hiring audience's page, deliberately kept out of the header nav. It
 * talks about architecture and trade-offs; the selling pages talk about
 * outcomes. Merging the two loses both readers.
 */
export function StackPage() {
  const { language } = useLanguage()
  const { stack } = getContent(language)

  return (
    <>
      <section className="pt-10 pb-14 sm:pt-14">
        <Container className="flex max-w-2xl flex-col">
          <Eyebrow>{stack.eyebrow}</Eyebrow>
          <h1 className="section-title mt-5 text-display-lg text-foreground">{stack.title}</h1>
          <p className="hero-copy mt-6 text-base leading-8 sm:text-[1.05rem]">{stack.intro}</p>
        </Container>
      </section>

      <Section tone="tint" className="pt-4">
        <Container className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <h2 className="section-title max-w-sm text-display-md text-foreground">
            <SplitWords text={stack.platform.title} />
          </h2>
          <div className="flex flex-col gap-6">
            <p data-reveal className="m-0 text-base leading-8 text-foreground/62">
              {stack.platform.body}
            </p>
            <dl className="hairline-y m-0 flex flex-col">
              {stack.platform.layers.map((layer) => (
                <div
                  key={layer.label}
                  data-reveal
                  className="flex flex-col gap-1 py-3.5 sm:flex-row sm:gap-6 first:pt-0 last:pb-0"
                >
                  <dt className="text-muted-foreground shrink-0 text-xs font-medium uppercase tracking-[0.12em] sm:w-44 sm:pt-1 rtl:tracking-normal">
                    {layer.label}
                  </dt>
                  <dd className="m-0 text-sm leading-7 text-foreground/85" dir="ltr">
                    {layer.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </Section>

      <Section className="pt-4">
        <Container className="flex flex-col gap-10">
          <div className="flex max-w-2xl flex-col gap-4">
            <h2 className="section-title text-display-md text-foreground">
              <SplitWords text={stack.decisions.title} />
            </h2>
            <p data-reveal className="m-0 text-base leading-8 text-foreground/62">
              {stack.decisions.intro}
            </p>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            {stack.decisions.items.map((item) => (
              <article
                key={item.title}
                data-reveal
                className="surface-card flex flex-col gap-3 rounded-[1.5rem] px-6 py-6"
              >
                <h3 className="text-lg font-semibold text-foreground">{item.title}</h3>
                <p className="m-0 text-sm leading-7 text-foreground/58">{item.body}</p>
                <div className="border-border mt-1 flex flex-col gap-1 border-t pt-3">
                  <span className="text-muted-foreground text-[0.7rem] font-semibold uppercase tracking-[0.14em] rtl:tracking-normal">
                    {item.costLabel}
                  </span>
                  <p className="m-0 text-sm leading-7 text-foreground/58">{item.cost}</p>
                </div>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="tint" className="pt-4">
        <Container className="grid gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <h2 className="section-title max-w-sm text-display-md text-foreground">
            <SplitWords text={stack.built.title} />
          </h2>
          <div className="flex flex-col items-start gap-6">
            <p data-reveal className="m-0 text-base leading-8 text-foreground/62">
              {stack.built.body}
            </p>
            <Button asChild data-reveal className="rounded-full bg-primary px-5 text-primary-foreground">
              <Link to="/$lang/work" params={{ lang: language }}>
                {stack.built.link}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Link>
            </Button>
          </div>
        </Container>
      </Section>

      <Section className="pt-4">
        <Container className="flex flex-col gap-6">
          <h2 className="section-title text-display-sm text-foreground">
            <SplitWords text={stack.links.title} />
          </h2>
          <div data-reveal className="flex flex-wrap gap-3">
            <Button asChild className="rounded-full bg-primary px-5 text-primary-foreground">
              <a href={`mailto:${site.email}`}>
                <Mail className="size-4" />
                {stack.links.email}
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-full border-border/60 bg-card px-5 text-foreground hover:border-primary/30 hover:bg-primary/5">
              <a href={site.github} target="_blank" rel="me noreferrer">
                <Github className="size-4" />
                GitHub
              </a>
            </Button>
            <Button asChild variant="outline" className="rounded-full border-border/60 bg-card px-5 text-foreground hover:border-primary/30 hover:bg-primary/5">
              <a href={site.linkedin} target="_blank" rel="me noreferrer">
                <Linkedin className="size-4" />
                LinkedIn
              </a>
            </Button>
          </div>
        </Container>
      </Section>
    </>
  )
}
