import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  ClientDeleteSchema,
  ClientDuplicateQuerySchema,
  ClientListQuerySchema,
  ClientPatchSchema,
  ClientStatusSchema,
  CreateClientSchema,
} from '../../contracts/client.contract'
import { readJsonBody } from '../../http/body'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import {
  createClient,
  deleteClientPermanently,
  findDuplicates,
  getClient,
  listClients,
  patchClient,
  restoreClient,
  setClientStatus,
  trashClient,
} from './client.service'

/**
 * The owner's Client directory, over HTTP. See `docs/v2/clients.md`.
 *
 * Thin: parse, delegate, respond. The whole group sits behind `ownerGuard`,
 * and `ownerJson` puts `no-store` on every reply — contact details and
 * private notes must not survive in any cache.
 *
 * There is no public Client route, and no conversion route here: Leads owns
 * the `Won` command and calls `client.won.ts` inside its own transaction.
 */

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid client id'))

export const ownerClientRoutes = new Elysia({ prefix: '/clients' })
  .use(ownerGuard)

  .get('/', async ({ query }) =>
    ownerJson({
      data: await listClients(parseInput(ClientListQuerySchema, query)),
      message: 'Clients loaded',
    }),
  )

  .post('/', async ({ request }) => {
    const input = parseInput(CreateClientSchema, await readJsonBody(request))

    return ownerJson({
      data: await createClient(input),
      message: 'Client created',
      status: HttpStatus.CREATED,
    })
  })

  /** Likely duplicates, asked while the owner types an email or phone. */
  .get('/duplicates', async ({ query }) =>
    ownerJson({
      data: {
        candidates: await findDuplicates(parseInput(ClientDuplicateQuerySchema, query)),
      },
      message: 'Checked',
    }),
  )

  .get('/:id', async ({ params }) =>
    ownerJson({
      data: await getClient(parseInput(IdSchema, params.id)),
      message: 'Client loaded',
    }),
  )

  .patch('/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { revision, ...patch } = parseInput(ClientPatchSchema, await readJsonBody(request))

    return ownerJson({
      data: await patchClient({ clientId: id, revision, patch }),
      message: 'Client saved',
    })
  })

  .post('/:id/status', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { status } = parseInput(ClientStatusSchema, await readJsonBody(request))

    return ownerJson({
      data: await setClientStatus({ clientId: id, status }),
      message: status === 'active' ? 'Client reactivated' : 'Client marked inactive',
    })
  })

  .post('/:id/trash', async ({ params }) =>
    ownerJson({
      data: await trashClient(parseInput(IdSchema, params.id)),
      message: 'Moved to Trash',
    }),
  )

  .post('/:id/restore', async ({ params }) =>
    ownerJson({
      data: await restoreClient(parseInput(IdSchema, params.id)),
      message: 'Restored',
    }),
  )

  /** Permanent, from Trash only, and it asks for the Client's own id back. */
  .delete('/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { confirm } = parseInput(ClientDeleteSchema, await readJsonBody(request))

    return ownerJson({
      data: await deleteClientPermanently({ clientId: id, confirm }),
      message: 'Deleted permanently',
    })
  })

/** Every owner route, for the tests that walk the fence. */
export const ownerClientPaths = [
  { method: 'GET', path: '/api/v2/owner/clients' },
  { method: 'POST', path: '/api/v2/owner/clients' },
  {
    method: 'GET',
    path: '/api/v2/owner/clients/duplicates?email=a%40example.com',
  },
  {
    method: 'GET',
    path: '/api/v2/owner/clients/11111111-1111-4111-8111-111111111111',
  },
  {
    method: 'PATCH',
    path: '/api/v2/owner/clients/11111111-1111-4111-8111-111111111111',
  },
  {
    method: 'DELETE',
    path: '/api/v2/owner/clients/11111111-1111-4111-8111-111111111111',
  },
  {
    method: 'POST',
    path: '/api/v2/owner/clients/11111111-1111-4111-8111-111111111111/status',
  },
  {
    method: 'POST',
    path: '/api/v2/owner/clients/11111111-1111-4111-8111-111111111111/trash',
  },
  {
    method: 'POST',
    path: '/api/v2/owner/clients/11111111-1111-4111-8111-111111111111/restore',
  },
] as const
