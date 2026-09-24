import { withRequestScope } from '#/backend2/db/client'
import { ApiError } from '#/backend2/http/error'
import {
  PUBLIC_BATCH,
  PUBLIC_TYPE_WORDS,
  type Language,
  type PublicImage,
  type PublicProjectDetail,
} from '#/backend2/contracts/project.contract'
import {
  listPublicProjectEntries,
  listPublishedProjectSlugs,
} from '#/backend2/modules/projects/project.public-batch'
import { readPublicProject } from '#/backend2/modules/projects/project.service'
import { PROJECT_BATCH_SIZE, type ProjectEntry, type ProjectEntryImage } from '../project-list'

/**
 * Backend2's published projects, in the shapes the accepted public pages
 * already draw (`docs/v2/public-cutover.md` step 3).
 *
 * Server only: imported by the server functions in `published-projects.ts`,
 * whose handlers the client bundle never contains. Every project arrives as a
 * `ProjectEntry`, plus its case study on the detail page.
 */

const toImage = (image: PublicImage): ProjectEntryImage => ({
  src: image.url,
  width: image.width,
  height: image.height,
  alt: image.alt,
})

/**
 * The eyebrow above a project's name.
 *
 * The type must be visible, so a demo is never presented as client work
 * (`docs/v2/projects.md`), in the owner's approved words (`PUBLIC_TYPE_WORDS`).
 * The owner's own category label follows it when there is one.
 */
export const projectKind = (
  type: PublicProjectDetail['type'],
  categoryLabel: string | null,
  language: Language,
): string => {
  const typeWord = PUBLIC_TYPE_WORDS[language][type]

  return categoryLabel ? `${typeWord} · ${categoryLabel}` : typeWord
}

export const toV2ProjectEntry = (
  project: PublicProjectDetail,
  language: Language,
  options: { withCaseStudy: boolean },
): ProjectEntry => ({
  facts: {
    slug: project.slug,
    // The site's own two words: a finished project reads "Live", an
    // unfinished one "In progress" — as the Dashboard preview shows it.
    status: project.workStatus === 'completed' ? 'live' : 'building',
    website: project.website,
    source: project.source,
    stack: project.tech,
    images: [...(project.cover ? [project.cover] : []), ...project.gallery].map(toImage),
  },
  copy: {
    name: project.name,
    kind: projectKind(project.type, project.categoryLabel, language),
    summary: project.summary,
  },
  ...(options.withCaseStudy ? { caseStudy: project.caseStudy } : {}),
})

/**
 * The first `count` projects in the owner's order, in as few bounded requests
 * as the public batch limit allows. `/work?page=3` still shows every preceding
 * batch, as the page does today.
 */
export const readV2Projects = async (
  language: Language,
  count: number,
): Promise<{ entries: ProjectEntry[]; total: number }> => {
  const wanted = Math.max(PROJECT_BATCH_SIZE, Math.min(count, PUBLIC_BATCH.maxOffset))
  const entries: ProjectEntry[] = []
  let total = 0

  for (let offset = 0; offset < wanted; offset += PUBLIC_BATCH.max) {
    const limit = Math.min(PUBLIC_BATCH.max, wanted - offset)
    const batch = await withRequestScope(() => listPublicProjectEntries({ language, offset, limit }))

    total = batch.total
    entries.push(...batch.items.map((item) => toV2ProjectEntry(item, language, { withCaseStudy: false })))

    if (!batch.hasMore) break
  }

  return { entries, total }
}

/** One further batch, for "Load more": only the projects not yet on screen. */
export const readV2ProjectBatch = async (
  language: Language,
  offset: number,
  limit: number,
): Promise<{ entries: ProjectEntry[]; total: number }> => {
  const batch = await withRequestScope(() =>
    listPublicProjectEntries({
      language,
      offset: Math.min(offset, PUBLIC_BATCH.maxOffset),
      limit: Math.min(Math.max(limit, PUBLIC_BATCH.min), PUBLIC_BATCH.max),
    }),
  )

  return {
    entries: batch.items.map((item) => toV2ProjectEntry(item, language, { withCaseStudy: false })),
    total: batch.total,
  }
}

/**
 * One published project by any address it was published under, or null.
 *
 * The entry carries the address to use now; when it differs from the one asked
 * for, the route redirects there (the API never does).
 */
export const readV2Project = async (language: Language, slug: string): Promise<ProjectEntry | null> => {
  try {
    const project = await withRequestScope(() => readPublicProject({ language, slug }))
    const entry = toV2ProjectEntry(project, language, { withCaseStudy: true })

    return { ...entry, facts: { ...entry.facts, slug: project.canonicalSlug } }
  } catch (error) {
    // A draft, a withdrawn project and an unknown address all answer 404.
    if (error instanceof ApiError && error.status === 404) return null

    throw error
  }
}

export const readV2ProjectSlugs = (): Promise<string[]> => withRequestScope(listPublishedProjectSlugs)
