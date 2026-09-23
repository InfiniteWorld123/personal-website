import type { Currency, InvoiceMode, InvoiceSummary } from '../../contracts/invoice.contract'
import { getDb } from '../../db/client'
import { today } from './invoice.clock'
import { paymentStateSql } from './invoice.repo'

/**
 * The figures above the Dashboard's invoice list. See `docs/v2/invoices.md`
 * ("Design Lab approval": open and overdue totals stay above the list, per
 * currency).
 *
 * One mode at a time — test money never sits beside real money — and every
 * amount per currency, because euros and dollars are never added together.
 * The tab counts use the same payment-state expression as the list, so a tab
 * says exactly how many rows it will show. Read-only.
 */
export const invoiceSummary = async (mode: InvoiceMode): Promise<InvoiceSummary> => {
  const db = getDb()
  const state = paymentStateSql('$2')
  const { rows: owed } = await db.query<{
    currency: Currency
    state: string
    count: string | number
    amount: string | number | null
  }>(
    `SELECT i.currency, (${state}) AS state, count(*) AS count,
            sum(i.total_minor - i.paid_minor + i.refunded_minor) AS amount
       FROM v2_invoices i
      WHERE i.mode = $1 AND i.kind = 'invoice' AND i.status = 'issued'
        AND (${state}) IN ('unpaid', 'partially_paid', 'overdue')
      GROUP BY i.currency, 2
      ORDER BY i.currency`,
    [mode, today()],
  )
  const { rows: counted } = await db.query<{ bucket: string; count: string | number }>(
    `SELECT CASE
              WHEN i.status = 'draft' THEN 'draft'
              WHEN (${state}) IN ('unpaid', 'partially_paid') THEN 'open'
              ELSE (${state})
            END AS bucket,
            count(*) AS count
       FROM v2_invoices i
      WHERE i.mode = $1
      GROUP BY 1`,
    [mode, today()],
  )

  const sum = (states: string[]) => {
    const byCurrency = new Map<Currency, { count: number; amountDueMinor: number }>()

    for (const row of owed) {
      if (!states.includes(row.state)) continue

      const entry = byCurrency.get(row.currency) ?? { count: 0, amountDueMinor: 0 }

      entry.count += Number(row.count)
      entry.amountDueMinor += Number(row.amount ?? 0)
      byCurrency.set(row.currency, entry)
    }

    return [...byCurrency.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, entry]) => ({ currency, ...entry }))
  }

  const counts = { all: 0, draft: 0, open: 0, overdue: 0, paid: 0, cancelled: 0 }

  for (const row of counted) {
    const value = Number(row.count)

    counts.all += value
    if (row.bucket in counts) counts[row.bucket as keyof typeof counts] += value
  }

  return {
    mode,
    open: sum(['unpaid', 'partially_paid', 'overdue']),
    overdue: sum(['overdue']),
    counts,
  }
}
