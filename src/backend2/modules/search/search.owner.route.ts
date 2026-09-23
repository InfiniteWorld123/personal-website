import { Elysia } from 'elysia'
import { SearchQuerySchema } from '../../contracts/search.contract'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import { search } from './search.service'

/**
 * `GET /api/v2/owner/search?q=` — the Dashboard's global search
 * (`docs/v2/search.md`). Owner-only and `no-store`, like every owner route:
 * results name clients and quote conversation previews.
 */
export const ownerSearchRoutes = new Elysia({ prefix: '/search' })
  .use(ownerGuard)
  .get('/', async ({ query }) => ownerJson({ data: await search(parseInput(SearchQuerySchema, query)), message: 'Search results' }))
