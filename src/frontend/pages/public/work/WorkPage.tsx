import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Eyebrow, Section } from '#/frontend/components/layout/public/Section'
import { getContent, projectOrder } from '#/frontend/content'
import { ProjectCard } from '#/frontend/features/work/ProjectCard'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { useReveal } from '#/frontend/motion'

export function WorkPage() {
  const { language } = useLanguage()
  const { work, home } = getContent(language)
  const headerRef = useRef<HTMLElement>(null)
  const listRef = useRef<HTMLElement>(null)
  useReveal(headerRef)
  useReveal(listRef)

  return (
    <>
      <section ref={headerRef} className="pt-16 pb-6 sm:pt-24">
        <Container className="flex max-w-3xl flex-col gap-5">
          <Eyebrow data-reveal>{work.eyebrow}</Eyebrow>
          <h1 data-reveal className="section-title mt-5 text-display-lg text-foreground">
            {work.title}
          </h1>
          <p data-reveal className="hero-copy text-base leading-8 sm:text-[1.05rem]">
            {work.intro}
          </p>
        </Container>
      </section>

      <Section ref={listRef} className="pt-10">
        <Container className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projectOrder.map((slug, index) => (
            <ProjectCard
              key={slug}
              slug={slug}
              index={index}
              copy={work.items[slug]}
              language={language}
              statusLabels={work.status}
              labels={{ visit: work.visit, source: work.source, detail: work.detailLabel }}
            />
          ))}
        </Container>
      </Section>

      <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
    </>
  )
}
