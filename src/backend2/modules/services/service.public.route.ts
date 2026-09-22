import { Elysia } from 'elysia'
import {
  PublicServiceDetailQuerySchema,
  PublicServiceListQuerySchema,
} from '../../contracts/service.contract'
import { responseOk } from '../../http/response'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { listPublicServices, readPublicService } from './service.service'

/**
 * What the public website reads.
 *
 * Read-only. Mounted only where the V2 database is configured, like the
 * Projects reads: production has no `DATABASE_URL_V2` yet, so these simply do
 * not answer there, and the live `/services` page keeps its current content
 * until a separately approved cutover.
 *
 * Every response is built by the projections in `service.mapper.ts` from the
 * published version alone. A saved-but-unpublished price is not filtered out
 * here — it is never read.
 */

/**
 * One minute, as Projects. A price is exactly the thing the owner changes and
 * then checks on the live page; an hour-long cache would make **Publish
 * update** look like it did nothing.
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

export const publicServiceRoutes = new Elysia({ prefix: '/services' })
  /**
   * One batch, in the owner's order.
   *
   * The `/services` list asks for a page with `offset` and `limit`; the
   * homepage asks for `featured=only` and a small `limit` — the same order,
   * narrowed to the starred services that are live. Neither can ask for the
   * whole catalogue: `limit` is capped on the server. A sitemap pages through
   * this same endpoint.
   */
  .get('/', async ({ query }) => {
    const parsed = parseInput(PublicServiceListQuerySchema, query)

    return publicJson(await listPublicServices(parsed), 'Services loaded')
  })

  /**
   * By the current address or any earlier one. The answer always names
   * `canonicalSlug`; when it differs from the address asked for, the website
   * issues its own permanent redirect. The API never redirects.
   */
  .get('/:slug', async ({ params, query }) => {
    const { language } = parseInput(PublicServiceDetailQuerySchema, query)

    return publicJson(
      await readPublicService({ slug: String(params.slug), language }),
      'Service loaded',
    )
  })
