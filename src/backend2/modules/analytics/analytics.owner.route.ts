import { Elysia } from 'elysia'
import * as v from 'valibot'
import {
  ANALYTICS_RANKINGS,
  ANALYTICS_SECTIONS,
  type AnalyticsRanking,
  type AnalyticsSection,
  BlogRankingFilterSchema,
  PeriodQuerySchema,
  SalesFilterSchema,
} from '../../contracts/analytics.contract'
import { PageQuerySchema } from '../../contracts/pagination.contract'
import { notFound, validationFailed } from '../../http/error'
import { parseInput } from '../../http/validate'
import { ownerGuard } from '../../security/owner-guard'
import { ownerJson } from '../media/media.http'
import { resolvePeriod } from './analytics.period'
import { getRanking } from './analytics.rankings'
import { getOverview, getSection } from './analytics.service'
import { currentSources } from './analytics.sources'

/**
 * The owner's Analytics and Overview, over HTTP. See `docs/v2/analytics.md`.
 *
 * Read-only: three GET routes and nothing else, behind the owner fence, with
 * `no-store` on every reply. The query string is checked strictly — a filter a
 * route does not take is refused by name rather than silently ignored, so a
 * misspelt `orgin=imported` can never quietly show the unfiltered figure.
 */

const PERIOD_KEYS = ['period', 'from', 'to', 'bucket'] as const
const PAGE_KEYS = ['page', 'pageSize'] as const

const refuseUnknown = (query: Record<string, unknown>, allowed: readonly string[]): void => {
  const unknown = Object.keys(query).filter((key) => !allowed.includes(key))

  if (unknown.length === 0) return

  const issues = unknown.map((field) => ({ field, message: `${field} is not a filter here` }))

  throw validationFailed(issues[0]!.message, { issues, missing: [] })
}

const periodFrom = (query: Record<string, unknown>, now: Date) =>
  resolvePeriod(
    parseInput(PeriodQuerySchema, {
      period: query.period,
      from: query.from,
      to: query.to,
      bucket: query.bucket,
    }),
    now,
  )

const SectionSchema = v.picklist(ANALYTICS_SECTIONS)
const RankingSchema = v.picklist(ANALYTICS_RANKINGS)

export const ownerAnalyticsRoutes = new Elysia({ prefix: '/analytics' })
  .use(ownerGuard)

  .get('/overview', async ({ query }) => {
    refuseUnknown(query, PERIOD_KEYS)

    const now = currentSources().now()

    return ownerJson({
      data: await getOverview({ period: periodFrom(query, now), now }),
      message: 'Overview loaded',
    })
  })

  .get('/sections/:section', async ({ params, query }) => {
    if (!v.is(SectionSchema, params.section)) throw notFound('That analytics section does not exist')

    const section: AnalyticsSection = params.section

    refuseUnknown(query, section === 'sales' ? [...PERIOD_KEYS, 'origin'] : PERIOD_KEYS)

    const now = currentSources().now()
    const period = periodFrom(query, now)
    const filters = section === 'sales' ? parseInput(SalesFilterSchema, { origin: query.origin }) : {}

    return ownerJson({
      data: await getSection({ section, period, now, filters }),
      message: 'Analytics loaded',
    })
  })

  .get('/rankings/:ranking', async ({ params, query }) => {
    if (!v.is(RankingSchema, params.ranking)) throw notFound('That ranking does not exist')

    const ranking: AnalyticsRanking = params.ranking
    const extra =
      ranking === 'blog-posts' ? ['by'] : ranking === 'website-pages' ? [] : ['origin']

    refuseUnknown(query, [...PERIOD_KEYS, ...PAGE_KEYS, ...extra])

    const now = currentSources().now()
    const period = periodFrom(query, now)
    const page = parseInput(PageQuerySchema, { page: query.page, pageSize: query.pageSize })
    const { origin } = parseInput(SalesFilterSchema, { origin: query.origin })
    const { by } = parseInput(BlogRankingFilterSchema, { by: query.by })

    return ownerJson({
      data: await getRanking({ ranking, period, now, page, filters: { origin, by } }),
      message: 'Ranking loaded',
    })
  })

/** Every owner route, for the boundary test: each must answer 404 off-local. */
export const ownerAnalyticsPaths = [
  { method: 'GET', path: '/api/v2/owner/analytics/overview' },
  { method: 'GET', path: '/api/v2/owner/analytics/sections/website' },
  { method: 'GET', path: '/api/v2/owner/analytics/sections/sales' },
  { method: 'GET', path: '/api/v2/owner/analytics/sections/operations' },
  { method: 'GET', path: '/api/v2/owner/analytics/sections/money' },
  { method: 'GET', path: '/api/v2/owner/analytics/sections/assistant' },
  { method: 'GET', path: '/api/v2/owner/analytics/rankings/lead-sources' },
  { method: 'GET', path: '/api/v2/owner/analytics/rankings/lead-lost-reasons' },
  { method: 'GET', path: '/api/v2/owner/analytics/rankings/blog-posts' },
  { method: 'GET', path: '/api/v2/owner/analytics/rankings/website-pages' },
] as const
