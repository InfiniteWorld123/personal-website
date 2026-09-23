import type { AnalyticsPeriod } from '../../contracts/analytics.contract'
import type { AssistantAnalyticsSource, AssistantSnapshot } from '../analytics/sources/assistant'
import { readAssistantTotals } from './assistant.analytics'

/**
 * The assistant's figures in the shape Analytics asks for.
 *
 * The assistant keeps anonymous per-day counters (UTC days) and Analytics
 * speaks in Berlin dates; the dates are passed through as they are, so a day
 * boundary can be an hour or two off. Counters are never text, so nothing a
 * visitor wrote can reach Analytics through here.
 */

const DAY_MS = 86_400_000
const CHUNK_DAYS = 366

/** `readAssistantTotals` reads at most a year; a longer custom period is read in parts. */
const totalsOver = async (from: string, to: string) => {
  const parts: Array<{ from: string; to: string }> = []
  let start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)

  while (start <= end) {
    const partEnd = Math.min(end, start + (CHUNK_DAYS - 1) * DAY_MS)
    parts.push({ from: new Date(start).toISOString().slice(0, 10), to: new Date(partEnd).toISOString().slice(0, 10) })
    start = partEnd + DAY_MS
  }

  const totals = await Promise.all(parts.map(readAssistantTotals))

  return {
    conversations: totals.reduce((sum, part) => sum + part.conversations, 0),
    fallbacks: totals.reduce((sum, part) => sum + part.fallbacks, 0),
    contactOffers: totals.reduce((sum, part) => sum + part.contactOffers, 0),
    costCents: totals.reduce((sum, part) => sum + part.costCents, 0),
  }
}

export const assistantAnalyticsSource: AssistantAnalyticsSource = {
  source: 'backend2.assistant',
  read: async (period: AnalyticsPeriod): Promise<AssistantSnapshot> => {
    const [current, previous] = await Promise.all([
      totalsOver(period.from, period.to),
      totalsOver(period.previous.from, period.previous.to),
    ])

    return {
      conversations: current.conversations,
      previousConversations: previous.conversations,
      // The assistant records the honest "not on the website" fallback per reply.
      unanswered: current.fallbacks,
      // It records when a reply offered Contact/Booking, not whether the visitor clicked.
      referralClicks: null,
      cost: [{ currency: 'EUR', minor: current.costCents }],
    }
  },
}
