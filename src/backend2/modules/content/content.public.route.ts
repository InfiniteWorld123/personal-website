import { Elysia } from 'elysia'
import { PublicContentQuerySchema } from '../../contracts/content.contract'
import { responseOk } from '../../http/response'
import { HttpStatus } from '../../http/status'
import { parseInput } from '../../http/validate'
import { readPublicContent } from './content.service'

/**
 * One language's static copy and the shared facts, as the owner saved them.
 *
 * Mounted only where the V2 database is configured, like every other public
 * V2 read.
 *
 * Caching is chosen for the owner's rule that a saved field is live. Any cache
 * may keep a copy, but must ask again every time (`max-age=0,
 * must-revalidate`); the `ETag` makes that question cheap — an unchanged
 * answer is a bodiless `304`. A long `max-age` would let the Dashboard say
 * "Saved and live" while visitors kept the old wording for minutes.
 */
const PUBLIC_CACHE = 'public, max-age=0, must-revalidate'

const etagOf = async (body: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body))
  const hex = [...new Uint8Array(digest).slice(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')

  return `"${hex}"`
}

const matches = (request: Request, etag: string): boolean =>
  (request.headers.get('if-none-match') ?? '')
    .split(',')
    .map((value) => value.trim().replace(/^W\//u, ''))
    .includes(etag)

export const publicContentRoutes = new Elysia({ prefix: '/content' }).get(
  '/',
  async ({ query, request }) => {
    const { language } = parseInput(PublicContentQuerySchema, query)
    const body = JSON.stringify(
      responseOk({ data: await readPublicContent(language), message: 'Content loaded' }),
    )
    const etag = await etagOf(body)
    const headers = { etag, 'cache-control': PUBLIC_CACHE, vary: 'accept-encoding' }

    if (matches(request, etag)) return new Response(null, { status: HttpStatus.NOT_MODIFIED, headers })

    return new Response(body, {
      status: HttpStatus.OK,
      headers: { ...headers, 'content-type': 'application/json', 'x-content-type-options': 'nosniff' },
    })
  },
)
