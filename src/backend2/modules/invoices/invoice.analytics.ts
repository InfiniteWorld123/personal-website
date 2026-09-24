import type { Currency, InvoiceMode, PaymentState } from '../../contracts/invoice.contract'
import { getDb } from '../../db/client'
import { today as berlinToday } from './invoice.clock'
import { paymentStateSql } from './invoice.repo'

/**
 * Read-only figures for the Analytics module. See `docs/v2/invoices.md`
 * ("Analytics interface").
 *
 * Live mode only by default: test documents are practice, not business.
 * `includeTest: true` adds them for a local demo, and the answer says so.
 * Money is always reported per currency — EUR and USD are never added
 * together — and cancellation documents are never counted as revenue.
 * Nothing here writes.
 */

export type AnalyticsScope = {
  /** Default `false`: only live documents. */
  includeTest?: boolean
}

const modes = (scope: AnalyticsScope): InvoiceMode[] => (scope.includeTest ? ['live', 'test'] : ['live'])

export type MoneyByCurrency = Array<{ currency: Currency; amountMinor: number }>

const byCurrency = (rows: Array<{ currency: Currency; amount: number | string | null }>): MoneyByCurrency =>
  rows
    .map((row) => ({ currency: row.currency, amountMinor: Number(row.amount ?? 0) }))
    .sort((a, b) => a.currency.localeCompare(b.currency))

/**
 * Money received in `[from, to]` (Berlin calendar days, inclusive), minus
 * refunds made in the same range, per currency. Voided entries do not count.
 */
export const receivedPayments = async (
  input: { from: string; to: string } & AnalyticsScope,
): Promise<{ includesTest: boolean; received: MoneyByCurrency; refunded: MoneyByCurrency; net: MoneyByCurrency }> => {
  const db = getDb()
  const { rows: paid } = await db.query<{ currency: Currency; amount: string | number }>(
    `SELECT p.currency, sum(p.amount_minor) AS amount
       FROM v2_invoice_payments p JOIN v2_invoices i ON i.id = p.invoice_id
      WHERE i.mode = ANY($1) AND p.voided_at IS NULL AND p.paid_on BETWEEN $2 AND $3
      GROUP BY p.currency`,
    [modes(input), input.from, input.to],
  )
  const { rows: back } = await db.query<{ currency: Currency; amount: string | number }>(
    `SELECT r.currency, sum(r.amount_minor) AS amount
       FROM v2_invoice_refunds r JOIN v2_invoices i ON i.id = r.invoice_id
      WHERE i.mode = ANY($1) AND r.refunded_on BETWEEN $2 AND $3
      GROUP BY r.currency`,
    [modes(input), input.from, input.to],
  )
  const received = byCurrency(paid)
  const refunded = byCurrency(back)
  const currencies = [...new Set([...received, ...refunded].map((row) => row.currency))].sort()

  return {
    includesTest: Boolean(input.includeTest),
    received,
    refunded,
    net: currencies.map((currency) => ({
      currency,
      amountMinor:
        (received.find((row) => row.currency === currency)?.amountMinor ?? 0) -
        (refunded.find((row) => row.currency === currency)?.amountMinor ?? 0),
    })),
  }
}

/** Issued invoices that are overdue today (Berlin), with what is still owed, per currency. */
export const overdueInvoices = async (
  scope: AnalyticsScope = {},
): Promise<{ includesTest: boolean; byCurrency: Array<{ currency: Currency; count: number; amountDueMinor: number }> }> => {
  const { rows } = await getDb().query<{ currency: Currency; count: string | number; amount: string | number }>(
    `SELECT i.currency, count(*) AS count,
            sum(i.total_minor - i.paid_minor + i.refunded_minor) AS amount
       FROM v2_invoices i
      WHERE i.mode = ANY($1) AND i.kind = 'invoice' AND i.status = 'issued'
        AND (${paymentStateSql('$2')}) = 'overdue'
      GROUP BY i.currency ORDER BY i.currency`,
    [modes(scope), berlinToday()],
  )

  return {
    includesTest: Boolean(scope.includeTest),
    byCurrency: rows.map((row) => ({
      currency: row.currency,
      count: Number(row.count),
      amountDueMinor: Number(row.amount),
    })),
  }
}

/**
 * How many invoices are in each state today. Optionally only those issued in
 * `[from, to]`. Drafts are counted separately; cancellation documents not at all.
 */
export const invoiceStatusMix = async (
  input: { from?: string; to?: string } & AnalyticsScope = {},
): Promise<{ includesTest: boolean; drafts: number; states: Record<Exclude<PaymentState, 'not_applicable'>, number> }> => {
  const { rows } = await getDb().query<{ state: string; count: string | number }>(
    `SELECT (${paymentStateSql('$2')}) AS state, count(*) AS count
       FROM v2_invoices i
      WHERE i.mode = ANY($1) AND i.kind = 'invoice' AND i.status <> 'draft'
        AND ($3::date IS NULL OR i.issue_date >= $3::date)
        AND ($4::date IS NULL OR i.issue_date <= $4::date)
      GROUP BY 1`,
    [modes(input), berlinToday(), input.from ?? null, input.to ?? null],
  )
  const { rows: drafts } = await getDb().query<{ count: string | number }>(
    `SELECT count(*) AS count FROM v2_invoices i WHERE i.mode = ANY($1) AND i.status = 'draft'`,
    [modes(input)],
  )
  const states = { unpaid: 0, partially_paid: 0, paid: 0, overdue: 0, cancelled: 0 }

  for (const row of rows) {
    if (row.state in states) states[row.state as keyof typeof states] = Number(row.count)
  }

  return { includesTest: Boolean(input.includeTest), drafts: Number(drafts[0]?.count ?? 0), states }
}

/** Subscriptions by status and collection mode. */
export const subscriptionCounts = async (
  scope: AnalyticsScope = {},
): Promise<{
  includesTest: boolean
  active: number
  paused: number
  ended: number
  byCollection: { manual: number; automatic_card: number }
}> => {
  const { rows } = await getDb().query<{ status: string; collection: string; count: string | number }>(
    `SELECT status, collection, count(*) AS count FROM v2_subscriptions
      WHERE mode = ANY($1) GROUP BY status, collection`,
    [modes(scope)],
  )
  const result = {
    includesTest: Boolean(scope.includeTest),
    active: 0,
    paused: 0,
    ended: 0,
    byCollection: { manual: 0, automatic_card: 0 },
  }

  for (const row of rows) {
    const count = Number(row.count)

    if (row.status === 'active' || row.status === 'paused' || row.status === 'ended') result[row.status] += count
    if (row.status !== 'ended' && (row.collection === 'manual' || row.collection === 'automatic_card')) {
      result.byCollection[row.collection] += count
    }
  }

  return result
}

/* --------------------------------------------------------- Overview charts */

/**
 * Money received per Berlin calendar month in `[from, to]`, net of refunds
 * recorded that month, per currency, split by whether the invoice was
 * produced by a subscription. Payments carry a calendar date (`paid_on`), so
 * a month is simply the dates in it. Voided payments do not count.
 */
export const receivedByMonth = async (
  input: { from: string; to: string } & AnalyticsScope,
): Promise<Array<{ month: string; currency: Currency; oneOff: number; subscription: number }>> => {
  const { rows } = await getDb().query<{
    month: string
    currency: Currency
    one_off: string | number | null
    subscription: string | number | null
  }>(
    `WITH moves AS (
       SELECT p.paid_on AS day, p.currency, p.amount_minor AS amount, i.subscription_id IS NOT NULL AS recurring
         FROM v2_invoice_payments p JOIN v2_invoices i ON i.id = p.invoice_id
        WHERE i.mode = ANY($1) AND p.voided_at IS NULL AND p.paid_on BETWEEN $2 AND $3
       UNION ALL
       SELECT r.refunded_on, r.currency, -r.amount_minor, i.subscription_id IS NOT NULL
         FROM v2_invoice_refunds r JOIN v2_invoices i ON i.id = r.invoice_id
        WHERE i.mode = ANY($1) AND r.refunded_on BETWEEN $2 AND $3
     )
     SELECT to_char(date_trunc('month', day), 'YYYY-MM-DD') AS month, currency,
            sum(amount) FILTER (WHERE NOT recurring) AS one_off,
            sum(amount) FILTER (WHERE recurring) AS subscription
       FROM moves
      GROUP BY 1, 2
      ORDER BY 1, 2`,
    [modes(input), input.from, input.to],
  )

  return rows.map((row) => ({
    month: row.month,
    currency: row.currency,
    oneOff: Number(row.one_off ?? 0),
    subscription: Number(row.subscription ?? 0),
  }))
}

/**
 * The SQL for issued invoices that are paid in full today, with the date of
 * their final (not voided) payment and the date it was due by: the last
 * instalment's due date when there are instalments, otherwise the invoice's.
 */
const SETTLED_INVOICES = `
  SELECT i.id,
         (SELECT max(p.paid_on) FROM v2_invoice_payments p
           WHERE p.invoice_id = i.id AND p.voided_at IS NULL) AS settled_on,
         COALESCE((SELECT max(s.due_date) FROM v2_invoice_installments s WHERE s.invoice_id = i.id),
                  i.due_date) AS due_by
    FROM v2_invoices i
   WHERE i.mode = ANY($1) AND i.kind = 'invoice' AND i.status = 'issued'
     AND i.total_minor > 0
     AND i.total_minor - i.paid_minor + i.refunded_minor <= 0`

/**
 * Invoices paid in full whose final payment falls in `[from, to]`: how many
 * were paid on or before the date they were due, and how many after.
 */
export const paidOnTime = async (
  input: { from: string; to: string } & AnalyticsScope,
): Promise<{ onTime: number; late: number; paidInFull: number }> => {
  const { rows } = await getDb().query<{ on_time: string | number; late: string | number; settled: string | number }>(
    `WITH settled AS (${SETTLED_INVOICES})
     SELECT count(*) FILTER (WHERE due_by IS NOT NULL AND settled_on <= due_by) AS on_time,
            count(*) FILTER (WHERE due_by IS NOT NULL AND settled_on > due_by) AS late,
            count(*) AS settled
       FROM settled
      WHERE settled_on BETWEEN $2 AND $3`,
    [modes(input), input.from, input.to],
  )

  return {
    onTime: Number(rows[0]?.on_time ?? 0),
    late: Number(rows[0]?.late ?? 0),
    paidInFull: Number(rows[0]?.settled ?? 0),
  }
}
