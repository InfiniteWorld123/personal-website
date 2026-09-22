import { Elysia } from 'elysia'
import * as v from 'valibot'
import { notFound } from '../../http/error'
import { parseInput } from '../../http/validate'
import { fileResponse, matchesEtag, notModified } from './media.http'
import { openPublicAsset } from './media.service'

/**
 * The one way a file in the vault reaches a visitor.
 *
 * Outside the owner fence by design, and it gives nothing away: the library,
 * its folders, its filenames and every asset that no live published snapshot
 * uses are all a 404 here, and a 404 that looks the same as a wrong id.
 *
 * `docs/v2/media.md`: the check runs "on every request … possession of an
 * opaque ID alone grants no access." So unpublishing the article that used an
 * image takes the origin away from it immediately; only a shared cache may
 * keep serving it, for at most the hour below.
 */

const IdSchema = v.pipe(v.string(), v.uuid())

/**
 * One hour, and deliberately not `immutable`.
 *
 * The object never changes, so `immutable` would be true and would also mean a
 * withdrawn image kept being served by caches indefinitely. An hour is the
 * ceiling on how long "I unpublished that" takes to become true everywhere.
 */
const PUBLIC_CACHE = 'public, max-age=3600'

export const publicMediaRoutes = new Elysia({ prefix: '/media' }).get(
  '/:id',
  async ({ params, request }) => {
    const parsed = v.safeParse(IdSchema, params.id)

    // A malformed id is "not found", not "invalid": the difference would tell
    // a stranger which ids are worth trying.
    if (!parsed.success) throw notFound('Not found')

    const opened = await openPublicAsset(parseInput(IdSchema, params.id))
    const etag = `"${opened.asset.checksum}"`

    if (matchesEtag(request, etag)) {
      // The body is already open; let it go rather than leaving it dangling.
      await opened.body.cancel().catch(() => {})

      return notModified(etag, PUBLIC_CACHE)
    }

    return fileResponse(opened, { cacheControl: PUBLIC_CACHE, etag })
  },
)
