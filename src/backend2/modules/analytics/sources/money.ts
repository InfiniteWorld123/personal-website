import type { AnalyticsPeriod, CurrencyAmount } from '../../../contracts/analytics.contract'
import { invoiceAnalyticsSource } from '../../invoices/invoice.analytics-source'

/**
 * Money figures, from the Invoices module (connected 24 Sep 2026; live documents only).
 *
 * `docs/v2/analytics.md`: received money is payments actually received, net
 * of recorded refunds, never forecast revenue; overdue means *issued*
 * invoices past their due date; drafts, test documents, predicted
 * subscription charges and payment attempts are never money received; EUR and
 * USD are reported separately, never added together.
 *
 * Analytics owns how these become figures. The Invoices module owns what the
 * numbers are, behind this narrow read interface, so neither has to know the
 * other's tables.
 */

export type MoneySnapshot = {
  /** Payments received in the period minus refunds recorded in the period, per currency. */
  receivedNet: CurrencyAmount[]
  previousReceivedNet: CurrencyAmount[]
  /** Refunds recorded in the period, per currency, as positive amounts. */
  refunds: CurrencyAmount[]
  /** Issued invoices past due and not fully paid, right now. */
  overdue: { count: number; balance: CurrencyAmount[] }
  /** Issued invoices not fully paid, right now (overdue included). */
  outstanding: { count: number; balance: CurrencyAmount[] }
  /** Issued invoices by their current status, right now. Drafts and test documents excluded. */
  statusMix: Array<{ status: string; label: string; count: number }>
}

/** What the Overview's money charts need, in one read. */
export type MoneyBoardSnapshot = {
  /**
   * Money received per Berlin calendar month in `[monthsFrom, monthsTo]`,
   * net of refunds recorded that month, per currency and split by whether the
   * invoice came from a subscription. Minor units; months with nothing are
   * simply absent.
   */
  months: Array<{ month: string; currency: string; oneOff: number; subscription: number }>
  /**
   * Issued invoices paid in full whose final payment falls in
   * `[onTimeFrom, onTimeTo]`, split by whether that payment was on or before
   * the due date (the last instalment's, when there are instalments).
   */
  paidOnTime: { onTime: number; late: number }
  /** Issued invoices whose final payment falls in the selected period. */
  paidInFull: number
}

export type MoneyBoardQuery = {
  /** Berlin calendar dates, both included. */
  monthsFrom: string
  monthsTo: string
  onTimeFrom: string
  onTimeTo: string
  period: AnalyticsPeriod
}

export type MoneyAnalyticsSource = {
  /** Shown to the owner as the figure's source, e.g. `backend2.invoices`. */
  readonly source: string
  /** Throws on failure; Analytics turns that into `error` for these figures only. */
  read: (period: AnalyticsPeriod, now: Date) => Promise<MoneySnapshot>
  /**
   * The Overview's monthly money, paid-on-time and paid-in-full figures.
   * Optional: a source without it leaves those figures `not-built`.
   */
  readBoard?: (query: MoneyBoardQuery) => Promise<MoneyBoardSnapshot>
}

/*
 * ============================================================ PLUG-IN POINT
 *
 * When Invoices exists, it exports its implementation from
 * `src/backend2/modules/invoices/invoice.analytics.ts`. Connect it here, and
 * nowhere else:
 *
 *   import { invoiceAnalyticsSource } from '../../invoices/invoice.analytics'
 *   export const moneySource: MoneyAnalyticsSource | null = invoiceAnalyticsSource
 *
 * Until then `null` means "not built": every Money figure answers
 * `not-built`, never a zero.
 * ==========================================================================
 */
export const moneySource: MoneyAnalyticsSource | null = invoiceAnalyticsSource
