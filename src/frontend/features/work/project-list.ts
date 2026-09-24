import type { PublicRichTextDoc } from '#/backend2/contracts/project.contract'
import type { StructuredProject } from '#/frontend/lib/structured-data'
import type { ProjectStatus } from '#/shared/validation/project.validation'

/**
 * A project as the public pages consume it: the language is already chosen,
 * so alt text is a string rather than a record. Facts and copy stay separate
 * because the card and the detail page use them differently.
 */
export type ProjectEntryImage = {
  src: string
  /** Null only for an image whose size was never measured. */
  width: number | null
  height: number | null
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
}

export type ProjectEntry = {
  facts: ProjectEntryFacts
  copy: ProjectEntryCopy
  /** The case study, on the detail page only; null when none was written. */
  caseStudy?: PublicRichTextDoc | null
}

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

/**
 * The cumulative batch a `?page=` asks for. `total` is how many exist: the
 * server sends only the batches asked for and says how many there are.
 */
export function getProjectBatch<T>(items: T[], requestedPage: number | undefined, total: number) {
  const page = Math.min(parseProjectPage(requestedPage), Math.max(1, Math.ceil(total / PROJECT_BATCH_SIZE)))
  const visible = items.slice(0, page * PROJECT_BATCH_SIZE)
  return { page, visible, total, hasMore: visible.length < total }
}
