import { withRequestScope } from '#/backend/db/client'
import {
  getPublishedProject,
  listPublishedProjects,
} from '#/backend/modules/projects/project.service'
import { readsFromV2 } from '#/backend2/public-source'
import type { ProjectLanguage } from '#/shared/validation/project.validation'
import { PROJECT_BATCH_SIZE, type ProjectEntry, toProjectEntry } from '../project-list'
import { readV2Project, readV2ProjectBatch, readV2ProjectSlugs, readV2Projects } from './v2-projects'

/**
 * Where the public projects come from, decided per request
 * (`docs/v2/public-cutover.md` step 3, PUBLIC_V2_MODULES=projects).
 *
 * Plain functions so the switch can be tested without the server-function
 * runtime; `published-projects.ts` wraps each one for the pages. Off — the
 * default — every one is exactly what the page read before: the legacy
 * service through `withRequestScope`. On, the same shapes come from Backend2's
 * published projects instead.
 */

/**
 * The homepage selection: the first projects in the owner's order. The legacy
 * list arrives whole and the carousel keeps the first six; Backend2 is asked
 * for those six only.
 */
export const loadProjects = async (input: { language: ProjectLanguage }): Promise<ProjectEntry[]> => {
  if (readsFromV2('projects')) return (await readV2Projects(input.language, PROJECT_BATCH_SIZE)).entries

  const projects = await withRequestScope(() => listPublishedProjects(input.language))

  return projects.map(toProjectEntry)
}

/**
 * `/work` up to and including `?page=`, and how many projects exist.
 *
 * Legacy returns the whole list, which the page slices as it always has;
 * Backend2 returns only the batches the page shows (`docs/v2/projects.md`,
 * "Pagination — agreed with the owner").
 */
export const loadProjectsPage = async (input: {
  language: ProjectLanguage
  page: number
}): Promise<{ entries: ProjectEntry[]; total: number }> => {
  if (readsFromV2('projects')) return readV2Projects(input.language, input.page * PROJECT_BATCH_SIZE)

  const projects = await withRequestScope(() => listPublishedProjects(input.language))

  return { entries: projects.map(toProjectEntry), total: projects.length }
}

/**
 * One further batch for `/work`'s "Load more": `offset` is how many are on
 * screen. Legacy never asks — its list arrives whole — but answers the same
 * way from the whole list, so the function means one thing on either source.
 */
export const loadProjectsBatch = async (input: {
  language: ProjectLanguage
  offset: number
  limit: number
}): Promise<{ entries: ProjectEntry[]; total: number }> => {
  if (readsFromV2('projects')) return readV2ProjectBatch(input.language, input.offset, input.limit)

  const projects = await withRequestScope(() => listPublishedProjects(input.language))

  return {
    entries: projects.slice(input.offset, input.offset + input.limit).map(toProjectEntry),
    total: projects.length,
  }
}

/** Just the slugs, for the sitemap; loading three languages of copy for it would be waste. */
export const loadProjectSlugs = async (): Promise<string[]> => {
  if (readsFromV2('projects')) return readV2ProjectSlugs()

  const projects = await withRequestScope(() => listPublishedProjects('en'))

  return projects.map((project) => project.slug)
}

/**
 * One published project, or null for a 404. From Backend2 the entry's slug is
 * the current address, which differs from the one asked for only when an old
 * address was used — the route redirects then.
 */
export const loadProject = async (input: {
  language: ProjectLanguage
  slug: string
}): Promise<ProjectEntry | null> => {
  if (readsFromV2('projects')) return readV2Project(input.language, input.slug)

  const project = await withRequestScope(() => getPublishedProject(input.language, input.slug))

  return project ? toProjectEntry(project) : null
}
