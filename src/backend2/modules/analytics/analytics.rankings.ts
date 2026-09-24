import {
  ANALYTICS_TIME_ZONE,
  type AnalyticsPeriod,
  type AnalyticsRanking,
  type AnalyticsRankingResponse,
  type BlogRankingMeasure,
  LEAD_ORIGIN_NOTE,
  type LeadOrigin,
  type MetricScope,
  type MetricUnit,
  type RankingItem,
} from '../../contracts/analytics.contract'
import type { PageQuery } from '../../contracts/pagination.contract'
import { BLOG_NOTES, SOURCES } from './analytics.definitions'
import { UNAVAILABLE_MESSAGES } from './analytics.metric'
import * as repo from './analytics.repo'
import { currentSources } from './analytics.sources'

/**
 * Bounded, detailed rankings behind the section breakdowns — every lead
 * source, every lost reason, every article, every public page — one page at a
 * time, in a fixed order: the value, highest first; then the label; then the
 * id, so two equal rows never swap places between pages.
 *
 * Like every figure, a ranking whose source fails answers `error` with no
 * items rather than failing the request, and PostHog's answers
 * `not-connected` while it is switched off.
 */

type RankingDef = {
  label: string
  description: string
  unit: MetricUnit
  scope: MetricScope
  source: string
  notes?: string[]
}

const blogDescriptions: Record<BlogRankingMeasure, { label: string; description: string; scope: MetricScope }> = {
  reads: {
    label: 'Articles by reads (all time)',
    description: 'Every article ever published, by its running total of reads. A read is not a person.',
    scope: 'all-time',
  },
  likes: {
    label: 'Articles by likes (all time)',
    description: 'Every article ever published, by its running total of likes.',
    scope: 'all-time',
  },
  comments: {
    label: 'Articles by comments',
    description: 'Every article ever published, by visitor comments written in the period.',
    scope: 'period',
  },
}

const definitionOf = (
  ranking: AnalyticsRanking,
  filters: { origin: LeadOrigin; by: BlogRankingMeasure },
): RankingDef => {
  const originNotes = filters.origin === 'all' ? [] : [LEAD_ORIGIN_NOTE]

  switch (ranking) {
    case 'lead-sources':
      return {
        label: 'Where new leads came from',
        description: 'New leads in the period by the source you chose for them. Your own label, not website traffic.',
        unit: 'count',
        scope: 'period',
        source: SOURCES.leads,
        notes: ['Leads in Trash are not counted.', ...originNotes],
      }
    case 'lead-lost-reasons':
      return {
        label: 'Why leads were lost',
        description: 'Leads Lost in the period, and still Lost, by the reason you chose.',
        unit: 'count',
        scope: 'period',
        source: SOURCES.leads,
        notes: ['Leads in Trash are not counted.', ...originNotes],
      }
    case 'blog-posts':
      return {
        ...blogDescriptions[filters.by],
        unit: 'count',
        source: SOURCES.blog,
        notes: filters.by === 'comments' ? [] : BLOG_NOTES,
      }
    case 'website-pages':
      return {
        label: 'Most viewed pages',
        description: currentSources().website.wording.topPages.description,
        unit: 'count',
        scope: 'period',
        source: currentSources().website.source,
        notes: ['Only public pages count. The Dashboard, admin pages and the API are never included.'],
      }
  }
}

type Loaded = { items: Array<{ key: string; label: string; value: number }>; total: number; asOf?: string }

const load = async (
  ranking: AnalyticsRanking,
  period: AnalyticsPeriod,
  page: PageQuery,
  filters: { origin: LeadOrigin; by: BlogRankingMeasure },
): Promise<Loaded | 'not-connected'> => {
  const window = repo.windowOf(period)
  const bounds = { limit: page.pageSize, offset: (page.page - 1) * page.pageSize }
  const fromRows = (result: { rows: Array<{ id: string; name: string; value: number }>; total: number }) => ({
    items: result.rows.map((row) => ({ key: row.id, label: row.name, value: row.value })),
    total: result.total,
  })

  switch (ranking) {
    case 'lead-sources':
      return fromRows(await repo.leadSources(window, filters.origin, bounds))
    case 'lead-lost-reasons':
      return fromRows(await repo.leadLostReasons(window, filters.origin, bounds))
    case 'blog-posts':
      return fromRows(await repo.blogPostRanking(window, filters.by, bounds))
    case 'website-pages': {
      const website = currentSources().website

      if (!website.connected) return 'not-connected'

      const result = await website.readTopPages(period, page)

      return {
        items: result.items.map((item) => ({ key: item.path, label: item.path, value: item.pageviews })),
        total: result.total,
        asOf: result.fetchedAt,
      }
    }
  }
}

export const getRanking = async (input: {
  ranking: AnalyticsRanking
  period: AnalyticsPeriod
  now: Date
  page: PageQuery
  filters: { origin: LeadOrigin; by: BlogRankingMeasure }
}): Promise<AnalyticsRankingResponse> => {
  const definition = definitionOf(input.ranking, input.filters)
  const filters: Record<string, string> =
    input.ranking === 'blog-posts'
      ? { by: input.filters.by }
      : input.ranking === 'website-pages'
        ? {}
        : { origin: input.filters.origin }
  const common = {
    key: input.ranking,
    label: definition.label,
    description: definition.description,
    unit: definition.unit,
    scope: definition.scope,
    source: definition.source,
    timezone: ANALYTICS_TIME_ZONE,
    period: input.period,
    filters,
    page: input.page.page,
    pageSize: input.page.pageSize,
    ...(definition.notes && definition.notes.length > 0 ? { notes: definition.notes } : {}),
  }
  const unavailable = (state: 'error' | 'not-connected', message: string): AnalyticsRankingResponse => ({
    ...common,
    asOf: input.now.toISOString(),
    state,
    message,
    items: [],
    total: 0,
    pageCount: 1,
    hasMore: false,
  })

  let loaded: Loaded | 'not-connected'

  try {
    loaded = await load(input.ranking, input.period, input.page, input.filters)
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
        ? (error as { code: string }).code
        : undefined

    console.error('Backend2 analytics source failed', { source: definition.source, code })

    return unavailable('error', UNAVAILABLE_MESSAGES.error)
  }

  if (loaded === 'not-connected') return unavailable('not-connected', UNAVAILABLE_MESSAGES.notConnected)

  const offset = (input.page.page - 1) * input.page.pageSize
  const items: RankingItem[] = loaded.items.map((item, index) => ({ rank: offset + index + 1, ...item }))
  const pageCount = Math.max(1, Math.ceil(loaded.total / input.page.pageSize))

  return {
    ...common,
    asOf: loaded.asOf ?? input.now.toISOString(),
    state: loaded.total === 0 ? 'empty' : 'ready',
    ...(loaded.total === 0 ? { message: 'Nothing to rank in this period.' } : {}),
    items,
    total: loaded.total,
    pageCount,
    hasMore: input.page.page < pageCount,
  }
}
