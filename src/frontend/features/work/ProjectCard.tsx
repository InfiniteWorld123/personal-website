import { Link } from '@tanstack/react-router'
import { ArrowRight, ArrowUpRight, Github } from 'lucide-react'
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#/frontend/components/ui/card'
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
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 rounded-full border px-3 py-1 text-[0.72rem] font-semibold',
        status === 'live'
          ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
          : 'border-border/60 bg-muted/40 text-foreground/55',
      )}
    >
      {status === 'live' ? <span className="live-status-dot" aria-hidden="true" /> : null}
      {labels[status]}
    </Badge>
  )
}

/**
 * Screenshots arrive with the content block (B6). Until then the frame carries
 * the project's name in the display face so nothing pretends to be a product
 * shot.
 */
export function ProjectFrame({ name, className }: { name: string; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex aspect-[16/10] items-center justify-center overflow-hidden rounded-[1.5rem] border border-border/50',
        'bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_10%,var(--card)),color-mix(in_srgb,var(--primary)_3%,var(--card)))]',
        className,
      )}
    >
      <span className="section-title text-display-md text-primary/55 select-none">{name}</span>
    </div>
  )
}

export function ProjectCard({
  slug,
  copy,
  language,
  statusLabels,
  index,
  labels,
}: {
  slug: ProjectSlug
  copy: Pick<ProjectCopy, 'name' | 'kind' | 'summary'>
  language: Language
  statusLabels: { live: string; building: string }
  index: number
  labels: { visit: string; source: string; detail: string }
}) {
  const facts = projects[slug]

  return (
    <Card
      data-reveal
      className="surface-card surface-card-hover flex min-w-0 flex-col rounded-[1.75rem] border-border/50 bg-card py-0"
    >
      <CardHeader className="gap-2 px-7 pt-7 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardDescription className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-primary/65 rtl:tracking-normal">
              {copy.kind}
            </CardDescription>
            <CardTitle className="mt-2.5 text-[1.35rem] leading-snug text-foreground">
              <Link to="/$lang/work/$slug" params={{ lang: language, slug }} className="hover:text-primary">
                {copy.name}
              </Link>
            </CardTitle>
          </div>
          <ProjectStatusPill status={facts.status} labels={statusLabels} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-5 px-7 pb-7">
        <p className="m-0 text-sm leading-7 text-foreground/58">{copy.summary}</p>
        <div className="flex flex-wrap gap-2">
          {facts.stack.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="rounded-full bg-secondary px-3 py-1 text-[0.72rem] font-semibold text-foreground/62"
              dir="ltr"
            >
              {item}
            </Badge>
          ))}
        </div>
      </CardContent>

      <CardFooter className="justify-between gap-3 rounded-b-[1.75rem] border-t border-border/30 bg-muted/25 px-7 py-5">
        <span className="tabular shrink-0 text-sm font-medium text-foreground/36">0{index + 1}</span>
        <div className="flex flex-wrap justify-end gap-2">
          {facts.website ? (
            <Button
              asChild
              className="btn-glow-primary rounded-full bg-primary px-4 text-primary-foreground shadow-[0_6px_20px_rgba(53,92,255,0.22)] hover:bg-primary/90"
            >
              <a href={facts.website} target="_blank" rel="noreferrer">
                {labels.visit}
                <ArrowUpRight className="rtl:-scale-x-100" />
              </a>
            </Button>
          ) : null}
          {facts.source ? (
            <Button
              asChild
              variant="outline"
              size="icon"
              aria-label={labels.source}
              className="btn-glow-icon rounded-full border-border/50 bg-card text-foreground/68 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
            >
              <a href={facts.source} target="_blank" rel="noreferrer">
                <Github />
              </a>
            </Button>
          ) : null}
          <Button
            asChild
            variant="outline"
            className="btn-glow-outline rounded-full border-border/50 bg-card px-4 text-foreground/68 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
          >
            <Link to="/$lang/work/$slug" params={{ lang: language, slug }}>
              {labels.detail}
              <ArrowRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
