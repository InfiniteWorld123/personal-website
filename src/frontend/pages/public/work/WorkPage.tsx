import { useNavigate, useSearch } from '@tanstack/react-router'
import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Button } from '#/frontend/components/ui/button'
import { getContent } from '#/frontend/content'
import { ProjectCard } from '#/frontend/features/work/ProjectCard'
import { getProjectBatch, getProjectEntries } from '#/frontend/features/work/project-list'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { useReveal } from '#/frontend/motion'

export function WorkPage() {
  const { language } = useLanguage()
  const { work, home } = getContent(language)
  const { page } = useSearch({ from: '/$lang/work/' })
  const navigate = useNavigate()
  const header = useRef<HTMLElement>(null)
  useReveal(header)
  const entries = getProjectEntries(language)
  const batch = getProjectBatch(entries, page)
  return <>
    <section ref={header} className="public-page-intro">
      <Container>
        <Eyebrow>{work.eyebrow}</Eyebrow>
        <h1 data-reveal className="section-title mt-5 text-display-lg text-foreground">{work.title}</h1>
        <p className="page-intro-copy">{work.intro}</p>
      </Container>
    </section>
    <section className="pb-section" aria-label={work.eyebrow}>
      <Container>
        {batch.visible.length ? <div className="work-grid">
          {batch.visible.map(({ facts, copy }) => <ProjectCard key={facts.slug} facts={facts} copy={copy} language={language} statusLabels={work.status} showTech labels={{ visit: work.visit, source: work.source, detail: work.detailLabel }} />)}
        </div> : <p className="work-empty">{work.empty}</p>}
        <div className="work-pagination">
          <p role="status" aria-live="polite">{work.shown.replace('{visible}', String(batch.visible.length)).replace('{total}', String(entries.length))}</p>
          {batch.hasMore ? <Button variant="outline" className="rounded-full px-6" onClick={() => void navigate({ to: '/$lang/work', params: { lang: language }, search: { page: batch.page + 1 }, resetScroll: false })}>{work.loadMore}</Button> : null}
        </div>
      </Container>
    </section>
    <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
  </>
}
