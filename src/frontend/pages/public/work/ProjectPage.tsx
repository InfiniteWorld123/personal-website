import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight, Github } from 'lucide-react'
import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { getContent, projects } from '#/frontend/content'
import type { ProjectSlug } from '#/frontend/content/types'
import { ProjectFrame, ProjectStatusPill } from '#/frontend/features/work/ProjectCard'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { useReveal } from '#/frontend/motion'

export function ProjectPage({ slug }: { slug: ProjectSlug }) {
  const { language } = useLanguage()
  const { work, home } = getContent(language)
  const copy = work.items[slug]
  const facts = projects[slug]
  const headerRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLElement>(null)
  useReveal(headerRef)
  useReveal(bodyRef)

  return (
    <>
      <section ref={headerRef} className="pt-12 pb-10 sm:pt-16">
        <Container className="flex flex-col gap-10">
          <Link
            data-reveal
            to="/$lang/work"
            params={{ lang: language }}
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-sm"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" />
            {work.back}
          </Link>

          <div className="flex max-w-3xl flex-col gap-5">
            <div data-reveal className="flex flex-wrap items-center gap-3">
              <Eyebrow>{copy.kind}</Eyebrow>
              <ProjectStatusPill status={facts.status} labels={work.status} />
            </div>
            <h1 data-reveal className="section-title mt-5 text-display-lg text-foreground">
              {copy.name}
            </h1>
            <p data-reveal className="hero-copy text-base leading-8 sm:text-[1.05rem]">
              {copy.summary}
            </p>
            <div data-reveal className="flex flex-wrap gap-3 pt-2">
              {facts.website ? (
                <Button asChild className="btn-glow-primary rounded-full bg-primary px-5 text-primary-foreground shadow-[0_10px_28px_rgba(53,92,255,0.26)] hover:bg-primary/90">
                  <a href={facts.website} target="_blank" rel="noreferrer">
                    {work.visit}
                    <ArrowUpRight className="size-4 rtl:-scale-x-100" />
                  </a>
                </Button>
              ) : null}
              {facts.source ? (
                <Button asChild variant="outline" className="btn-glow-outline rounded-full border-border/60 bg-card px-5 text-foreground hover:border-primary/30 hover:bg-primary/5">
                  <a href={facts.source} target="_blank" rel="noreferrer">
                    <Github className="size-4" />
                    {work.source}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          <div data-reveal>
            <ProjectFrame name={copy.name} />
          </div>
        </Container>
      </section>

      <Section ref={bodyRef} tone="tint">
        <Container className="grid gap-12 lg:grid-cols-[2fr_1fr] lg:gap-16">
          <div className="flex max-w-2xl flex-col gap-10">
            <Block title={work.detail.problem} body={copy.problem} />
            <Block title={work.detail.approach} body={copy.approach} />
            <Block title={work.detail.shows} body={copy.shows} />
          </div>

          <aside className="flex flex-col gap-10 lg:sticky lg:top-24 lg:self-start">
            <div data-reveal className="flex flex-col gap-3">
              <h2 className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase rtl:tracking-normal">
                {work.detail.features}
              </h2>
              <ul className="hairline-y flex flex-col">
                {copy.features.map((feature) => (
                  <li key={feature} className="text-foreground/85 py-2 text-sm">
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            <div data-reveal className="flex flex-col gap-3">
              <h2 className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase rtl:tracking-normal">
                {work.detail.stack}
              </h2>
              <ul className="flex flex-wrap gap-2">
                {facts.stack.map((item) => (
                  <li key={item} className="rounded-full bg-secondary px-3 py-1 text-[0.72rem] font-semibold text-foreground/62" dir="ltr">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </Container>
      </Section>

      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div data-reveal className="flex flex-col gap-3">
      <h2 className="section-title text-display-sm text-foreground">{title}</h2>
      <p className="text-foreground/85 text-lg leading-relaxed">{body}</p>
    </div>
  )
}
