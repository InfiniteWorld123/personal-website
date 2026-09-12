import type { StructuredProject } from '#/frontend/lib/structured-data'
import type { PublicProject } from '#/shared/types/project.types'
import type { ProjectStatus } from '#/shared/validation/project.validation'

/**
 * A project as the public pages consume it: the language is already chosen,
 * so alt text is a string rather than a record. Facts and copy stay separate
 * because the card and the detail page use them differently.
 */
export type ProjectEntryImage = {
  src: string
  width: number
  height: number
  alt: string
}

export type ProjectEntryFacts = {
  slug: string
  status: ProjectStatus
  website: string | null
  source: string | null
  stack: string[]
  /** First entry is the cover; the rest fill the detail gallery. */
  images: ProjectEntryImage[]
}

export type ProjectEntryCopy = {
  name: string
  kind: string
  summary: string
  problem: string
  approach: string
  shows: string
  features: string[]
}

export type ProjectEntry = { facts: ProjectEntryFacts; copy: ProjectEntryCopy }

export const toProjectEntry = (project: PublicProject): ProjectEntry => ({
  facts: {
    slug: project.slug,
    status: project.status,
    website: project.website,
    source: project.source,
    stack: project.tech,
    images: project.images,
  },
  copy: {
    name: project.name,
    kind: project.kind,
    summary: project.summary,
    problem: project.problem,
    approach: project.approach,
    shows: project.shows,
    features: project.features,
  },
})

/** What the page's JSON-LD needs from a project it has already loaded. */
export const toStructuredProject = ({ facts, copy }: ProjectEntry): StructuredProject => ({
  slug: facts.slug,
  name: copy.name,
  kind: copy.kind,
  summary: copy.summary,
  stack: facts.stack,
  website: facts.website,
  source: facts.source,
})

export const PROJECT_BATCH_SIZE = 6

export function parseProjectPage(value: unknown): number {
  if (typeof value !== 'string' && typeof value !== 'number') return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export function getProjectBatch<T>(items: T[], requestedPage?: number) {
  const page = Math.min(parseProjectPage(requestedPage), Math.max(1, Math.ceil(items.length / PROJECT_BATCH_SIZE)))
  const visible = items.slice(0, page * PROJECT_BATCH_SIZE)
  return { page, visible, hasMore: visible.length < items.length }
}
