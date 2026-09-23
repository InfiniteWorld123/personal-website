import type { AnalyticsPeriod, CurrencyAmount } from '../../../contracts/analytics.contract'
import { assistantAnalyticsSource } from '../../assistant/assistant.analytics-source'

/**
 * Public AI assistant figures, from its own module (connected 23 Sep 2026).
 *
 * `docs/v2/analytics.md`: conversation volume, unanswered questions only if
 * the module records a trustworthy outcome, contact/booking referral clicks,
 * and actual provider usage/cost. No chat text or transcript ever reaches
 * Analytics. There is no assistant inside the Dashboard; these are
 * statistics about the public one.
 */

export type AssistantSnapshot = {
  /** Visitor conversations started in the period. */
  conversations: number
  previousConversations: number
  /** `null` when the module does not record a trustworthy "unanswered" outcome. */
  unanswered: number | null
  /** Clicks from an assistant answer to the contact or booking page, or `null` if not recorded. */
  referralClicks: number | null
  /** Provider cost actually recorded in the period, per currency; `null` if not recorded. */
  cost: CurrencyAmount[] | null
}

export type AssistantAnalyticsSource = {
  /** Shown to the owner as the figure's source, e.g. `backend2.assistant`. */
  readonly source: string
  /** Throws on failure; Analytics turns that into `error` for these figures only. */
  read: (period: AnalyticsPeriod, now: Date) => Promise<AssistantSnapshot>
}

/*
 * ============================================================ PLUG-IN POINT
 *
 * When the public assistant exists, it exports its implementation from
 * `src/backend2/modules/assistant/assistant.analytics.ts`. Connect it here,
 * and nowhere else:
 *
 *   import { assistantAnalyticsSource } from '../../assistant/assistant.analytics'
 *   export const assistantSource: AssistantAnalyticsSource | null = assistantAnalyticsSource
 *
 * Until then `null` means "not built": every assistant figure answers
 * `not-built`, never a zero.
 * ==========================================================================
 */
export const assistantSource: AssistantAnalyticsSource | null = assistantAnalyticsSource
