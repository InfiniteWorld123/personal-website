import type {
  AnalyticsOverviewResponse,
  AnalyticsRanking,
  AnalyticsRankingResponse,
  AnalyticsSection,
  AnalyticsSectionResponse,
  BlogRankingMeasure,
  LeadOrigin,
} from '#/backend2/contracts/analytics.contract'
import { ApiRequestError } from '#/frontend/api/response'
import type { AnalyticsPeriodPreset } from './analytics-search'

/**
 * The Dashboard's side of Backend2 Analytics (`docs/v2/analytics.md`).
 *
 * Read-only: three GET routes. Plain `fetch`, like the other V2 clients; a
 * refusal arrives as one `ApiRequestError` with its status, so the screen can
 * tell a signed-out owner from a server that did not answer.
 */

const ANALYTICS = '/api/v2/owner/analytics'

type Envelope = { success: boolean; message?: string; code?: string; data?: unknown; details?: unknown }

const request = async <TData>(path: string): Promise<TData> => {
  const response = await fetch(path, { credentials: 'same-origin' })
  const body = (await response.json().catch(() => null)) as Envelope | null

  if (!response.ok || !body?.success) {
    throw new ApiRequestError({
      message: body?.message ?? 'The server did not answer',
      code: body?.code ?? null,
      status: response.status,
      details: body?.details,
    })
  }

  return body.data as TData
}

const query = (values: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams()

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === '') continue

    search.set(key, String(value))
  }

  const text = search.toString()

  return text === '' ? '' : `?${text}`
}

export const readOverview = (period: AnalyticsPeriodPreset) =>
  request<AnalyticsOverviewResponse>(`${ANALYTICS}/overview${query({ period })}`)

export type SectionQuery = { period: AnalyticsPeriodPreset; origin?: LeadOrigin }

export const readSection = (section: AnalyticsSection, input: SectionQuery) =>
  request<AnalyticsSectionResponse>(
    `${ANALYTICS}/sections/${section}${query({
      period: input.period,
      // Only Sales takes a filter; any other section refuses one by name.
      origin: section === 'sales' && input.origin && input.origin !== 'all' ? input.origin : undefined,
    })}`,
  )

export type RankingQuery = {
  period: AnalyticsPeriodPreset
  page: number
  pageSize: number
  origin?: LeadOrigin
  by?: BlogRankingMeasure
}

export const readRanking = (ranking: AnalyticsRanking, input: RankingQuery) =>
  request<AnalyticsRankingResponse>(
    `${ANALYTICS}/rankings/${ranking}${query({
      period: input.period,
      page: input.page > 1 ? input.page : undefined,
      pageSize: input.pageSize,
      origin:
        (ranking === 'lead-sources' || ranking === 'lead-lost-reasons') && input.origin && input.origin !== 'all'
          ? input.origin
          : undefined,
      by: ranking === 'blog-posts' ? input.by : undefined,
    })}`,
  )
