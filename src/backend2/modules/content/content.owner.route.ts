import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  ContentHistoryQuerySchema,
  ContentRestoreHistorySchema,
  ContentRestoreOriginalSchema,
  ContentReviewedSchema,
  ContentSaveSchema,
} from '../../contracts/content.contract'
import { readJsonBody } from '../../http/body'
import { badRequest } from '../../http/error'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import {
  getContentSnapshot,
  listContentHistory,
  markReviewed,
  restoreFromHistory,
  restoreOriginal,
  saveContentField,
} from './content.service'

/**
 * The owner's static copy, over HTTP.
 *
 * Thin: parse, delegate, respond. The whole group sits behind `ownerGuard` —
 * the deployment fence, plus a real V2 owner session wherever
 * `BACKEND2_OWNER_AUTH=required`. `ownerJson` marks every reply `no-store`.
 *
 * There is no Publish route, and that is the design (`docs/v2/content.md`):
 * a `PUT` that succeeds *is* the change visitors see.
 */

const HistoryIdSchema = v.pipe(v.string(), v.uuid('That is not a valid history entry'))

/**
 * A field key arrives percent-encoded — `home.hero.typed%5B%5D` — because a
 * list key ends in `[]`. Decoded here once, and refused if it cannot be.
 */
const readKey = (raw: unknown): string => {
  const text = String(raw ?? '')

  try {
    const key = decodeURIComponent(text).trim()
    if (key === '' || key.length > 200) throw badRequest('That is not a field key')

    return key
  } catch {
    throw badRequest('That is not a field key')
  }
}

export const ownerContentRoutes = new Elysia({ prefix: '/content' })
  .use(ownerGuard)

  /** The registry and every live value, review flags included. */
  .get('/', async () => ownerJson({ data: await getContentSnapshot(), message: 'Content loaded' }))

  /** Newest first, one bounded page at a time. `key` and `language` narrow it. */
  .get('/history', async ({ query }) =>
    ownerJson({
      data: await listContentHistory(parseInput(ContentHistoryQuerySchema, query)),
      message: 'History loaded',
    }),
  )

  /** Saves one field in one language. Live on success. */
  .put('/fields/:key', async ({ params, request }) => {
    const input = parseInput(ContentSaveSchema, await readJsonBody(request))
    const result = await saveContentField({ key: readKey(params.key), ...input })

    return ownerJson({ data: result, message: result.changed ? 'Saved and live' : 'Already live' })
  })

  .post('/fields/:key/restore-original', async ({ params, request }) => {
    const input = parseInput(ContentRestoreOriginalSchema, await readJsonBody(request))
    const result = await restoreOriginal({ key: readKey(params.key), ...input })

    return ownerJson({ data: result, message: result.changed ? 'Original restored' : 'Already the original' })
  })

  /** Clears the translation-review reminder for one language. Changes no wording. */
  .post('/fields/:key/reviewed', async ({ params, request }) => {
    const { language } = parseInput(ContentReviewedSchema, await readJsonBody(request))

    return ownerJson({
      data: await markReviewed({ key: readKey(params.key), language }),
      message: 'Marked as reviewed',
    })
  })

  .post('/history/:id/restore', async ({ params, request }) => {
    const historyId = parseInput(HistoryIdSchema, params.id)
    const input = parseInput(ContentRestoreHistorySchema, await readJsonBody(request))
    const result = await restoreFromHistory({ historyId, ...input })

    return ownerJson({ data: result, message: result.changed ? 'Restored and live' : 'Already live' })
  })

/** Every owner route, for the tests that walk the fence. */
export const ownerContentPaths = [
  { method: 'GET', path: '/api/v2/owner/content' },
  { method: 'GET', path: '/api/v2/owner/content/history' },
  { method: 'PUT', path: '/api/v2/owner/content/fields/home.hero.headline' },
  { method: 'POST', path: '/api/v2/owner/content/fields/home.hero.headline/restore-original' },
  { method: 'POST', path: '/api/v2/owner/content/fields/home.hero.headline/reviewed' },
  { method: 'POST', path: '/api/v2/owner/content/history/11111111-1111-4111-8111-111111111111/restore' },
] as const
