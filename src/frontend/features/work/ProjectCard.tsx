import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Github } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import type { ProjectCopy, WorkCopy } from '#/frontend/content/types'
import type { ProjectFacts } from '#/frontend/content/site'
import type { Language } from '#/frontend/i18n/language'

export function ProjectStatusPill({ status, labels }: {
  status: ProjectFacts['status']; labels: WorkCopy['status']
}) {
  return <span className="project-status"><span className={status === 'live' ? 'status-dot is-live' : 'status-dot'} />{labels[status]}</span>
}

export function ProjectCard({ facts, copy, language, statusLabels, labels, showTech = false }: {
  facts: ProjectFacts
  copy: Pick<ProjectCopy, 'name' | 'kind' | 'summary'>
  language: Language
  statusLabels: WorkCopy['status']
  labels: { visit: string; source: string; detail: string }
  showTech?: boolean
}) {
  return (
    <article className="work-card">
      <div className="work-card-heading">
        <h3><Link to="/$lang/work/$slug" params={{ lang: language, slug: facts.slug }}>{copy.name}</Link></h3>
        <p className="work-card-kind">{copy.kind}</p>
        <ProjectStatusPill status={facts.status} labels={statusLabels} />
      </div>
      {facts.image ? <img className="work-card-image" src={facts.image.src} width={facts.image.width} height={facts.image.height} alt={facts.image.alt[language]} loading="lazy" /> : null}
      <p className="work-card-summary">{copy.summary}</p>
      {showTech ? <p className="work-card-tech" dir="ltr">{facts.stack.slice(0, 3).join(' · ')}</p> : null}
      <div className="work-card-actions">
        <Button asChild className="project-detail-link">
          <Link to="/$lang/work/$slug" params={{ lang: language, slug: facts.slug }}>{labels.detail}<ArrowUpRight className="rtl:-scale-x-100" /></Link>
        </Button>
        {facts.website ? <Button asChild variant="outline" size="icon" aria-label={labels.visit + ': ' + copy.name} title={labels.visit}>
          <a href={facts.website} target="_blank" rel="noreferrer"><ArrowUpRight /></a>
        </Button> : null}
        {facts.source ? <Button asChild variant="outline" size="icon" aria-label={labels.source + ': ' + copy.name} title={labels.source}>
          <a href={facts.source} target="_blank" rel="noreferrer"><Github /></a>
        </Button> : null}
      </div>
    </article>
  )
}
