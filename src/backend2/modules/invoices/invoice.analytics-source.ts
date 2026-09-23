import type { AnalyticsPeriod, CurrencyAmount } from '../../contracts/analytics.contract'
import type { Currency } from '../../contracts/invoice.contract'
import { getDb } from '../../db/client'
import type { MoneyAnalyticsSource, MoneySnapshot } from '../analytics/sources/money'
import { invoiceStatusMix, overdueInvoices, receivedPayments } from './invoice.analytics'
import { today as berlinToday } from './invoice.clock'
import { paymentStateSql } from './invoice.repo'

/**
 * Invoices' figures in the shape Analytics asks for. Live documents only:
 * test invoices never count as money (`docs/v2/analytics.md`).
 */

const amounts = (rows: Array<{ currency: Currency; amountMinor: number }>): CurrencyAmount[] =>
  rows.map((row) => ({ currency: row.currency, minor: row.amountMinor }))

/** Issued live invoices not fully paid today, overdue included, per currency. */
const outstanding = async (): Promise<MoneySnapshot['outstanding']> => {
  const { rows } = await getDb().query<{ currency: Currency; count: string | number; amount: string | number }>(
    `SELECT i.currency, count(*) AS count, sum(i.total_minor - i.paid_minor + i.refunded_minor) AS amount
       FROM v2_invoices i
      WHERE i.mode = 'live' AND i.kind = 'invoice' AND i.status = 'issued'
        AND (${paymentStateSql('$1')}) IN ('unpaid', 'partially_paid', 'overdue')
      GROUP BY i.currency ORDER BY i.currency`,
    [berlinToday()],
  )

  return {
    count: rows.reduce((sum, row) => sum + Number(row.count), 0),
    balance: rows.map((row) => ({ currency: row.currency, minor: Number(row.amount) })),
  }
}

const LABEL: Record<string, string> = {
  unpaid: 'Open',
  partially_paid: 'Partly paid',
  overdue: 'Overdue',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

export const invoiceAnalyticsSource: MoneyAnalyticsSource = {
  source: 'backend2.invoices',
  read: async (period: AnalyticsPeriod): Promise<MoneySnapshot> => {
    const [current, previous, overdue, open, mix] = await Promise.all([
      receivedPayments({ from: period.from, to: period.to }),
      receivedPayments({ from: period.previous.from, to: period.previous.to }),
      overdueInvoices(),
      outstanding(),
      invoiceStatusMix(),
    ])

    return {
      receivedNet: amounts(current.net),
      previousReceivedNet: amounts(previous.net),
      refunds: amounts(current.refunded),
      overdue: {
        count: overdue.byCurrency.reduce((sum, row) => sum + row.count, 0),
        balance: overdue.byCurrency.map((row) => ({ currency: row.currency, minor: row.amountDueMinor })),
      },
      outstanding: open,
      statusMix: Object.entries(mix.states).map(([status, count]) => ({ status, label: LABEL[status] ?? status, count })),
    }
  },
}
