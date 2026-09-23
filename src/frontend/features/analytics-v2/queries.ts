import { useQuery } from '@tanstack/react-query'
import type {
  AnalyticsOverviewResponse,
  AnalyticsRanking,
  AnalyticsRankingResponse,
  AnalyticsSection,
  AnalyticsSectionResponse,
} from '#/backend2/contracts/analytics.contract'
import { ApiRequestError } from '#/frontend/api/response'
import type { AnalyticsPeriodPreset } from './analytics-search'
import { type RankingQuery, type SectionQuery, readOverview, readRanking, readSection } from './api'

/**
 * What Analytics reads. Nothing here writes, so nothing is invalidated: each
 * figure is re-read when its screen opens again or the owner asks.
 *
 * `placeholderData` keeps the previous answer on screen while a new period
 * loads, so changing 30 days to 90 dims the cards instead of blanking them.
 */
export const analyticsKeys = {
  all: ['backend2', 'analytics'] as const,
  overview: (period: AnalyticsPeriodPreset) => [...analyticsKeys.all, 'overview', period] as const,
  section: (section: AnalyticsSection, query: SectionQuery) =>
    [...analyticsKeys.all, 'section', section, query] as const,
  ranking: (ranking: AnalyticsRanking, query: RankingQuery) =>
    [...analyticsKeys.all, 'ranking', ranking, query] as const,
}

/** Anything the server answered on purpose (signed out, not found) is taken at its word. */
const retry = (attempt: number, error: unknown) =>
  !(error instanceof ApiRequestError && error.status < 500) && attempt < 2

/** Figures are cheap to re-read but not free; a minute is fresh enough for a glance. */
const STALE = 60_000

export const useOverview = (period: AnalyticsPeriodPreset) =>
  useQuery<AnalyticsOverviewResponse>({
    queryKey: analyticsKeys.overview(period),
    queryFn: () => readOverview(period),
    staleTime: STALE,
    retry,
  })

export const useSection = (section: AnalyticsSection, query: SectionQuery) =>
  useQuery<AnalyticsSectionResponse>({
    queryKey: analyticsKeys.section(section, query),
    queryFn: () => readSection(section, query),
    placeholderData: (previous) => (previous?.section === section ? previous : undefined),
    staleTime: STALE,
    retry,
  })

export const useRanking = (ranking: AnalyticsRanking, query: RankingQuery, options: { enabled?: boolean } = {}) =>
  useQuery<AnalyticsRankingResponse>({
    queryKey: analyticsKeys.ranking(ranking, query),
    queryFn: () => readRanking(ranking, query),
    placeholderData: (previous) => (previous?.key === ranking ? previous : undefined),
    staleTime: STALE,
    enabled: options.enabled ?? true,
    retry,
  })
