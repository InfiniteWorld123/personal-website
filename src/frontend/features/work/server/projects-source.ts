import type { ProjectLanguage } from '#/shared/validation/project.validation'
import { PROJECT_BATCH_SIZE, type ProjectEntry } from '../project-list'
import { readV2Project, readV2ProjectBatch, readV2ProjectSlugs, readV2Projects } from './v2-projects'

/**
 * The public projects, read from Backend2's published projects
 * (`docs/v2/public-cutover.md` step 3).
 *
 * Plain functions so they can be tested without the server-function runtime;
 * `published-projects.ts` wraps each one for the pages.
 */

/** The homepage selection: the first projects in the owner's order, six at most. */
export const loadProjects = async (input: { language: ProjectLanguage }): Promise<ProjectEntry[]> =>
  (await readV2Projects(input.language, PROJECT_BATCH_SIZE)).entries

/**
 * `/work` up to and including `?page=`, and how many projects exist: only the
 * batches the page shows (`docs/v2/projects.md`, "Pagination — agreed with the
 * owner").
 */
export const loadProjectsPage = async (input: {
  language: ProjectLanguage
  page: number
}): Promise<{ entries: ProjectEntry[]; total: number }> =>
  readV2Projects(input.language, input.page * PROJECT_BATCH_SIZE)

/** One further batch for `/work`'s "Load more": `offset` is how many are on screen. */
export const loadProjectsBatch = async (input: {
  language: ProjectLanguage
  offset: number
  limit: number
}): Promise<{ entries: ProjectEntry[]; total: number }> =>
  readV2ProjectBatch(input.language, input.offset, input.limit)

/** Just the slugs, for the sitemap; loading three languages of copy for it would be waste. */
export const loadProjectSlugs = async (): Promise<string[]> => readV2ProjectSlugs()

/**
 * One published project, or null for a 404. The entry's slug is the current
 * address, which differs from the one asked for only when an old address was
 * used — the route redirects then.
 */
export const loadProject = async (input: { language: ProjectLanguage; slug: string }): Promise<ProjectEntry | null> =>
  readV2Project(input.language, input.slug)
