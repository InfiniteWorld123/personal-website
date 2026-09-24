import { Link } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpRight, Github } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { getContent } from '#/frontend/content'
import { ProjectStatusPill } from '#/frontend/features/work/ProjectCard'
import { CaseStudy } from '#/frontend/features/work/CaseStudy'
import type { ProjectEntry, ProjectEntryImage } from '#/frontend/features/work/project-list'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'

export function ProjectPage({ entry }: { entry: ProjectEntry }) {
  const { language } = useLanguage()
  const { work, home } = getContent(language)
  const { facts, copy } = entry
  const header = useReveal<HTMLElement>()

  return (
    <>
      <section ref={header} data-reveal-scope="" className="pt-12 pb-10 sm:pt-16">
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
            <h1 className="section-title mt-5 text-display-lg text-foreground">
              <SplitWords text={copy.name} />
            </h1>
            <p data-reveal className="hero-copy text-base leading-8 sm:text-[1.05rem]">
              {copy.summary}
            </p>
            <div data-reveal className="flex flex-wrap gap-3 pt-2">
              {facts.website ? (
                <Button asChild className="rounded-full bg-primary px-5 text-primary-foreground">
                  <a href={facts.website} target="_blank" rel="noreferrer">
                    {work.visit}
                    <ArrowUpRight className="size-4 rtl:-scale-x-100" />
                  </a>
                </Button>
              ) : null}
              {facts.source ? (
                <Button asChild variant="outline" className="rounded-full border-border/60 bg-card px-5 text-foreground hover:border-primary/30 hover:bg-primary/5">
                  <a href={facts.source} target="_blank" rel="noreferrer">
                    <Github className="size-4" />
                    {work.source}
                  </a>
                </Button>
              ) : null}
            </div>
          </div>

          {facts.images.length ? (
            <div data-reveal className="project-gallery">
              {facts.images.map((shot, index) => (
                <img
                  key={shot.src}
                  className={isPortrait(shot) ? 'project-page-image is-portrait' : 'project-page-image'}
                  src={shot.src}
                  width={shot.width ?? undefined}
                  height={shot.height ?? undefined}
                  alt={shot.alt}
                  loading={index === 0 ? 'eager' : 'lazy'}
                />
              ))}
            </div>
          ) : null}
        </Container>
      </section>

      {/* A project may have no case study and no technology list; then there
          is nothing for this band to hold, and it is left out rather than
          shown empty. */}
      {entry.caseStudy || facts.stack.length ? <Section tone="tint">
        <Container className="grid gap-12 lg:grid-cols-[2fr_1fr] lg:gap-16">
          <div className="flex max-w-2xl flex-col gap-10">
            {entry.caseStudy ? <CaseStudy doc={entry.caseStudy} /> : null}
          </div>

          <aside className="flex flex-col gap-10 lg:sticky lg:top-24 lg:self-start">
            {facts.stack.length ? <div data-reveal className="flex flex-col gap-3">
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
            </div> : null}
          </aside>
        </Container>
      </Section> : null}

      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}

const isPortrait = (shot: ProjectEntryImage) =>
  shot.width !== null && shot.height !== null && shot.width < shot.height
