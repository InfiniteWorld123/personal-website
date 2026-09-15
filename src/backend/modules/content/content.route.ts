import { Elysia } from 'elysia'
import { adminGuard } from '#/backend/modules/admin/admin.guard'
import { responseOk } from '#/backend/shared/response'
import { parseInput } from '#/backend/shared/validate'
import {
  ContentResetSchema,
  ContentRevertSchema,
  ContentReviewedSchema,
  ContentSaveSchema,
} from '#/shared/validation/content.validation'
import {
  getContentSnapshot,
  getPublishDiff,
  listContentRevisions,
  markContentReviewed,
  publishContent,
  resetContentField,
  revertContentRevision,
  saveContentDraft,
} from './content.service'

/**
 * Editing the site's own words. Admin-only in full: there is no public content
 * endpoint, because the public pages read their copy on the server while they
 * render rather than fetching it back over HTTP.
 */
export const adminContentRoutes = new Elysia({ prefix: '/content' })
  .use(adminGuard)
  .get('/', async () =>
    responseOk({ data: await getContentSnapshot(), message: 'Content loaded' }),
  )
  .get('/revisions', async () =>
    responseOk({ data: await listContentRevisions(), message: 'Revisions listed' }),
  )
  .get('/diff', async () =>
    responseOk({ data: await getPublishDiff(), message: 'Pending changes listed' }),
  )
  .put('/draft', async ({ body }) =>
    responseOk({
      data: await saveContentDraft(parseInput(ContentSaveSchema, body)),
      message: 'Draft saved',
    }),
  )
  .post('/reset', async ({ body }) =>
    responseOk({
      data: await resetContentField(parseInput(ContentResetSchema, body)),
      message: 'Original restored',
    }),
  )
  .post('/reviewed', async ({ body }) =>
    responseOk({
      data: await markContentReviewed(parseInput(ContentReviewedSchema, body)),
      message: 'Marked as reviewed',
    }),
  )
  .post('/revert', async ({ body }) =>
    responseOk({
      data: await revertContentRevision(parseInput(ContentRevertSchema, body).revisionId),
      message: 'Earlier wording restored as a draft',
    }),
  )
  .post('/publish', async () =>
    responseOk({ data: await publishContent(), message: 'Published' }),
  )
