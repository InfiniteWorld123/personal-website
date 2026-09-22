import { Elysia } from 'elysia'
import {
  PublicDetailQuerySchema,
  PublicListQuerySchema,
} from '../../contracts/project.contract'
import { responseOk } from '../../http/response'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { listPublicProjects, readPublicProject } from './project.service'

/**
 * What the public website reads.
 *
 * Read-only, so no origin check applies — nothing here mutates. Mounted only
 * when the V2 database is configured (D13): without one these routes could not
 * answer the question they exist to ask, and an unmounted 404 is a better
 * answer than a 500 from a missing connection string.
 *
 * Every response is built by the projection functions in `project.mapper.ts`,
 * field by field from typed input. A private draft, a hidden client name and a
 * private repository link are not filtered out here — they never enter the
 * object in the first place.
 */

/**
 * One minute — deliberately far shorter than the hour the images get.
 *
 * The images can afford an hour because an asset is immutable: the bytes
 * behind `/api/v2/media/:id` never change, and the only event that has to
 * propagate is a withdrawal. This JSON is the opposite. It changes every time
 * the owner presses **Publish update**, and an hour-long cache would mean
 * pressing it, looking at the live page, and seeing the old text — with
 * nothing wrong and nothing to do but wait.
 *
 * Caught by trying exactly that: an unpublished project kept answering 200
 * from a browser cache while the origin was already answering 404.
 *
 * A minute still absorbs a burst of traffic on one project, which is the only
 * thing this cache is really for at this size of site.
 */
const PUBLIC_CACHE = 'public, max-age=60'

const publicJson = <T>(data: T, message: string): Response =>
  new Response(JSON.stringify(responseOk({ data, message })), {
    status: HttpStatus.OK,
    headers: {
      'content-type': 'application/json',
      'cache-control': PUBLIC_CACHE,
      'x-content-type-options': 'nosniff',
    },
  })

export const publicProjectRoutes = new Elysia({ prefix: '/projects' })
  /**
   * One batch, in the owner's manual order.
   *
   * This single endpoint covers all three public needs: the `/work`
   * "Load more" click asks for `offset = alreadyLoaded, limit = 6`; a deep
   * link to `?page=3` asks for `offset = 0, limit = 18` in one bounded
   * request; and the homepage asks for `offset = 0, limit = N` in that same
   * order, so there is no separate featured list to keep in step.
   */
  .get('/', async ({ query }) => {
    const parsed = parseInput(PublicListQuerySchema, query)

    return publicJson(await listPublicProjects(parsed), 'Projects loaded')
  })

  /**
   * By the current slug, or any the project was published under before (D6).
   *
   * The response always carries `canonicalSlug`. When it differs from the
   * requested one the *frontend* issues the permanent redirect — the API never
   * does (D12), which keeps it a data API that a cache and a client can both
   * reason about.
   */
  .get('/:slug', async ({ params, query }) => {
    const { language } = parseInput(PublicDetailQuerySchema, query)

    return publicJson(
      await readPublicProject({ slug: String(params.slug), language }),
      'Project loaded',
    )
  })
