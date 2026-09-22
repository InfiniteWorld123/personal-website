import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  CreateProjectSchema,
  PositionSchema,
  ProjectListQuerySchema,
  PublicDetailQuerySchema,
  RevisionSchema,
  SaveDraftSchema,
} from '../../contracts/project.contract'
import { readJsonBody } from '../../http/body'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import { moveProject } from './project.order'
import {
  archive,
  deleteProject,
  discardPending,
  publish,
  restore,
  unpublish,
} from './project.publish'
import {
  createProject,
  getProject,
  isSlugAvailable,
  listProjects,
  previewProject,
  saveDraft,
} from './project.service'

/**
 * The owner's projects, over HTTP.
 *
 * Thin, like every other Backend2 route file: parse, delegate, respond. The
 * whole group sits behind `ownerGuard` — the deployment fence plus, with
 * `BACKEND2_OWNER_AUTH=required`, a real V2 owner session — and nothing here
 * re-implements that check.
 *
 * `ownerJson` rather than a bare object: every reply carries `no-store`,
 * because a private draft must not survive in any cache.
 */

const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid project id'))

export const ownerProjectRoutes = new Elysia({ prefix: '/projects' })
  .use(ownerGuard)

  .get('/', async ({ query }) =>
    ownerJson({
      data: await listProjects(parseInput(ProjectListQuerySchema, query)),
      message: 'Projects loaded',
    }),
  )

  .post('/', async ({ request }) => {
    const input = parseInput(CreateProjectSchema, await readJsonBody(request))

    return ownerJson({
      data: await createProject(input),
      message: 'Project created',
      status: HttpStatus.CREATED,
    })
  })

  /**
   * Is a web address free? Asked while the owner types, so it answers about
   * any project rather than only the one being edited.
   */
  .get('/slug-available', async ({ query }) => {
    const parsed = parseInput(
      v.object({
        slug: v.pipe(v.string(), v.trim(), v.maxLength(80)),
        projectId: v.optional(IdSchema, '00000000-0000-4000-8000-000000000000'),
      }),
      query,
    )

    const available = await isSlugAvailable({ slug: parsed.slug, projectId: parsed.projectId })

    return ownerJson({
      data: {
        available,
        reason: available
          ? undefined
          : parsed.slug === ''
            ? 'A web address is needed before publishing'
            : 'Another project already uses that web address',
      },
      message: 'Checked',
    })
  })

  .get('/:id', async ({ params }) =>
    ownerJson({ data: await getProject(parseInput(IdSchema, params.id)), message: 'Project loaded' }),
  )

  /**
   * One save replaces the whole draft.
   *
   * There is exactly one editor, so there is no merge to get wrong, and a full
   * replace means the client never has to compute a diff. The published
   * version is not read and not written here — saving cannot change what
   * visitors see.
   */
  .put('/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { draftRevision, ...draft } = parseInput(SaveDraftSchema, await readJsonBody(request))

    return ownerJson({
      data: await saveDraft({ projectId: id, draftRevision, draft }),
      message: 'Draft saved',
    })
  })

  .post('/:id/publish', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { draftRevision } = parseInput(RevisionSchema, await readJsonBody(request))

    return ownerJson({ data: await publish({ projectId: id, draftRevision }), message: 'Published' })
  })

  .post('/:id/unpublish', async ({ params }) =>
    ownerJson({ data: await unpublish(parseInput(IdSchema, params.id)), message: 'Unpublished' }),
  )

  .post('/:id/discard-pending', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { draftRevision } = parseInput(RevisionSchema, await readJsonBody(request))

    return ownerJson({
      data: await discardPending({ projectId: id, draftRevision }),
      message: 'Pending changes discarded',
    })
  })

  /**
   * An absolute position, not a direction. "Move up" and "move down" are this
   * same call with `n ± 1`, which is what lets a move from page 3 to position
   * 2 work without the browser ever holding the whole list.
   */
  .post('/:id/position', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const { position } = parseInput(PositionSchema, await readJsonBody(request))
    const order = await moveProject({ projectId: id, position })

    return ownerJson({
      data: { id, position: order.indexOf(id) + 1, order },
      message: 'Order updated',
    })
  })

  .post('/:id/archive', async ({ params }) =>
    ownerJson({ data: await archive(parseInput(IdSchema, params.id)), message: 'Archived' }),
  )

  .post('/:id/restore', async ({ params }) =>
    ownerJson({ data: await restore(parseInput(IdSchema, params.id)), message: 'Restored' }),
  )

  /**
   * Permanent, and it asks for the project's own id back to prove the owner
   * meant this project. The library keeps every file; only the uses are
   * forgotten.
   */
  .delete('/:id', async ({ params, request }) => {
    const id = parseInput(IdSchema, params.id)
    const body = await readJsonBody(request)
    const { confirm } = parseInput(v.object({ confirm: v.string() }), body)

    return ownerJson({ data: await deleteProject({ projectId: id, confirm }), message: 'Deleted' })
  })

  /** The draft, rendered through the same projection the live site uses. */
  .get('/:id/preview', async ({ params, query }) => {
    const id = parseInput(IdSchema, params.id)
    const { language } = parseInput(PublicDetailQuerySchema, query)

    return ownerJson({ data: await previewProject({ projectId: id, language }), message: 'Preview' })
  })

/** Kept for the route enumeration the guard tests walk. */
export const ownerProjectPaths = [
  { method: 'GET', path: '/api/v2/owner/projects' },
  { method: 'POST', path: '/api/v2/owner/projects' },
  { method: 'GET', path: '/api/v2/owner/projects/slug-available?slug=x' },
  { method: 'GET', path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111' },
  { method: 'PUT', path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111' },
  { method: 'POST', path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111/publish' },
  { method: 'POST', path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111/unpublish' },
  {
    method: 'POST',
    path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111/discard-pending',
  },
  { method: 'POST', path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111/position' },
  { method: 'POST', path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111/archive' },
  { method: 'POST', path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111/restore' },
  { method: 'DELETE', path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111' },
  { method: 'GET', path: '/api/v2/owner/projects/11111111-1111-4111-8111-111111111111/preview' },
] as const
