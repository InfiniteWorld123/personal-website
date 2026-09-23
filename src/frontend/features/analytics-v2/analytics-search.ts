/**
 * The `/dashboard/analytics` address: tab, period and the Sales origin filter.
 *
 * Kept apart from the page and from `analytics.contract.ts` on purpose. A
 * route's `validateSearch` stays in the route tree every page loads, and the
 * contract imports valibot; the values are spelled out here instead, and
 * `analytics-ui.test.tsx` checks they still equal the contract's.
 */

export const ANALYTICS_TABS = ['website', 'sales', 'operations', 'money', 'assistant'] as const
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number]

export const ANALYTICS_PERIODS = ['7d', '30d', '90d', '365d'] as const
export type AnalyticsPeriodPreset = (typeof ANALYTICS_PERIODS)[number]

export const DEFAULT_TAB: AnalyticsTab = 'website'
/** Approved in the Design Lab (24 Sep 2026). */
export const DEFAULT_PERIOD: AnalyticsPeriodPreset = '30d'

/** `all` is the default and stays out of the address. */
export const LEAD_ORIGIN_FILTERS = ['manual', 'imported'] as const
export type LeadOriginFilter = (typeof LEAD_ORIGIN_FILTERS)[number]

export type AnalyticsSearch = {
  tab?: AnalyticsTab
  period?: AnalyticsPeriodPreset
  origin?: LeadOriginFilter
}

const pick = <T extends string>(list: readonly T[], value: unknown): T | undefined =>
  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : undefined

/** Anything unknown is dropped, and the defaults are left out so the plain address is the default view. */
export const parseAnalyticsSearch = (raw: Record<string, unknown>): AnalyticsSearch => {
  const out: AnalyticsSearch = {}
  const tab = pick(ANALYTICS_TABS, raw.tab)
  const period = pick(ANALYTICS_PERIODS, raw.period)
  const origin = pick(LEAD_ORIGIN_FILTERS, raw.origin)

  if (tab && tab !== DEFAULT_TAB) out.tab = tab
  if (period && period !== DEFAULT_PERIOD) out.period = period
  if (origin) out.origin = origin

  return out
}
