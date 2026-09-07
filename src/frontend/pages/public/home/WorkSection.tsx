import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { projectOrder } from '#/frontend/content'
import type { HomeCopy, WorkCopy } from '#/frontend/content/types'
import { ProjectCard } from '#/frontend/features/work/ProjectCard'
import type { Language } from '#/frontend/i18n/language'
import { useReveal } from '#/frontend/motion'

export function WorkSection({
  copy,
  work,
  language,
}: {
  copy: HomeCopy['work']
  work: WorkCopy
  language: Language
}) {
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  return (
    <Section ref={ref} id="arbeiten">
      <Container className="flex flex-col gap-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
          <Button
            asChild
            variant="outline"
            data-reveal
            className="btn-glow-outline shrink-0 rounded-full border-border/60 bg-card px-5 text-foreground/64 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <Link to="/$lang/work" params={{ lang: language }}>
              {copy.all}
              <ArrowUpRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      </Container>
    </Section>
  )
}
