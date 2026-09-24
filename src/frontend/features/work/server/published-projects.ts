import { createServerFn } from '@tanstack/react-start'
import * as v from 'valibot'
import { PROJECT_LANGUAGES } from '#/shared/validation/project.validation'
import type { ProjectEntry } from '../project-list'
import { loadProject, loadProjectSlugs, loadProjects, loadProjectsBatch, loadProjectsPage } from './projects-source'

/**
 * The public pages read their projects on the server, straight from the
 * service. There is no HTTP round trip back to our own API: the page is being
 * rendered on the machine that owns the database.
 *
 * Every read goes through `withRequestScope` for the same reason
 * `handleApiRequest` does: this path renders on a Worker too, and without the
 * scope the query lands on the module-level pool, whose sockets Cloudflare has
 * already torn down between requests — and which never sees Hyperdrive.
 * Which backend answers — legacy or Backend2 — is decided in
 * `projects-source.ts`.
 */
const LanguageInput = v.object({ language: v.picklist(PROJECT_LANGUAGES) })

const PageInput = v.object({
  language: v.picklist(PROJECT_LANGUAGES),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)), 1),
})

const BatchInput = v.object({
  language: v.picklist(PROJECT_LANGUAGES),
  offset: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(600)),
  limit: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(36)),
})

const SlugInput = v.object({
  language: v.picklist(PROJECT_LANGUAGES),
  slug: v.pipe(v.string(), v.maxLength(80)),
})

/** The homepage selection (and the admin's content preview). */
export const fetchPublishedProjects = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(LanguageInput, input))
  .handler(({ data }): Promise<ProjectEntry[]> => loadProjects(data))

/** `/work` up to and including `?page=`, and how many projects exist. */
export const fetchProjectsPage = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(PageInput, input))
  .handler(({ data }): Promise<{ entries: ProjectEntry[]; total: number }> => loadProjectsPage(data))

/** One further batch for "Load more", from `offset`. */
export const fetchProjectsBatch = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(BatchInput, input))
  .handler(({ data }): Promise<{ entries: ProjectEntry[]; total: number }> => loadProjectsBatch(data))

/** Just the slugs, for the sitemap. */
export const fetchPublishedProjectSlugs = createServerFn({ method: 'GET' }).handler(
  (): Promise<string[]> => loadProjectSlugs(),
)

/** One published project, or null for a 404. */
export const fetchPublishedProject = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(SlugInput, input))
  .handler(({ data }): Promise<ProjectEntry | null> => loadProject(data))
