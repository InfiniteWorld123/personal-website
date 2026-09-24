import type { AnalyticsPeriod, SeriesPoint } from '../../../contracts/analytics.contract'
import { emptyBuckets } from '../analytics.period'
import { createCloudflareWebsiteSource, resolveCloudflareConfig } from './cloudflare'

/**
 * Public-website visitor statistics, behind a replaceable adapter.
 *
 * `docs/v2/analytics.md`: a disabled or failing provider must never become a
 * zero, and nothing here captures anything — the adapters only *read* what a
 * separately approved public capture records. So:
 *
 * - `disabledWebsiteSource` is the default and answers `not-connected`.
 * - `createCloudflareWebsiteSource` (`./cloudflare.ts`) reads Cloudflare Web
 *   Analytics — the cookieless provider the owner approved on 24 Sep 2026 —
 *   through Cloudflare's GraphQL Analytics API. Chosen when
 *   `CF_ANALYTICS_API_TOKEN`, `CF_ACCOUNT_ID` and `CF_WEB_ANALYTICS_SITE_TAG`
 *   are all set.
 * - `createPostHogWebsiteSource` reads PostHog's query API with a private,
 *   server-only personal API key. It is kept as the earlier, dormant choice:
 *   used only when Cloudflare is not configured and `POSTHOG_PERSONAL_API_KEY`
 *   and `POSTHOG_PROJECT_ID` are both set. It **has never run against a real
 *   PostHog account** — its request shape is tested with a fake `fetch`.
 */

export type WebsitePage = { path: string; pageviews: number }

export type WebsiteSnapshot = {
  /** Distinct people PostHog counted on public pages. Not pageviews. */
  visitors: number
  pageviews: number
  previousVisitors: number
  previousPageviews: number
  visitorsSeries: SeriesPoint[]
  pageviewsSeries: SeriesPoint[]
  /** When the provider was actually asked; older than now when cached. */
  fetchedAt: string
  /** Where the owner explores further, in the provider's own app. */
  exploreUrl: string
}

/** Visits by Berlin weekday (Monday first) × `HEATMAP_SLOTS`. */
export type WebsiteHeatmap = { cells: number[][]; total: number; fetchedAt: string }

/** How a provider names and defines its own figures; the defaults are Cloudflare's. */
export type WebsiteWording = {
  visitors: { label: string; description: string }
  pageviews: { label: string; description: string }
  topPages: { description: string }
}

export const CLOUDFLARE_WORDING: WebsiteWording = {
  visitors: {
    label: 'Website visits',
    description:
      'Visits Cloudflare Web Analytics counted on public pages in the period. A visit begins when someone arrives from another site or types the address. It is cookieless, so one person on two days counts twice, and Cloudflare samples page loads: treat the figure as a close estimate. Not the same as pageviews.',
  },
  pageviews: {
    label: 'Pageviews',
    description: 'Public pages opened in the period, counted by Cloudflare Web Analytics. One visit can open many pages.',
  },
  topPages: { description: 'Public pages by pageviews in the period, counted by Cloudflare Web Analytics.' },
}

export const POSTHOG_WORDING: WebsiteWording = {
  visitors: {
    label: 'Website visitors',
    description:
      'Distinct people PostHog counted on public pages in the period. Approximate: one person on two devices can count twice. Not the same as pageviews.',
  },
  pageviews: {
    label: 'Pageviews',
    description: 'Public pages opened in the period, counted by PostHog. One visitor can open many pages.',
  },
  topPages: { description: 'Public pages by pageviews in the period, counted by PostHog.' },
}

export type WebsiteAnalyticsSource = {
  readonly id: 'disabled' | 'posthog' | 'cloudflare'
  /** The figures' `source`, e.g. `cloudflare`. */
  readonly source: string
  /** The provider's name as the owner reads it. */
  readonly provider: string
  readonly wording: WebsiteWording
  readonly connected: boolean
  /** Throws on any failure; the caller turns that into `error`, never 0. */
  readSummary: (period: AnalyticsPeriod) => Promise<WebsiteSnapshot>
  readTopPages: (
    period: AnalyticsPeriod,
    page: { page: number; pageSize: number },
  ) => Promise<{ items: WebsitePage[]; total: number; fetchedAt: string }>
  /** Optional: a provider without it leaves the Overview heatmap `not-built`. */
  readHeatmap?: (period: AnalyticsPeriod) => Promise<WebsiteHeatmap>
}

const notConnected = (): never => {
  throw new Error('Website analytics is not connected')
}

export const disabledWebsiteSource: WebsiteAnalyticsSource = {
  id: 'disabled',
  source: 'cloudflare',
  provider: 'Cloudflare Web Analytics',
  wording: CLOUDFLARE_WORDING,
  connected: false,
  readSummary: async () => notConnected(),
  readTopPages: async () => notConnected(),
}

/* ------------------------------------------------------------------ PostHog */

export const POSTHOG_DEFAULT_HOST = 'https://eu.posthog.com'
const POSTHOG_TIMEOUT_MS = 8_000
/** PostHog's query API is rate limited; the Dashboard can wait ten minutes. */
const POSTHOG_CACHE_MS = 10 * 60_000
const POSTHOG_CACHE_ENTRIES = 50

/**
 * Pages that must never be counted even if a future capture were misconfigured
 * to send them: the private application and the API.
 */
const PRIVATE_PATH_FILTER =
  "AND NOT (properties.$pathname LIKE '/dashboard%' OR properties.$pathname LIKE '/admin%' OR properties.$pathname LIKE '/api/%')"

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type PostHogConfig = {
  apiKey: string
  projectId: string
  host?: string
  fetch?: FetchLike
  now?: () => Date
}

/**
 * The instants cross into HogQL as literals built here from validated
 * dates — never from request text — in the one format ClickHouse reads
 * unambiguously, with the zone stated.
 */
const hogInstant = (iso: string): string => {
  const utc = new Date(iso).toISOString().slice(0, 19).replace('T', ' ')

  return `toDateTime('${utc}', 'UTC')`
}

const hogBucket = (period: AnalyticsPeriod): string => {
  const local = "toTimeZone(timestamp, 'Europe/Berlin')"
  const day = `toDate(${local})`
  const floor = `toDate('${period.from}')`

  if (period.bucket === 'week') return `greatest(toStartOfWeek(${day}, 1), ${floor})`
  if (period.bucket === 'month') return `greatest(toStartOfMonth(${day}), ${floor})`

  return day
}

const numberAt = (row: unknown, index: number): number => {
  if (!Array.isArray(row)) throw new Error('PostHog answered with an unexpected row')

  const value = Number(row[index])

  if (!Number.isFinite(value) || value < 0) throw new Error('PostHog answered with a non-number')

  return value
}

export const createPostHogWebsiteSource = (config: PostHogConfig): WebsiteAnalyticsSource => {
  const host = (config.host ?? POSTHOG_DEFAULT_HOST).replace(/\/+$/u, '')
  const doFetch: FetchLike = config.fetch ?? ((input, init) => fetch(input, init))
  const now = config.now ?? (() => new Date())
  const cache = new Map<string, { at: number; fetchedAt: string; rows: unknown[] }>()

  if (!/^https:\/\/[^/]+$/u.test(host)) throw new Error('POSTHOG_HOST must be an https origin')
  if (!/^\d+$/u.test(config.projectId)) throw new Error('POSTHOG_PROJECT_ID must be a number')

  const query = async (hogql: string): Promise<{ rows: unknown[]; fetchedAt: string }> => {
    const cached = cache.get(hogql)
    const moment = now().getTime()

    if (cached && moment - cached.at < POSTHOG_CACHE_MS) {
      return { rows: cached.rows, fetchedAt: cached.fetchedAt }
    }

    const response = await doFetch(`${host}/api/projects/${config.projectId}/query/`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query: { kind: 'HogQLQuery', query: hogql }, name: 'owner-dashboard' }),
      signal: AbortSignal.timeout(POSTHOG_TIMEOUT_MS),
    })

    // The status only. A provider body can quote the request back.
    if (!response.ok) throw Object.assign(new Error('PostHog query failed'), { code: `HTTP_${response.status}` })

    const body = (await response.json().catch(() => null)) as { results?: unknown } | null

    if (!body || !Array.isArray(body.results)) throw new Error('PostHog answered without results')

    const fetchedAt = new Date(moment).toISOString()

    if (cache.size >= POSTHOG_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string)
    cache.set(hogql, { at: moment, fetchedAt, rows: body.results })

    return { rows: body.results, fetchedAt }
  }

  const pageviews = (start: string, end: string) =>
    `event = '$pageview' AND timestamp >= ${hogInstant(start)} AND timestamp < ${hogInstant(end)} ${PRIVATE_PATH_FILTER}`

  return {
    id: 'posthog',
    source: 'posthog',
    provider: 'PostHog',
    wording: POSTHOG_WORDING,
    connected: true,

    readSummary: async (period) => {
      const totals = await query(
        `SELECT
           uniqIf(person_id, timestamp >= ${hogInstant(period.start)}),
           countIf(timestamp >= ${hogInstant(period.start)}),
           uniqIf(person_id, timestamp < ${hogInstant(period.start)}),
           countIf(timestamp < ${hogInstant(period.start)})
         FROM events
         WHERE ${pageviews(period.previous.start, period.end)}`,
      )
      const series = await query(
        `SELECT toString(${hogBucket(period)}) AS bucket, uniq(person_id), count()
           FROM events
          WHERE ${pageviews(period.start, period.end)}
          GROUP BY bucket
          ORDER BY bucket`,
      )
      const first = totals.rows[0]
      const found = new Map<string, [number, number]>()

      for (const row of series.rows) {
        if (!Array.isArray(row) || typeof row[0] !== 'string') {
          throw new Error('PostHog answered with an unexpected row')
        }

        found.set(row[0].slice(0, 10), [numberAt(row, 1), numberAt(row, 2)])
      }

      const buckets = emptyBuckets(period)

      return {
        visitors: numberAt(first, 0),
        pageviews: numberAt(first, 1),
        previousVisitors: numberAt(first, 2),
        previousPageviews: numberAt(first, 3),
        visitorsSeries: buckets.map((date) => ({ date, value: found.get(date)?.[0] ?? 0 })),
        pageviewsSeries: buckets.map((date) => ({ date, value: found.get(date)?.[1] ?? 0 })),
        // The older of the two reads is what the figures are as of.
        fetchedAt: totals.fetchedAt < series.fetchedAt ? totals.fetchedAt : series.fetchedAt,
        exploreUrl: `${host}/project/${config.projectId}/web`,
      }
    },

    readTopPages: async (period, page) => {
      const counted = await query(
        `SELECT uniq(properties.$pathname) FROM events WHERE ${pageviews(period.start, period.end)}`,
      )
      const listed = await query(
        `SELECT toString(properties.$pathname) AS path, count() AS views
           FROM events
          WHERE ${pageviews(period.start, period.end)}
          GROUP BY path
          ORDER BY views DESC, path ASC
          LIMIT ${Math.trunc(page.pageSize)} OFFSET ${Math.trunc((page.page - 1) * page.pageSize)}`,
      )

      return {
        total: numberAt(counted.rows[0], 0),
        items: listed.rows.map((row) => {
          if (!Array.isArray(row) || typeof row[0] !== 'string') {
            throw new Error('PostHog answered with an unexpected row')
          }

          return { path: row[0], pageviews: numberAt(row, 1) }
        }),
        fetchedAt: counted.fetchedAt < listed.fetchedAt ? counted.fetchedAt : listed.fetchedAt,
      }
    },
  }
}

/**
 * The adapter this environment uses: Cloudflare when its three private
 * settings exist, else PostHog when both of its do, else `disabled`.
 * Anything malformed is `disabled` too, so a typo can never make the
 * Dashboard pretend to be connected. No setting is ever logged.
 */
export const resolveWebsiteSource = (
  environment: Record<string, string | undefined> = process.env,
): WebsiteAnalyticsSource => {
  const cloudflare = resolveCloudflareConfig(environment)

  if (cloudflare === 'malformed') {
    console.error('Backend2 analytics: Cloudflare Web Analytics settings are malformed; website statistics stay off')

    return disabledWebsiteSource
  }

  if (cloudflare) return createCloudflareWebsiteSource(cloudflare)

  const apiKey = environment.POSTHOG_PERSONAL_API_KEY?.trim()
  const projectId = environment.POSTHOG_PROJECT_ID?.trim()

  if (!apiKey || !projectId) return disabledWebsiteSource

  try {
    return createPostHogWebsiteSource({
      apiKey,
      projectId,
      host: environment.POSTHOG_HOST?.trim() || undefined,
    })
  } catch {
    console.error('Backend2 analytics: PostHog settings are malformed; website statistics stay off')

    return disabledWebsiteSource
  }
}
