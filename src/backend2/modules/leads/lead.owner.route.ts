import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  ChoiceListQuerySchema,
  ChoicePatchSchema,
  CreateChoiceSchema,
  CreateLeadSchema,
  FollowUpListQuerySchema,
  FollowUpPatchSchema,
  FollowUpSchema,
  ImportCommitSchema,
  ImportPreviewSchema,
  LeadDeleteSchema,
  LeadDuplicateQuerySchema,
  LeadListQuerySchema,
  LeadPatchSchema,
  StageChangeSchema,
  StagePatchSchema,
} from '../../contracts/lead.contract'
import { PageQuerySchema } from '../../contracts/pagination.contract'
import { readJsonBody, readLimited } from '../../http/body'
import { badRequest } from '../../http/error'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import type { ChoiceTable } from './lead-choice.repo'
import {
  createChoice,
  createStage,
  deleteChoice,
  deleteStage,
  listChoices,
  listStages,
  patchChoice,
  patchStage,
} from './lead-choice.service'
import {
  closeFollowUp,
  createFollowUp,
  dueFollowUpCount,
  listFollowUps,
  patchFollowUp,
} from './lead.follow-up'
import {
  commitImport,
  deleteImport,
  getImport,
  listImports,
  previewImport,
  rejectionReport,
} from './lead.import'
import {
  createLead,
  deleteLeadPermanently,
  findDuplicates,
  getLead,
  listLeads,
  patchLead,
  restoreLead,
  trashLead,
} from './lead.service'
import { changeStage } from './lead.stage'

/**
 * The owner's Leads, over HTTP. See `docs/v2/leads.md`.
 *
 * Thin: parse, delegate, respond, behind the owner fence, with `no-store` on
 * every reply. There is no public Lead route. The fixed paths (`stages`,
 * `sources`, `loss-reasons`, `follow-ups`, `imports`, `duplicates`) are
 * registered before `/:id`, so they are never read as an id.
 */

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

/**
 * An import body: the CSV travels inside JSON, where quotes and line breaks
 * take two bytes each, so a file at the 2 MB limit needs a little more room
 * than an ordinary request. The file's own size is checked again inside.
 */
const IMPORT_BODY_BYTES = 3 * 1024 * 1024

const readImportBody = async (request: Request): Promise<unknown> => {
  const bytes = await readLimited(request, IMPORT_BODY_BYTES)

  if (bytes.byteLength === 0) return {}

  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw badRequest('The request body is not valid JSON')
  }
}

/** The same four routes for sources and for lost reasons. */
const choiceRoutes = (path: string, kind: ChoiceTable) =>
  new Elysia({ prefix: path })
    // Stated again here: a guard reaches one plugin level, not a nested one.
    .use(ownerGuard)
    .get('/', async ({ query }) =>
      ownerJson({
        data: await listChoices(kind, parseInput(ChoiceListQuerySchema, query)),
        message: 'Loaded',
      }),
    )
    .post('/', async ({ request }) => {
      const { name } = parseInput(CreateChoiceSchema, await readJsonBody(request))

      return ownerJson({
        data: await createChoice(kind, name),
        message: 'Added',
        status: HttpStatus.CREATED,
      })
    })
    .patch('/:id', async ({ params, request }) => {
      const id = parseInput(IdSchema, params.id)
      const patch = parseInput(ChoicePatchSchema, await readJsonBody(request))

      return ownerJson({ data: await patchChoice(kind, { id, ...patch }), message: 'Saved' })
    })
    .delete('/:id', async ({ params }) =>
      ownerJson({
        data: await deleteChoice(kind, parseInput(IdSchema, params.id)),
        message: 'Deleted',
      }),
    )

export const ownerLeadRoutes = new Elysia({ prefix: '/leads' })
  .use(ownerGuard)

  .get('/', async ({ query }) =>
    ownerJson({
      data: await listLeads(parseInput(LeadListQuerySchema, query)),
      message: 'Leads loaded',
    }),
  )

  .post('/', async ({ request }) => {
    const input = parseInput(CreateLeadSchema, await readJsonBody(request))

    return ownerJson({
      data: await createLead(input),
      message: 'Lead created',
      status: HttpStatus.CREATED,
    })
  })

  .get('/duplicates', async ({ query }) =>
    ownerJson({
      data: { candidates: await findDuplicates(parseInput(LeadDuplicateQuerySchema, query)) },
      message: 'Checked',
    }),
  )

  /* ------------------------------------------------------------- stages */

  .get('/stages', async () => ownerJson({ data: await listStages(), message: 'Stages loaded' }))

  .post('/stages', async ({ request }) => {
    const { name } = parseInput(CreateChoiceSchema, await readJsonBody(request))

    return ownerJson({
      data: await createStage(name),
      message: 'Stage added',
      status: HttpStatus.CREATED,
    })
  })

  .patch('/stages/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const patch = parseInput(StagePatchSchema, await readJsonBody(request))

    return ownerJson({ data: await patchStage({ id, ...patch }), message: 'Stage saved' })
  })

  .delete('/stages/:id', async ({ params }) =>
    ownerJson({
      data: await deleteStage(parseInput(IdSchema, params.id)),
      message: 'Stage deleted',
    }),
  )

  .use(choiceRoutes('/sources', 'sources'))
  .use(choiceRoutes('/loss-reasons', 'reasons'))

  /* --------------------------------------------------------- follow-ups */

  .get('/follow-ups', async ({ query }) =>
    ownerJson({
      data: await listFollowUps(parseInput(FollowUpListQuerySchema, query)),
      message: 'Follow-ups loaded',
    }),
  )

  .get('/follow-ups/due-count', async () =>
    ownerJson({ data: await dueFollowUpCount(), message: 'Counted' }),
  )

  /* ------------------------------------------------------------ imports */

  .post('/imports/preview', async ({ request }) => {
    const input = parseInput(ImportPreviewSchema, await readImportBody(request))

    return ownerJson({ data: await previewImport(input), message: 'Preview ready' })
  })

  .post('/imports', async ({ request }) => {
    const input = parseInput(ImportCommitSchema, await readImportBody(request))

    return ownerJson({
      data: await commitImport(input),
      message: 'Imported',
      status: HttpStatus.CREATED,
    })
  })

  .get('/imports', async ({ query }) =>
    ownerJson({
      data: await listImports(parseInput(PageQuerySchema, query)),
      message: 'Imports loaded',
    }),
  )

  .get('/imports/:id', async ({ params, query }) => {
    const id = parseInput(IdSchema, params.id)
    const page = parseInput(PageQuerySchema, query)

    return ownerJson({ data: await getImport({ id, ...page }), message: 'Import loaded' })
  })

  /** The rejected rows as a file, never cached, never shown inline. */
  .get('/imports/:id/rejections.csv', async ({ params }) => {
    const report = await rejectionReport(parseInput(IdSchema, params.id))

    return new Response(report.csv, {
      status: HttpStatus.OK,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${report.fileName.replace(/[^\w.-]+/gu, '_')}"`,
        'cache-control': 'no-store, no-cache, must-revalidate',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  })

  .delete('/imports/:id', async ({ params }) =>
    ownerJson({
      data: await deleteImport(parseInput(IdSchema, params.id)),
      message: 'Report deleted',
    }),
  )

  /* ------------------------------------------------------------ one lead */

  .get('/:id', async ({ params }) =>
    ownerJson({ data: await getLead(parseInput(IdSchema, params.id)), message: 'Lead loaded' }),
  )

  .patch('/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { revision, allowDuplicate, ...patch } = parseInput(
      LeadPatchSchema,
      await readJsonBody(request),
    )

    return ownerJson({
      data: await patchLead({ leadId: id, revision, allowDuplicate, patch }),
      message: 'Lead saved',
    })
  })

  .post('/:id/stage', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const change = parseInput(StageChangeSchema, await readJsonBody(request))

    return ownerJson({ data: await changeStage({ leadId: id, change }), message: 'Stage changed' })
  })

  .post('/:id/follow-up', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const input = parseInput(FollowUpSchema, await readJsonBody(request))

    return ownerJson({
      data: await createFollowUp({ leadId: id, ...input }),
      message: 'Follow-up set',
      status: HttpStatus.CREATED,
    })
  })

  /** Postpone, or reword. */
  .patch('/:id/follow-up', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const input = parseInput(FollowUpPatchSchema, await readJsonBody(request))

    return ownerJson({
      data: await patchFollowUp({ leadId: id, ...input }),
      message: 'Follow-up moved',
    })
  })

  .post('/:id/follow-up/complete', async ({ params }) =>
    ownerJson({
      data: await closeFollowUp({ leadId: parseInput(IdSchema, params.id), how: 'completed' }),
      message: 'Follow-up done',
    }),
  )

  .post('/:id/follow-up/cancel', async ({ params }) =>
    ownerJson({
      data: await closeFollowUp({ leadId: parseInput(IdSchema, params.id), how: 'cancelled' }),
      message: 'Follow-up cancelled',
    }),
  )

  .post('/:id/trash', async ({ params }) =>
    ownerJson({
      data: await trashLead(parseInput(IdSchema, params.id)),
      message: 'Moved to Trash',
    }),
  )

  .post('/:id/restore', async ({ params }) =>
    ownerJson({ data: await restoreLead(parseInput(IdSchema, params.id)), message: 'Restored' }),
  )

  .delete('/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { confirm } = parseInput(LeadDeleteSchema, await readJsonBody(request))

    return ownerJson({
      data: await deleteLeadPermanently({ leadId: id, confirm }),
      message: 'Deleted permanently',
    })
  })

const ID = '11111111-1111-4111-8111-111111111111'

/** Every owner route, for the tests that walk the fence. */
export const ownerLeadPaths = [
  { method: 'GET', path: '/api/v2/owner/leads' },
  { method: 'POST', path: '/api/v2/owner/leads' },
  { method: 'GET', path: '/api/v2/owner/leads/duplicates?email=a%40example.com' },
  { method: 'GET', path: '/api/v2/owner/leads/stages' },
  { method: 'POST', path: '/api/v2/owner/leads/stages' },
  { method: 'PATCH', path: `/api/v2/owner/leads/stages/${ID}` },
  { method: 'DELETE', path: `/api/v2/owner/leads/stages/${ID}` },
  { method: 'GET', path: '/api/v2/owner/leads/sources' },
  { method: 'POST', path: '/api/v2/owner/leads/sources' },
  { method: 'PATCH', path: `/api/v2/owner/leads/sources/${ID}` },
  { method: 'DELETE', path: `/api/v2/owner/leads/sources/${ID}` },
  { method: 'GET', path: '/api/v2/owner/leads/loss-reasons' },
  { method: 'POST', path: '/api/v2/owner/leads/loss-reasons' },
  { method: 'PATCH', path: `/api/v2/owner/leads/loss-reasons/${ID}` },
  { method: 'DELETE', path: `/api/v2/owner/leads/loss-reasons/${ID}` },
  { method: 'GET', path: '/api/v2/owner/leads/follow-ups' },
  { method: 'GET', path: '/api/v2/owner/leads/follow-ups/due-count' },
  { method: 'POST', path: '/api/v2/owner/leads/imports/preview' },
  { method: 'POST', path: '/api/v2/owner/leads/imports' },
  { method: 'GET', path: '/api/v2/owner/leads/imports' },
  { method: 'GET', path: `/api/v2/owner/leads/imports/${ID}` },
  { method: 'GET', path: `/api/v2/owner/leads/imports/${ID}/rejections.csv` },
  { method: 'DELETE', path: `/api/v2/owner/leads/imports/${ID}` },
  { method: 'GET', path: `/api/v2/owner/leads/${ID}` },
  { method: 'PATCH', path: `/api/v2/owner/leads/${ID}` },
  { method: 'POST', path: `/api/v2/owner/leads/${ID}/stage` },
  { method: 'POST', path: `/api/v2/owner/leads/${ID}/follow-up` },
  { method: 'PATCH', path: `/api/v2/owner/leads/${ID}/follow-up` },
  { method: 'POST', path: `/api/v2/owner/leads/${ID}/follow-up/complete` },
  { method: 'POST', path: `/api/v2/owner/leads/${ID}/follow-up/cancel` },
  { method: 'POST', path: `/api/v2/owner/leads/${ID}/trash` },
  { method: 'POST', path: `/api/v2/owner/leads/${ID}/restore` },
  { method: 'DELETE', path: `/api/v2/owner/leads/${ID}` },
] as const
