import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { notFoundError } from '#/backend/shared/error'
import { HttpStatusCode } from '#/backend/shared/http'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import {
  PROJECT_LANGUAGES,
  ProjectFilterSchema,
  ProjectReorderSchema,
  ProjectWriteSchema,
} from '#/shared/validation/project.validation'
import * as v from 'valibot'
import {
  createProject,
  deleteProject,
  getProjectForAdmin,
  getPublishedProject,
  listProjectsForAdmin,
  listPublishedProjects,
  reorderProjects,
  updateProject,
} from './project.service'

const IdSchema = v.pipe(v.string(), v.uuid('That is not a project id'))

const LanguageSchema = v.optional(v.picklist(PROJECT_LANGUAGES), 'de')

/** Behind the admin guard: full read and write over drafts and published work. */
export const adminProjectRoutes = new Elysia({ prefix: '/projects' })
  .use(adminGuard)
  .get('/', async ({ query }) =>
    responseOk({
      data: await listProjectsForAdmin(parseInput(ProjectFilterSchema, query)),
      message: 'Projects listed',
    }),
  )
  .post('/reorder', async ({ body }) => {
    const { ids } = parseInput(ProjectReorderSchema, body)
    await reorderProjects(ids)

    return responseOk({ data: { ids }, message: 'Order saved' })
  })
  .get('/:id', async ({ params }) =>
    responseOk({
      data: await getProjectForAdmin(parseInput(IdSchema, params.id)),
      message: 'Project loaded',
    }),
  )
  .post('/', async ({ body, status }) =>
    status(
      HttpStatusCode.CREATED,
      responseOk({
        data: await createProject(parseInput(ProjectWriteSchema, body)),
        message: 'Project created',
      }),
    ),
  )
  .put('/:id', async ({ params, body }) =>
    responseOk({
      data: await updateProject(parseInput(IdSchema, params.id), parseInput(ProjectWriteSchema, body)),
      message: 'Project saved',
    }),
  )
  .delete('/:id', async ({ params }) => {
    await deleteProject(parseInput(IdSchema, params.id))

    return responseOk({ data: { deleted: true }, message: 'Project deleted' })
  })

/**
 * Public read surface. Only published projects, one language at a time, and
 * the explicit projection built in the service — never a table row.
 */
export const publicProjectRoutes = new Elysia({ prefix: '/projects' })
  .get('/', async ({ query }) =>
    responseOk({
      data: await listPublishedProjects(parseInput(LanguageSchema, query.language)),
      message: 'Projects listed',
    }),
  )
  .get('/:slug', async ({ params, query }) => {
    const project = await getPublishedProject(
      parseInput(LanguageSchema, query.language),
      params.slug,
    )

    if (!project) throw notFoundError('That project does not exist')

    return responseOk({ data: project, message: 'Project loaded' })
  })
