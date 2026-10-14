import {
  type AnalyticsPeriod,
  HEATMAP_SLOTS,
  HEATMAP_WEEKDAYS,
  type SeriesPoint,
} from '../../../contracts/analytics.contract'
import { bucketOf, emptyBuckets } from '../analytics.period'
import {
  CLOUDFLARE_WORDING,
  type WebsiteAnalyticsSource,
  type WebsiteHeatmap,
  type WebsitePage,
  type WebsiteSnapshot,
} from './website'

/**
 * Cloudflare Web Analytics, read through Cloudflare's GraphQL Analytics API.
 *
 * The owner approved Cloudflare Web Analytics on 24 Sep 2026: a cookieless
 * beacon on public pages only (`src/frontend/features/web-analytics`). This
 * adapter reads what the beacon recorded, for the owner's Dashboard. It never
 * captures anything itself.
 *
 * The query shape — every GraphQL name Cloudflare must recognise — lives in
 * the four `*_QUERY` strings below and nowhere else, and the parsing of the
 * answer in `parseRows`, so a change on Cloudflare's side is a change here.
 * Names used, as Cloudflare documents the dataset:
 *
 * - `viewer.accounts(filter: { accountTag })` — the account (`CF_ACCOUNT_ID`).
 * - `rumPageloadEventsAdaptiveGroups(filter, limit, orderBy)` — Web Analytics
 *   page loads, filtered by `siteTag` (the site's own 32-hex tag, *not* the
 *   beacon token) and `datetime_geq` / `datetime_lt`.
 * - `count` — page views; `sum { visits }` — visits (a page view that began
 *   on another site or was typed directly).
 * - `dimensions { datetimeHour | date | requestPath }`.
 *
 * Cloudflare samples page loads and extrapolates, so the figures are close
 * estimates; the Dashboard says so in the figure's definition.
 *
 * Never logged: the API token, the account or the site tag. A failure throws
 * with a short `code` only, and the caller turns it into `error` — never 0.
 */

export const CLOUDFLARE_GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql'
const TIMEOUT_MS = 8_000
/** Cloudflare's analytics API is rate limited; the Dashboard can wait ten minutes. */
const CACHE_MS = 10 * 60_000
const CACHE_ENTRIES = 50
/** Hourly rows up to this many days (92 × 24 = 2,208 rows, under `HOURLY_LIMIT`). */
const HOURLY_MAX_DAYS = 92
const HOURLY_LIMIT = 5_000
const DAILY_LIMIT = 1_000
/** The most pages the ranking reads; Cloudflare's groups cannot be offset. */
const PAGE_LIMIT = 1_000
/**
 * Cloudflare answers one query for at most 93 days (`maxDuration`) and keeps
 * page loads for 184 days (`notOlderThan`), as its `settings` report for this
 * account. A longer period is asked in windows of at most 90 days, and
 * anything older than 183 days is left out — and said so — instead of failing.
 */
const WINDOW_DAYS = 90
const RETENTION_DAYS = 183
const DAY_MS = 86_400_000

type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export type CloudflareConfig = {
  apiToken: string
  accountId: string
  siteTag: string
  fetch?: FetchLike
  now?: () => Date
}

/* ------------------------------------------------------------------ queries */

const RANGE_VARIABLES = '$accountTag: string!, $siteTag: string!, $start: Time!, $end: Time!'
const RANGE_FILTER = '{ siteTag: $siteTag, datetime_geq: $start, datetime_lt: $end }'

export const TOTALS_QUERY = `query OwnerDashboardTotals(${RANGE_VARIABLES}) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rows: rumPageloadEventsAdaptiveGroups(limit: 1, filter: ${RANGE_FILTER}) {
        count
        sum { visits }
      }
    }
  }
}`

export const HOURLY_QUERY = `query OwnerDashboardHourly(${RANGE_VARIABLES}) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rows: rumPageloadEventsAdaptiveGroups(limit: ${HOURLY_LIMIT}, orderBy: [datetimeHour_ASC], filter: ${RANGE_FILTER}) {
        count
        sum { visits }
        dimensions { datetimeHour }
      }
    }
  }
}`

export const DAILY_QUERY = `query OwnerDashboardDaily(${RANGE_VARIABLES}) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rows: rumPageloadEventsAdaptiveGroups(limit: ${DAILY_LIMIT}, orderBy: [date_ASC], filter: ${RANGE_FILTER}) {
        count
        sum { visits }
        dimensions { date }
      }
    }
  }
}`

export const PAGES_QUERY = `query OwnerDashboardPages(${RANGE_VARIABLES}) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      rows: rumPageloadEventsAdaptiveGroups(limit: ${PAGE_LIMIT}, orderBy: [count_DESC], filter: ${RANGE_FILTER}) {
        count
        dimensions { requestPath }
      }
    }
  }
}`

/* ------------------------------------------------------------------ parsing */

const fail = (code: string): never => {
  throw Object.assign(new Error('Cloudflare Web Analytics answered unexpectedly'), { code })
}

const count = (value: unknown): number => {
  const number = Number(value ?? 0)

  if (!Number.isFinite(number) || number < 0) fail('CF_NOT_A_NUMBER')

  return number
}

export type CloudflareRow = { pageviews: number; visits: number; dimensions: Record<string, unknown> }

/**
 * The rows under `data.viewer.accounts[0][alias]`. An empty `accounts` list
 * means the token cannot see that account: an error, not "no visitors".
 */
export const parseRows = (body: unknown, alias: string): CloudflareRow[] => {
  const root = body as {
    data?: { viewer?: { accounts?: Array<Record<string, unknown>> } } | null
    errors?: unknown
  } | null

  if (!root || typeof root !== 'object') return fail('CF_NO_BODY')
  if (Array.isArray(root.errors) && root.errors.length > 0) return fail('CF_GRAPHQL_ERROR')

  const account = root.data?.viewer?.accounts?.[0]

  if (!account) return fail('CF_NO_ACCOUNT')

  const rows = account[alias]

  if (!Array.isArray(rows)) return fail('CF_NO_ROWS')

  return rows.map((row) => {
    const entry = row as { count?: unknown; sum?: { visits?: unknown } | null; dimensions?: Record<string, unknown> | null }

    return {
      pageviews: count(entry.count),
      visits: count(entry.sum?.visits),
      dimensions: entry.dimensions ?? {},
    }
  })
}

const sumRows = (rows: CloudflareRow[]) =>
  rows.reduce((total, row) => ({ visits: total.visits + row.visits, pageviews: total.pageviews + row.pageviews }), {
    visits: 0,
    pageviews: 0,
  })

/* ------------------------------------------------------------- Berlin time */

const berlin = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
})

/** An instant as its Berlin date, weekday (Monday = 0) and hour. */
export const berlinHour = (instant: string): { date: string; weekday: number; hour: number } | null => {
  const moment = new Date(instant)

  if (Number.isNaN(moment.getTime())) return null

  const parts = berlin.formatToParts(moment)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const weekday = (HEATMAP_WEEKDAYS as readonly string[]).indexOf(part('weekday'))

  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    weekday,
    hour: Number(part('hour')),
  }
}

const slotOf = (hour: number): number => HEATMAP_SLOTS.findIndex((slot) => hour >= slot.from && hour < slot.to)

/** Hourly rows as a Berlin weekday × slot grid of visits. */
export const heatmapFromHours = (rows: CloudflareRow[]): { cells: number[][]; total: number } => {
  const cells = HEATMAP_WEEKDAYS.map(() => HEATMAP_SLOTS.map(() => 0))
  let total = 0

  for (const row of rows) {
    const at = berlinHour(String(row.dimensions.datetimeHour ?? ''))

    if (!at || at.weekday < 0) fail('CF_BAD_HOUR')

    const slot = slotOf(at!.hour)

    cells[at!.weekday]![slot]! += row.visits
    total += row.visits
  }

  return { cells, total }
}

/**
 * Rows as the period's buckets. Hourly rows are placed on their Berlin day;
 * daily rows (long periods only) carry Cloudflare's own UTC date, which the
 * figure's notes say.
 */
export const seriesFromRows = (
  period: AnalyticsPeriod,
  rows: CloudflareRow[],
  dimension: 'datetimeHour' | 'date',
): { visits: SeriesPoint[]; pageviews: SeriesPoint[] } => {
  const found = new Map<string, { visits: number; pageviews: number }>()

  for (const row of rows) {
    const raw = String(row.dimensions[dimension] ?? '')
    const date = dimension === 'date' ? raw.slice(0, 10) : berlinHour(raw)?.date

    if (!date || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) fail('CF_BAD_DATE')
    if (date! < period.from || date! > period.to) continue

    const key = bucketOf(date!, period.bucket, period.from)
    const entry = found.get(key) ?? { visits: 0, pageviews: 0 }

    entry.visits += row.visits
    entry.pageviews += row.pageviews
    found.set(key, entry)
  }

  const buckets = emptyBuckets(period)

  return {
    visits: buckets.map((date) => ({ date, value: found.get(date)?.visits ?? 0 })),
    pageviews: buckets.map((date) => ({ date, value: found.get(date)?.pageviews ?? 0 })),
  }
}

/* ------------------------------------------------------------------ windows */

export type CloudflareWindow = { start: string; end: string }

/** The oldest instant Cloudflare still answers for: a UTC midnight, so it is stable all day. */
export const retentionFloor = (now: Date): string => {
  const earliest = now.getTime() - RETENTION_DAYS * DAY_MS

  return new Date(Math.ceil(earliest / DAY_MS) * DAY_MS).toISOString()
}

/** `[start, end)` from the floor on, in windows Cloudflare accepts. Empty when all of it is too old. */
export const windowsFor = (start: string, end: string, floor: string): CloudflareWindow[] => {
  const windows: CloudflareWindow[] = []
  const last = new Date(end).getTime()
  let from = Math.max(new Date(start).getTime(), new Date(floor).getTime())

  while (from < last) {
    const to = Math.min(from + WINDOW_DAYS * DAY_MS, last)

    windows.push({ start: new Date(from).toISOString(), end: new Date(to).toISOString() })
    from = to
  }

  return windows
}

const longDate = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Berlin',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/* ------------------------------------------------------------------ adapter */

export const createCloudflareWebsiteSource = (config: CloudflareConfig): WebsiteAnalyticsSource => {
  const doFetch: FetchLike = config.fetch ?? ((input, init) => fetch(input, init))
  const now = config.now ?? (() => new Date())
  const cache = new Map<string, { at: number; fetchedAt: string; body: unknown }>()

  const ask = async (
    query: string,
    variables: Record<string, string>,
  ): Promise<{ body: unknown; fetchedAt: string }> => {
    const key = JSON.stringify([query, variables])
    const cached = cache.get(key)
    const moment = now().getTime()

    if (cached && moment - cached.at < CACHE_MS) return { body: cached.body, fetchedAt: cached.fetchedAt }

    const response = await doFetch(CLOUDFLARE_GRAPHQL_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.apiToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { accountTag: config.accountId, siteTag: config.siteTag, ...variables },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    // The status only. A provider body can quote the request back.
    if (!response.ok) fail(`HTTP_${response.status}`)

    const body = (await response.json().catch(() => null)) as unknown
    const fetchedAt = new Date(moment).toISOString()

    // Parsed once here so a bad answer is never cached.
    parseRows(body, 'rows')

    if (cache.size >= CACHE_ENTRIES) cache.delete(cache.keys().next().value as string)
    cache.set(key, { at: moment, fetchedAt, body })

    return { body, fetchedAt }
  }

  const floor = () => retentionFloor(now())
  const older = (a: string, b: string) => (a < b ? a : b)

  /** Every window's rows, one request each, in order. */
  const rowsOver = async (query: string, windows: CloudflareWindow[]) => {
    const answers = await Promise.all(windows.map((window) => ask(query, window)))

    return {
      rows: answers.flatMap((answer) => parseRows(answer.body, 'rows')),
      fetchedAt: answers.reduce((oldest, answer) => older(oldest, answer.fetchedAt), now().toISOString()),
    }
  }

  /** Hourly rows for periods up to 92 days (and always for the weekday grid), daily ones beyond. */
  const timeRows = async (period: AnalyticsPeriod, hourly = period.days <= HOURLY_MAX_DAYS) => {
    const answer = await rowsOver(hourly ? HOURLY_QUERY : DAILY_QUERY, windowsFor(period.start, period.end, floor()))

    return { ...answer, dimension: hourly ? ('datetimeHour' as const) : ('date' as const) }
  }

  /** Said on the figures when part of the period is older than Cloudflare keeps. */
  const coverageNote = (period: AnalyticsPeriod): string | undefined => {
    const since = floor()

    if (period.start >= since) return undefined

    return `Cloudflare keeps visits for about six months, so this figure counts only from ${longDate.format(new Date(since))} on. Older visits are no longer available.`
  }

  return {
    id: 'cloudflare',
    source: 'cloudflare',
    provider: 'Cloudflare Web Analytics',
    wording: CLOUDFLARE_WORDING,
    connected: true,

    readSummary: async (period): Promise<WebsiteSnapshot> => {
      const since = floor()
      const totals = await rowsOver(TOTALS_QUERY, windowsFor(period.start, period.end, since))
      const current = sumRows(totals.rows)
      // A comparison against a period Cloudflare no longer fully keeps would be wrong, so none is made.
      const comparable = period.previous.start >= since
      const previous = comparable
        ? await rowsOver(TOTALS_QUERY, windowsFor(period.previous.start, period.start, since))
        : null
      const previousSum = previous ? sumRows(previous.rows) : null
      const time = await timeRows(period)
      const series = seriesFromRows(period, time.rows, time.dimension)
      const note = coverageNote(period)

      return {
        visitors: current.visits,
        pageviews: current.pageviews,
        previousVisitors: previousSum?.visits ?? null,
        previousPageviews: previousSum?.pageviews ?? null,
        visitorsSeries: series.visits,
        pageviewsSeries: series.pageviews,
        fetchedAt: [totals.fetchedAt, time.fetchedAt, previous?.fetchedAt ?? totals.fetchedAt].reduce(older),
        exploreUrl: `https://dash.cloudflare.com/${encodeURIComponent(config.accountId)}/web-analytics`,
        ...(note ? { notes: [note] } : {}),
      }
    },

    readTopPages: async (period, page) => {
      const answer = await rowsOver(PAGES_QUERY, windowsFor(period.start, period.end, floor()))
      const byPath = new Map<string, number>()

      for (const row of answer.rows) {
        const path = row.dimensions.requestPath

        if (typeof path !== 'string') return fail('CF_BAD_PATH')

        byPath.set(path, (byPath.get(path) ?? 0) + row.pageviews)
      }

      // Most viewed first; equal counts by path, so pages never swap places between requests.
      const ranked = [...byPath].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      const start = (page.page - 1) * page.pageSize
      const items: WebsitePage[] = ranked
        .slice(start, start + page.pageSize)
        .map(([path, pageviews]) => ({ path, pageviews }))

      return { items, total: ranked.length, fetchedAt: answer.fetchedAt }
    },

    readHeatmap: async (period): Promise<WebsiteHeatmap> => {
      // Always hourly: weekday and hour cannot come from daily rows.
      const time = await timeRows(period, true)

      return { ...heatmapFromHours(time.rows), fetchedAt: time.fetchedAt }
    },
  }
}

/**
 * The three private settings, or `null` when any is missing. A value that
 * cannot be right — an account or site tag that is not 32 hex characters, a
 * token with spaces — is `malformed`, so a typo never looks connected.
 */
export const resolveCloudflareConfig = (
  environment: Record<string, string | undefined>,
): Omit<CloudflareConfig, 'fetch' | 'now'> | null | 'malformed' => {
  const apiToken = environment.CF_ANALYTICS_API_TOKEN?.trim()
  const accountId = environment.CF_ACCOUNT_ID?.trim()
  const siteTag = environment.CF_WEB_ANALYTICS_SITE_TAG?.trim()

  if (!apiToken || !accountId || !siteTag) return null
  if (!/^[a-f0-9]{32}$/iu.test(accountId) || !/^[a-f0-9]{32}$/iu.test(siteTag) || /\s/u.test(apiToken)) {
    return 'malformed'
  }

  return { apiToken, accountId, siteTag }
}
