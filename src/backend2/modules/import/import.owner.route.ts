import { Elysia } from 'elysia'
import { ImportConfirmSchema } from '../../contracts/import.contract'
import { readJsonBody } from '../../http/body'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import { planImport, runImportStep } from './import.service'

/**
 * "Copy from the old site", over HTTP. Owner-only, behind the same guard as
 * every other owner route (the deployment fence, a V2 session, and CSRF on
 * the write).
 *
 * - `GET`  — the dry run: what would be copied, skipped or left for the owner.
 * - `POST` — `{ "confirm": true }` runs one step; the Dashboard repeats it.
 *
 * The origin is passed down because the old site's own image files are read
 * from the site that is answering this request.
 */
export const ownerImportRoutes = new Elysia({ prefix: '/import/legacy' })
  .use(ownerGuard)

  .get('/', async ({ request }) =>
    ownerJson({ data: await planImport(new URL(request.url).origin), message: 'Plan ready' }),
  )

  .post('/', async ({ request }) => {
    parseInput(ImportConfirmSchema, await readJsonBody(request))

    return ownerJson({ data: await runImportStep(new URL(request.url).origin), message: 'Step done' })
  })

/** Every owner route, for the tests that walk the fence. */
export const ownerImportPaths = [
  { method: 'GET', path: '/api/v2/owner/import/legacy' },
  { method: 'POST', path: '/api/v2/owner/import/legacy' },
] as const
