import { createServerFn } from '@tanstack/react-start'
import * as v from 'valibot'
import { withRequestScope } from '#/backend/db/client'
import {
  getPublishedProject,
  listPublishedProjects,
} from '#/backend/modules/projects/project.service'
import { PROJECT_LANGUAGES } from '#/shared/validation/project.validation'
import { type ProjectEntry, toProjectEntry } from '../project-list'

/**
 * The public pages read their projects on the server, straight from the
 * service. There is no HTTP round trip back to our own API: the page is being
 * rendered on the machine that owns the database.
 *
 * Every handler here goes through `withRequestScope` for the same reason
 * `handleApiRequest` does: this path renders on a Worker too, and without the
 * scope the query lands on the module-level pool, whose sockets Cloudflare has
 * already torn down between requests — and which never sees Hyperdrive.
 */
const LanguageInput = v.object({ language: v.picklist(PROJECT_LANGUAGES) })

const SlugInput = v.object({
  language: v.picklist(PROJECT_LANGUAGES),
  slug: v.pipe(v.string(), v.maxLength(80)),
})

export const fetchPublishedProjects = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(LanguageInput, input))
  .handler(async ({ data }): Promise<ProjectEntry[]> => {
    const projects = await withRequestScope(() => listPublishedProjects(data.language))

    return projects.map(toProjectEntry)
  })

/** Just the slugs, for the sitemap; loading three languages of copy for it would be waste. */
export const fetchPublishedProjectSlugs = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string[]> => {
    const projects = await withRequestScope(() => listPublishedProjects('en'))

    return projects.map((project) => project.slug)
  },
)

export const fetchPublishedProject = createServerFn({ method: 'GET' })
  .validator((input: unknown) => v.parse(SlugInput, input))
  .handler(async ({ data }): Promise<ProjectEntry | null> => {
    const project = await withRequestScope(() => getPublishedProject(data.language, data.slug))

    return project ? toProjectEntry(project) : null
  })
