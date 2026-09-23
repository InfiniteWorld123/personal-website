import { AsyncLocalStorage } from 'node:async_hooks'
import { type AssistantAnalyticsSource, assistantSource } from './sources/assistant'
import { type MoneyAnalyticsSource, moneySource } from './sources/money'
import { type WebsiteAnalyticsSource, resolveWebsiteSource } from './sources/website'

/**
 * The outside sources Analytics reads, and the clock it reads them at.
 *
 * Production takes the defaults: PostHog only if configured, Money and the
 * assistant from their plug-in points (`sources/money.ts`,
 * `sources/assistant.ts`), and the real time. A test substitutes any of them
 * for one call with `withAnalyticsSources`, the same way `runWithDb` hands the
 * application a database — nothing global is mutated.
 */

export type AnalyticsSources = {
  website: WebsiteAnalyticsSource
  money: MoneyAnalyticsSource | null
  assistant: AssistantAnalyticsSource | null
  now: () => Date
}

const override = new AsyncLocalStorage<Partial<AnalyticsSources>>()

let defaultWebsite: WebsiteAnalyticsSource | undefined

export const currentSources = (): AnalyticsSources => {
  const chosen = override.getStore() ?? {}

  return {
    website: chosen.website ?? (defaultWebsite ??= resolveWebsiteSource()),
    money: 'money' in chosen ? (chosen.money ?? null) : moneySource,
    assistant: 'assistant' in chosen ? (chosen.assistant ?? null) : assistantSource,
    now: chosen.now ?? (() => new Date()),
  }
}

export const withAnalyticsSources = <T>(
  sources: Partial<AnalyticsSources>,
  fn: () => Promise<T>,
): Promise<T> => override.run(sources, fn)
