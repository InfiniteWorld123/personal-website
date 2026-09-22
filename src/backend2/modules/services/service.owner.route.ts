import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  CreateServiceSchema,
  PublicServiceDetailQuerySchema,
  SERVICE_LIMITS,
  ServiceDeleteSchema,
  ServiceListQuerySchema,
  ServicePatchSchema,
  ServicePositionSchema,
  ServiceRevisionSchema,
} from '../../contracts/service.contract'
import { readJsonBody } from '../../http/body'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import { moveService } from './service.order'
import {
  deleteService,
  discardPendingService,
  publishService,
  unpublishService,
} from './service.publish'
import {
  createService,
  getService,
  isSlugAvailable,
  listServices,
  patchService,
  previewService,
} from './service.service'

/**
 * The owner's services, over HTTP.
 *
 * Thin: parse, delegate, respond. The whole group sits behind `ownerGuard` —
 * the deployment fence, plus a real V2 owner session wherever
 * `BACKEND2_OWNER_AUTH=required` — and nothing here repeats that check.
 *
 * `ownerJson` puts `no-store` on every reply: a private draft, and a price
 * that is not live yet, must not survive in any cache.
 */

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid service id'))

export const ownerServiceRoutes = new Elysia({ prefix: '/services' })
  .use(ownerGuard)

  .get('/', async ({ query }) =>
    ownerJson({
      data: await listServices(parseInput(ServiceListQuerySchema, query)),
      message: 'Services loaded',
    }),
  )

  .post('/', async ({ request }) => {
    const input = parseInput(CreateServiceSchema, await readJsonBody(request))

    return ownerJson({
      data: await createService(input),
      message: 'Service created',
      status: HttpStatus.CREATED,
    })
  })

  /** Is an address free? Asked while the owner types. */
  .get('/slug-available', async ({ query }) => {
    const parsed = parseInput(
      v.object({
        slug: v.pipe(v.string(), v.trim(), v.maxLength(SERVICE_LIMITS.slug)),
        serviceId: v.optional(IdSchema, '00000000-0000-4000-8000-000000000000'),
      }),
      query,
    )

    const available = await isSlugAvailable({ slug: parsed.slug, serviceId: parsed.serviceId })

    return ownerJson({
      data: {
        available,
        reason: available
          ? undefined
          : parsed.slug === ''
            ? 'A web address is needed before publishing'
            : 'Another service already uses that web address',
      },
      message: 'Checked',
    })
  })

  .get('/:id', async ({ params }) =>
    ownerJson({ data: await getService(parseInput(IdSchema, params.id)), message: 'Service loaded' }),
  )

  /**
   * Pending edits. Only what is sent changes, and nothing a visitor sees
   * changes at all — that waits for **Publish update**.
   */
  .patch('/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { draftRevision, ...patch } = parseInput(ServicePatchSchema, await readJsonBody(request))

    return ownerJson({
      data: await patchService({ serviceId: id, draftRevision, patch }),
      message: 'Draft saved',
    })
  })

  .post('/:id/publish', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { draftRevision } = parseInput(ServiceRevisionSchema, await readJsonBody(request))

    return ownerJson({
      data: await publishService({ serviceId: id, draftRevision }),
      message: 'Published',
    })
  })

  .post('/:id/unpublish', async ({ params }) =>
    ownerJson({
      data: await unpublishService(parseInput(IdSchema, params.id)),
      message: 'Unpublished',
    }),
  )

  .post('/:id/discard-pending', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { draftRevision } = parseInput(ServiceRevisionSchema, await readJsonBody(request))

    return ownerJson({
      data: await discardPendingService({ serviceId: id, draftRevision }),
      message: 'Pending changes discarded',
    })
  })

  /**
   * An absolute position in the one order. "Move up" and "move down" are this
   * same call with `n ± 1`.
   */
  .post('/:id/position', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { position } = parseInput(ServicePositionSchema, await readJsonBody(request))

    return ownerJson({
      data: await moveService({ serviceId: id, position }),
      message: 'Order updated',
    })
  })

  /** Permanent, and it asks for the service's own id back. */
  .delete('/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { confirm } = parseInput(ServiceDeleteSchema, await readJsonBody(request))

    return ownerJson({ data: await deleteService({ serviceId: id, confirm }), message: 'Deleted' })
  })

  /** The draft, through the same projection the live site uses. */
  .get('/:id/preview', async ({ params, query }) => {
    const id = parseInput(IdSchema, params.id)
    const { language } = parseInput(PublicServiceDetailQuerySchema, query)

    return ownerJson({ data: await previewService({ serviceId: id, language }), message: 'Preview' })
  })

/** Every owner route, for the tests that walk the fence. */
export const ownerServicePaths = [
  { method: 'GET', path: '/api/v2/owner/services' },
  { method: 'POST', path: '/api/v2/owner/services' },
  { method: 'GET', path: '/api/v2/owner/services/slug-available?slug=x' },
  { method: 'GET', path: '/api/v2/owner/services/11111111-1111-4111-8111-111111111111' },
  { method: 'PATCH', path: '/api/v2/owner/services/11111111-1111-4111-8111-111111111111' },
  { method: 'DELETE', path: '/api/v2/owner/services/11111111-1111-4111-8111-111111111111' },
  { method: 'GET', path: '/api/v2/owner/services/11111111-1111-4111-8111-111111111111/preview' },
  { method: 'POST', path: '/api/v2/owner/services/11111111-1111-4111-8111-111111111111/publish' },
  { method: 'POST', path: '/api/v2/owner/services/11111111-1111-4111-8111-111111111111/unpublish' },
  {
    method: 'POST',
    path: '/api/v2/owner/services/11111111-1111-4111-8111-111111111111/discard-pending',
  },
  { method: 'POST', path: '/api/v2/owner/services/11111111-1111-4111-8111-111111111111/position' },
] as const
