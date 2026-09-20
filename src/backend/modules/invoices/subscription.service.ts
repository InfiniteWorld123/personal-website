import { getDb, withTransaction, type Db } from '#/backend/db/client'
import { badRequestError, notFoundError } from '#/backend/shared/error'
import type { Subscription } from '#/shared/types/invoice.types'
import {
  billingDate,
  firstPeriod,
  nextPeriod,
  subscriptionLine,
  type SubscriptionWriteInput,
} from '#/shared/validation/invoice.validation'
import { DATE_TEXT, TODAY, toInt } from './invoice.sql'

/**
 * Money that does not stop.
 *
 * A subscription here is three facts — a client, an amount, a day of the month
 * — and one job: when a month comes round, write a **draft** invoice for it.
 *
 * Two decisions shape everything below, and both are his.
 *
 * **It drafts, it does not issue.** An issued invoice takes a number it keeps
 * for ever and can only be undone by a second document. A generator that
 * issued would turn every bug in this file into permanent paper in his books.
 * A draft costs nothing and is deleted with one click, so the worst this code
 * can do is waste a minute of his time.
 *
 * **It runs when he looks.** There is no cron. A scheduled job that quietly
 * stops running is exactly the dead promise this project keeps deleting, and
 * one that cannot be watched from a laptop cannot be trusted from one either.
 * Since the output is a draft he has to act on anyway, a draft written the
 * moment he opens the invoice list is worth precisely as much as one written
 * at three in the morning — and he can see it happen.
 *
 * `runDueSubscriptions` takes the date it works from, so the day a cron is
 * worth having, it calls this and nothing here changes.
 */

/* -------------------------------------------------------------------------- */
/* The calendar                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How many periods a single catch-up may write.
 *
 * Reached only if he has not opened the admin for a year. A ceiling rather
 * than an open loop because the alternative, on a row with a corrupt
 * `next_period`, is a generator that writes drafts until the request times
 * out — and `next_period` advances with each one, so the next visit would
 * carry on where it left off rather than repeat.
 */
const MAX_CATCH_UP = 12

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

type Shape = {
  id: string
  client_id: string
  client_name: string
  description: string
  amount_cents: number | string
  currency: string
  billing_day: number
  started_on: string
  next_period: string
  cancelled_on: string | null
  note: string
  invoice_count: number | string
}

const COLUMNS = `s.id, s.client_id,
        COALESCE(NULLIF(btrim(c.company), ''), c.contact_name) AS client_name,
        s.description, s.amount_cents, s.currency, s.billing_day,
        ${DATE_TEXT('s.started_on')} AS started_on,
        ${DATE_TEXT('s.next_period')} AS next_period,
        ${DATE_TEXT('s.cancelled_on')} AS cancelled_on,
        s.note,
        (SELECT COUNT(*) FROM invoices i WHERE i.subscription_id = s.id) AS invoice_count`

const project = (row: Shape): Subscription => ({
  id: row.id,
  clientId: row.client_id,
  clientName: row.client_name,
  description: row.description,
  amountCents: toInt(row.amount_cents),
  currency: row.currency,
  billingDay: row.billing_day,
  startedOn: row.started_on,
  nextPeriod: row.next_period,
  cancelledOn: row.cancelled_on,
  note: row.note,
  invoiceCount: toInt(row.invoice_count),
})

export const listSubscriptions = async (): Promise<Subscription[]> => {
  const result = await getDb().query<Shape>(
    `SELECT ${COLUMNS}
       FROM subscriptions s
       JOIN clients c ON c.id = s.client_id
      -- Living ones first, then by who is billed soonest. A cancelled
      -- subscription is history and sinks to the bottom rather than vanishing.
      ORDER BY (s.cancelled_on IS NOT NULL), s.next_period, s.created_at;`,
  )

  return result.rows.map(project)
}

const getSubscription = async (id: string): Promise<Subscription> => {
  const result = await getDb().query<Shape>(
    `SELECT ${COLUMNS} FROM subscriptions s JOIN clients c ON c.id = s.client_id
      WHERE s.id = $1;`,
    [id],
  )

  const row = result.rows[0]

  if (!row) throw notFoundError('That subscription is not here')

  return project(row)
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

export const createSubscription = async (
  input: SubscriptionWriteInput,
): Promise<Subscription> => {
  const db = getDb()

  const today = await db.query<{ today: string }>(`SELECT ${DATE_TEXT(TODAY)} AS today;`)
  const start = firstPeriod(today.rows[0]!.today, input.billingDay)

  const result = await db.query<{ id: string }>(
    `INSERT INTO subscriptions
       (client_id, description, amount_cents, billing_day, next_period, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id;`,
    [
      input.clientId,
      input.description,
      Math.round(input.amountEuros * 100),
      input.billingDay,
      start,
      input.note,
    ],
  )

  return getSubscription(result.rows[0]!.id)
}

/**
 * Changing one changes what is billed **next**, never what was billed before.
 *
 * `next_period` is deliberately not recomputed here. A price rise in March
 * must not silently rewrite February's arrangement, and the invoices already
 * written keep their own figures regardless — they are rows of their own.
 */
export const updateSubscription = async (
  id: string,
  input: SubscriptionWriteInput,
): Promise<Subscription> => {
  await getDb().query(
    `UPDATE subscriptions
        SET client_id = $2, description = $3, amount_cents = $4, billing_day = $5,
            note = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;`,
    [
      id,
      input.clientId,
      input.description,
      Math.round(input.amountEuros * 100),
      input.billingDay,
      input.note,
    ],
  )

  return getSubscription(id)
}

/**
 * Stops the billing without erasing that it happened.
 *
 * Not a delete: the invoices it produced point back at this row, and a
 * client's history should not disappear because the arrangement ended. A
 * cancelled subscription is simply never due again.
 */
export const cancelSubscription = async (id: string): Promise<Subscription> => {
  await getDb().query(
    `UPDATE subscriptions
        SET cancelled_on = COALESCE(cancelled_on, ${TODAY}), updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;`,
    [id],
  )

  return getSubscription(id)
}

/** Only while it has produced nothing. After that, cancel it instead. */
export const deleteSubscription = async (id: string): Promise<void> => {
  const subscription = await getSubscription(id)

  if (subscription.invoiceCount > 0) {
    throw badRequestError(
      `That subscription has already written ${subscription.invoiceCount} invoice(s). Cancel it instead — deleting it would cut those invoices loose from where they came from.`,
    )
  }

  await getDb().query('DELETE FROM subscriptions WHERE id = $1;', [id])
}

/* -------------------------------------------------------------------------- */
/* The generator                                                              */
/* -------------------------------------------------------------------------- */

type Due = {
  id: string
  client_id: string
  description: string
  amount_cents: number | string
  billing_day: number
  next_period: string
  language: 'de' | 'en'
  due_days: number
}

/**
 * Writes one draft for one period, and moves the subscription on.
 *
 * Both statements in one transaction, so the row can never be advanced past a
 * month whose invoice was not written — and `invoices_subscription_period_idx`
 * makes the reverse impossible too: a second attempt at the same month
 * violates the unique index and the whole transaction rolls back. The
 * guarantee is the constraint, not this function's care.
 */
const draftPeriod = async (row: Due, period: string): Promise<string> =>
  withTransaction(async (db: Db) => {
    const invoice = await db.query<{ id: string }>(
      `INSERT INTO invoices
         (client_id, money_kind, language, due_days, subscription_id, period_start,
          service_from, service_to)
       VALUES ($1, 'SUBSCRIPTION', $2, $3, $4, $5::date,
               $5::date, ($5::date + INTERVAL '1 month' - INTERVAL '1 day')::date)
       RETURNING id;`,
      [row.client_id, row.language, row.due_days, row.id, period],
    )

    const invoiceId = invoice.rows[0]!.id

    await db.query(
      `INSERT INTO invoice_lines (invoice_id, position, description, quantity, unit_cents, tax_rate)
       VALUES ($1, 1, $2, 1, $3, 0);`,
      [invoiceId, subscriptionLine(row.description, period, row.language), toInt(row.amount_cents)],
    )

    // The draft's stored totals, recomputed the way `updateInvoice` does. A
    // draft with a line and a zero total reads as broken on the list.
    const net = toInt(row.amount_cents)

    await db.query(
      'UPDATE invoices SET net_cents = $2, tax_cents = 0, total_cents = $2 WHERE id = $1;',
      [invoiceId, net],
    )

    await db.query(
      `UPDATE subscriptions
          SET next_period = ($2::date + INTERVAL '1 month')::date,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;`,
      [row.id, period],
    )

    return invoiceId
  })

/**
 * Every month that is owed and not yet drafted.
 *
 * Called from the invoice list, which is the screen the drafts appear on — so
 * he watches it happen rather than trusting that it did.
 *
 * Catching up matters: three months away means three invoices owed, and each
 * is written for its own month with its own line, not merged into one. The
 * amount used is **today's**, because that is the only one this table holds —
 * a subscription that changed price mid-absence bills the new one, which is
 * why the draft exists for him to read before it becomes paper.
 */
export const runDueSubscriptions = async (): Promise<string[]> => {
  const db = getDb()

  const due = await db.query<Due & { today: string }>(
    `SELECT s.id, s.client_id, s.description, s.amount_cents, s.billing_day,
            ${DATE_TEXT('s.next_period')} AS next_period,
            c.language, 14 AS due_days,
            ${DATE_TEXT(TODAY)} AS today
       FROM subscriptions s
       JOIN clients c ON c.id = s.client_id
      WHERE s.cancelled_on IS NULL
        -- Due once the billing day inside that month has arrived. Comparing
        -- the month alone would write October's invoice on 1 October for a
        -- subscription that bills on the 25th.
        AND (s.next_period + (s.billing_day - 1) * INTERVAL '1 day') <= ${TODAY}
      ORDER BY s.next_period;`,
  )

  const written: string[] = []

  for (const row of due.rows) {
    let period = row.next_period

    for (let caught = 0; caught < MAX_CATCH_UP; caught += 1) {
      if (billingDate(period, row.billing_day) > row.today) break

      try {
        written.push(await draftPeriod(row, period))
      } catch (error) {
        /*
         * Almost certainly the unique index: another request drafted this
         * month a moment ago. That is the constraint doing its job, and there
         * is nothing to report — the invoice he needs exists. Anything else
         * is swallowed for the same reason the whole generator is best-effort:
         * it runs inside a page load, and a subscription that cannot be
         * drafted must not take the invoice list down with it.
         */
        void error
        break
      }

      period = nextPeriod(period)
    }
  }

  return written
}
