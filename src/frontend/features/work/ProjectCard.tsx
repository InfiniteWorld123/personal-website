import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'
import type { ProjectCopy, ProjectSlug } from '#/frontend/content/types'
import { type ProjectFacts, projects } from '#/frontend/content/site'
import type { Language } from '#/frontend/i18n/language'
import { cn } from '#/frontend/lib/utils'

export function ProjectStatusPill({
  status,
  labels,
}: {
  status: ProjectFacts['status']
  labels: { live: string; building: string }
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        status === 'live' ? 'border-border text-foreground/80' : 'border-border text-muted-foreground',
      )}
    >
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', status === 'live' ? 'bg-primary' : 'bg-muted-foreground/60')}
      />
      {labels[status]}
    </span>
  )
}

/**
 * Screenshots arrive with the content block (B6). Until then the frame carries
 * the project's name in the display face, so the layout is honest about what
 * exists and does not fake a product shot.
 */
export function ProjectFrame({ name, className }: { name: string; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'bg-muted border-border flex aspect-[16/10] items-center justify-center overflow-hidden rounded-xl border',
        className,
      )}
    >
      <span className="font-heading text-muted-foreground/70 text-display-md select-none">{name}</span>
    </div>
  )
}

export function ProjectCard({
  slug,
  copy,
  language,
  statusLabels,
}: {
  slug: ProjectSlug
  copy: Pick<ProjectCopy, 'name' | 'kind' | 'summary'>
  language: Language
  statusLabels: { live: string; building: string }
}) {
  const facts = projects[slug]

  return (
    <article data-reveal className="group flex flex-col gap-4">
      <Link to="/$lang/work/$slug" params={{ lang: language, slug }} className="block">
        <ProjectFrame name={copy.name} className="transition-colors group-hover:border-foreground/25" />
      </Link>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs font-medium tracking-[0.12em] uppercase rtl:tracking-normal">
            {copy.kind}
          </p>
          <ProjectStatusPill status={facts.status} labels={statusLabels} />
        </div>
        <h3 className="font-heading text-display-sm">
          <Link to="/$lang/work/$slug" params={{ lang: language, slug }} className="hover:underline hover:underline-offset-4">
            {copy.name}
          </Link>
        </h3>
        <p className="text-foreground/80 leading-relaxed">{copy.summary}</p>
        {facts.website ? (
          <a
            href={facts.website}
            target="_blank"
            rel="noreferrer"
            dir="ltr"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1 text-sm rtl:flex-row-reverse"
          >
            {facts.website.replace('https://', '')}
            <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
          </a>
        ) : null}
      </div>
    </article>
  )
}
