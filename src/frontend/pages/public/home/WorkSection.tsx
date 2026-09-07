import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
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
      <Container className="flex flex-col gap-12">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
          <Link
            data-reveal
            to="/$lang/work"
            params={{ lang: language }}
            className="text-primary inline-flex shrink-0 items-center gap-1.5 text-sm font-medium hover:underline hover:underline-offset-4"
          >
            {copy.all}
            <ArrowRight className="size-4 rtl:-scale-x-100" />
          </Link>
        </div>
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          {projectOrder.map((slug) => (
            <ProjectCard
              key={slug}
              slug={slug}
              copy={work.items[slug]}
              language={language}
              statusLabels={work.status}
            />
          ))}
        </div>
      </Container>
    </Section>
  )
}
