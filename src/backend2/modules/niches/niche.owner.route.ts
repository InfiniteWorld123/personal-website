import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  CreateNicheSchema,
  NicheListQuerySchema,
  NichePatchSchema,
} from '../../contracts/niche.contract'
import { readJsonBody } from '../../http/body'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import { createNiche, deleteNiche, listNiches, patchNiche } from './niche.service'

/**
 * The owner's niche list, over HTTP. Shared by Clients and Leads. Thin:
 * parse, delegate, respond, behind the owner fence.
 */

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid niche id'))

export const ownerNicheRoutes = new Elysia({ prefix: '/niches' })
  .use(ownerGuard)

  .get('/', async ({ query }) =>
    ownerJson({
      data: await listNiches(parseInput(NicheListQuerySchema, query)),
      message: 'Niches loaded',
    }),
  )

  .post('/', async ({ request }) => {
    const { name } = parseInput(CreateNicheSchema, await readJsonBody(request))

    return ownerJson({
      data: await createNiche(name),
      message: 'Niche added',
      status: HttpStatus.CREATED,
    })
  })

  .patch('/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const patch = parseInput(NichePatchSchema, await readJsonBody(request))

    return ownerJson({ data: await patchNiche({ id, patch }), message: 'Niche saved' })
  })

  .delete('/:id', async ({ params }) =>
    ownerJson({
      data: await deleteNiche(parseInput(IdSchema, params.id)),
      message: 'Niche deleted',
    }),
  )

/** Every owner route, for the tests that walk the fence. */
export const ownerNichePaths = [
  { method: 'GET', path: '/api/v2/owner/niches' },
  { method: 'POST', path: '/api/v2/owner/niches' },
  { method: 'PATCH', path: '/api/v2/owner/niches/11111111-1111-4111-8111-111111111111' },
  { method: 'DELETE', path: '/api/v2/owner/niches/11111111-1111-4111-8111-111111111111' },
] as const
