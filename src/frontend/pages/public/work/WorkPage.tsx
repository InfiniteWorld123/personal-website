import { useNavigate, useSearch } from '@tanstack/react-router'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { CtaBand } from '#/frontend/components/layout/public/CtaBand'
import { Button } from '#/frontend/components/ui/button'
import { getContent } from '#/frontend/content'
import { ProjectCard } from '#/frontend/features/work/ProjectCard'
import { PROJECT_BATCH_SIZE, getProjectBatch, parseProjectPage, type ProjectEntry } from '#/frontend/features/work/project-list'
import { fetchProjectsBatch } from '#/frontend/features/work/server/published-projects'
import { useMoreBatches } from '#/frontend/features/work/use-more-batches'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'

export function WorkPage({ entries, total }: { entries: ProjectEntry[]; total: number }) {
  const { language } = useLanguage()
  const { work, home } = getContent(language)
  const { page } = useSearch({ from: '/$lang/work/' })
  const navigate = useNavigate()
  const header = useReveal<HTMLElement>()
  const grid = useReveal<HTMLElement>()
  // Backend2 sends only the batches shown; "Load more" fetches the next one.
  // A legacy list arrives whole, so nothing is fetched and nothing changes.
  const more = useMoreBatches({
    items: entries,
    total,
    wanted: parseProjectPage(page) * PROJECT_BATCH_SIZE,
    loadMore: (offset, limit) =>
      fetchProjectsBatch({ data: { language, offset, limit } }).then((batch) => ({ items: batch.entries, total: batch.total })),
  })
  const batch = getProjectBatch(more.items, page, more.total)
  return <>
    <section ref={header} data-reveal-scope="" className="public-page-intro">
      <Container>
        <Eyebrow data-reveal>{work.eyebrow}</Eyebrow>
        <h1 className="section-title mt-5 text-display-lg text-foreground"><SplitWords text={work.title} /></h1>
        <p data-reveal className="page-intro-copy">{work.intro}</p>
      </Container>
    </section>
    <section ref={grid} data-reveal-scope="" className="pb-section" aria-label={work.eyebrow}>
      <Container>
        {batch.visible.length ? <div className="work-grid">
          {batch.visible.map(({ facts, copy }) => <ProjectCard key={facts.slug} facts={facts} copy={copy} language={language} statusLabels={work.status} showTech labels={{ visit: work.visit, source: work.source, detail: work.detailLabel }} />)}
        </div> : <p className="work-empty">{work.empty}</p>}
        <div className="work-pagination">
          <p role="status" aria-live="polite">{work.shown.replace('{visible}', String(batch.visible.length)).replace('{total}', String(batch.total))}</p>
          {batch.hasMore ? <Button variant="outline" className="rounded-full px-6" aria-busy={more.loading || undefined} onClick={() => more.failed ? more.retry() : void navigate({ to: '/$lang/work', params: { lang: language }, search: { page: batch.page + 1 }, resetScroll: false })}>{work.loadMore}</Button> : null}
        </div>
      </Container>
    </section>
    <CtaBand title={home.cta.title} body={home.cta.body} button={home.cta.button} alt={home.cta.alt} />
  </>
}
