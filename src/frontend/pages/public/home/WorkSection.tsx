import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import type { HomeCopy, WorkCopy } from '#/frontend/content/types'
import type { Language } from '#/frontend/i18n/language'
import { ProjectCarousel } from '#/frontend/features/work/ProjectCarousel'
import { getProjectEntries } from '#/frontend/features/work/project-list'

export function WorkSection({ copy, work, language }: { copy: HomeCopy['work']; work: WorkCopy; language: Language }) {
  return <Section id="arbeiten">
    <Container className="flex flex-col gap-10">
      <div className="section-heading-row">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
        <Button asChild variant="outline" className="rounded-full px-5"><Link to="/$lang/work" params={{ lang: language }}>{copy.all}<ArrowUpRight className="rtl:-scale-x-100" /></Link></Button>
      </div>
      <ProjectCarousel entries={getProjectEntries(language).slice(0, 6)} work={work} language={language} />
    </Container>
  </Section>
}
