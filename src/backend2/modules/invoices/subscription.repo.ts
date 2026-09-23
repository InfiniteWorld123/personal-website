import { getDb } from '../../db/client'
import type {
  BillingInterval,
  CardStatus,
  CollectionMode,
  Currency,
  DocumentLanguage,
  InvoiceMode,
  SubscriptionListQuery,
  SubscriptionStatus,
} from '../../contracts/invoice.contract'

/**
 * Every statement Subscriptions runs. Dates come back as text, for the reason
 * given in `invoice.repo.ts`.
 */

export type SubscriptionRow = {
  id: string
  mode: InvoiceMode
  client_id: string
  client_name: string
  status: SubscriptionStatus
  collection: CollectionMode
  billing_interval: BillingInterval
  start_date: string
  ends_on: string | null
  ended_at: Date | null
  paused_from: string | null
  currency: Currency
  language: DocumentLanguage
  description: string
  tax_rate_bp: number | null
  service: { id: string; name: string; priceMinor: number | null } | null
  fx: Record<string, unknown> | null
  recipient: Record<string, string>
  payment_terms_days: number
  allow_bank: boolean
  allow_stripe: boolean
  next_period_index: number
  stripe_customer_id: string | null
  stripe_payment_method_id: string | null
  card_status: CardStatus
  card_label: string
  card_consent_at: Date | null
  revision: number
  created_at: Date
  updated_at: Date
}

const COLUMNS = `s.id, s.mode, s.client_id,
  (SELECT CASE WHEN c.kind = 'company' AND c.company_name <> '' THEN c.company_name ELSE c.name END
     FROM v2_clients c WHERE c.id = s.client_id) AS client_name,
  s.status, s.collection, s.billing_interval, s.start_date::text AS start_date, s.ends_on::text AS ends_on,
  s.ended_at, s.paused_from::text AS paused_from, s.currency, s.language, s.description, s.tax_rate_bp,
  s.service, s.fx, s.recipient, s.payment_terms_days, s.allow_bank, s.allow_stripe, s.next_period_index,
  s.stripe_customer_id, s.stripe_payment_method_id, s.card_status, s.card_label, s.card_consent_at,
  s.revision, s.created_at, s.updated_at`

export const findSubscription = async (id: string): Promise<SubscriptionRow | null> => {
  const { rows } = await getDb().query<SubscriptionRow>(`SELECT ${COLUMNS} FROM v2_subscriptions s WHERE s.id = $1`, [id])

  return rows[0] ?? null
}

export const lockSubscription = async (id: string): Promise<SubscriptionRow | null> => {
  const { rows } = await getDb().query<SubscriptionRow>(
    `SELECT ${COLUMNS} FROM v2_subscriptions s WHERE s.id = $1 FOR UPDATE OF s`,
    [id],
  )

  return rows[0] ?? null
}

export const insertSubscription = async (input: {
  mode: InvoiceMode
  clientId: string
  collection: CollectionMode
  interval: BillingInterval
  startDate: string
  currency: Currency
  language: DocumentLanguage
  description: string
  taxRateBp: number | null
  service: unknown
  fx: unknown
  recipient: unknown
  paymentTermsDays: number
  allowBank: boolean
  allowStripe: boolean
}): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_subscriptions
       (mode, client_id, collection, billing_interval, start_date, currency, language, description,
        tax_rate_bp, service, fx, recipient, payment_terms_days, allow_bank, allow_stripe)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id`,
    [
      input.mode,
      input.clientId,
      input.collection,
      input.interval,
      input.startDate,
      input.currency,
      input.language,
      input.description,
      input.taxRateBp,
      input.service === null ? null : JSON.stringify(input.service),
      input.fx === null ? null : JSON.stringify(input.fx),
      JSON.stringify(input.recipient),
      input.paymentTermsDays,
      input.allowBank,
      input.allowStripe,
    ],
  )

  return rows[0]!.id
}

export const updateSubscription = async (id: string, fields: Record<string, unknown>): Promise<void> => {
  const keys = Object.keys(fields)

  if (keys.length === 0) return

  const values = keys.map((key) => {
    const value = fields[key]

    return (key === 'recipient' || key === 'fx' || key === 'service') && value !== null ? JSON.stringify(value) : value
  })
  const sets = keys.map((key, index) => `${key} = $${index + 2}`)

  await getDb().query(
    `UPDATE v2_subscriptions SET ${[...sets, 'revision = revision + 1', 'updated_at = CURRENT_TIMESTAMP'].join(', ')}
      WHERE id = $1`,
    [id, ...values],
  )
}

/** The job's cursor. Not an edit by the owner, so the revision stays. */
export const setCursor = async (id: string, index: number): Promise<void> => {
  await getDb().query('UPDATE v2_subscriptions SET next_period_index = $2 WHERE id = $1', [id, index])
}

export const listSubscriptions = async (
  query: SubscriptionListQuery,
): Promise<{ rows: SubscriptionRow[]; total: number }> => {
  const where: string[] = []
  const values: unknown[] = []
  const add = (value: unknown) => {
    values.push(value)

    return `$${values.length}`
  }

  if (query.mode !== 'all') where.push(`s.mode = ${add(query.mode)}`)
  if (query.status !== 'all') where.push(`s.status = ${add(query.status)}`)
  if (query.clientId) where.push(`s.client_id = ${add(query.clientId)}`)

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const db = getDb()
  const { rows: counted } = await db.query<{ total: number | string }>(
    `SELECT count(*) AS total FROM v2_subscriptions s ${clause}`,
    values,
  )
  const limit = add(query.pageSize)
  const offset = add((query.page - 1) * query.pageSize)
  const { rows } = await db.query<SubscriptionRow>(
    `SELECT ${COLUMNS} FROM v2_subscriptions s ${clause}
      ORDER BY s.created_at DESC, s.id DESC LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

/** Ids the billing job looks at, in a stable order, a batch at a time. */
export const subscriptionIdsAfter = async (afterId: string | null, limit: number): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    `SELECT id FROM v2_subscriptions
      WHERE ($1::uuid IS NULL OR id > $1::uuid)
        AND (status <> 'ended' OR ends_on >= start_date)
      ORDER BY id LIMIT $2`,
    [afterId, limit],
  )

  return rows.map((row) => row.id)
}

/* ------------------------------------------------------------------ terms */

export type TermsRow = { effective_from: string; amount_minor: number | string; note: string; fx: unknown }

export const termsOf = async (subscriptionId: string): Promise<TermsRow[]> => {
  const { rows } = await getDb().query<TermsRow>(
    `SELECT effective_from::text AS effective_from, amount_minor, note, fx
       FROM v2_subscription_terms WHERE subscription_id = $1 ORDER BY effective_from`,
    [subscriptionId],
  )

  return rows
}

export const upsertTerms = async (input: {
  subscriptionId: string
  effectiveFrom: string
  amountMinor: number
  note: string
  fx: unknown
}): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_subscription_terms (subscription_id, effective_from, amount_minor, note, fx)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (subscription_id, effective_from)
     DO UPDATE SET amount_minor = EXCLUDED.amount_minor, note = EXCLUDED.note, fx = EXCLUDED.fx`,
    [input.subscriptionId, input.effectiveFrom, input.amountMinor, input.note, input.fx === null ? null : JSON.stringify(input.fx)],
  )
}

/* -------------------------------------------------------------- discounts */

export type DiscountRow = {
  id: string
  discount_type: 'percent' | 'fixed'
  value: number | string
  starts_on: string
  periods: number | null
  applied_count: number
  ended_at: Date | null
  note: string
}

export const discountsOf = async (subscriptionId: string): Promise<DiscountRow[]> => {
  const { rows } = await getDb().query<DiscountRow>(
    `SELECT id, discount_type, value, starts_on::text AS starts_on, periods, applied_count, ended_at, note
       FROM v2_subscription_discounts WHERE subscription_id = $1 ORDER BY starts_on, created_at, id LIMIT 200`,
    [subscriptionId],
  )

  return rows
}

export const insertDiscount = async (input: {
  subscriptionId: string
  discountType: 'percent' | 'fixed'
  value: number
  startsOn: string
  periods: number | null
  note: string
}): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_subscription_discounts (subscription_id, discount_type, value, starts_on, periods, note)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [input.subscriptionId, input.discountType, input.value, input.startsOn, input.periods, input.note],
  )

  return rows[0]!.id
}

export const countDiscountUse = async (id: string): Promise<void> => {
  await getDb().query(
    'UPDATE v2_subscription_discounts SET applied_count = applied_count + 1 WHERE id = $1',
    [id],
  )
}

export const endDiscount = async (subscriptionId: string, id: string): Promise<boolean> => {
  const { rows } = await getDb().query<{ id: string }>(
    `UPDATE v2_subscription_discounts SET ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)
      WHERE id = $1 AND subscription_id = $2 RETURNING id`,
    [id, subscriptionId],
  )

  return rows.length > 0
}

/* ------------------------------------------------------ free and paused */

export type RangeRow = { id: string; starts_on: string; ends_on: string | null; note?: string }

export const freePeriodsOf = async (subscriptionId: string): Promise<RangeRow[]> => {
  const { rows } = await getDb().query<RangeRow>(
    `SELECT id, starts_on::text AS starts_on, ends_on::text AS ends_on, note
       FROM v2_subscription_free_periods WHERE subscription_id = $1 ORDER BY starts_on, id LIMIT 200`,
    [subscriptionId],
  )

  return rows
}

export const insertFreePeriod = async (input: {
  subscriptionId: string
  startsOn: string
  endsOn: string | null
  note: string
}): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_subscription_free_periods (subscription_id, starts_on, ends_on, note) VALUES ($1, $2, $3, $4)`,
    [input.subscriptionId, input.startsOn, input.endsOn, input.note],
  )
}

export const pausesOf = async (subscriptionId: string): Promise<RangeRow[]> => {
  const { rows } = await getDb().query<RangeRow>(
    `SELECT id, starts_on::text AS starts_on, ends_on::text AS ends_on
       FROM v2_subscription_pauses WHERE subscription_id = $1 ORDER BY starts_on, id LIMIT 200`,
    [subscriptionId],
  )

  return rows
}

export const openPause = async (subscriptionId: string, startsOn: string): Promise<void> => {
  await getDb().query(
    'INSERT INTO v2_subscription_pauses (subscription_id, starts_on) VALUES ($1, $2)',
    [subscriptionId, startsOn],
  )
}

export const closePause = async (subscriptionId: string, endsOn: string): Promise<void> => {
  await getDb().query(
    'UPDATE v2_subscription_pauses SET ends_on = $2 WHERE subscription_id = $1 AND ends_on IS NULL',
    [subscriptionId, endsOn],
  )
}

/* ---------------------------------------------------------------- periods */

export type PeriodRow = {
  period_index: number
  period_start: string
  period_end: string
  outcome: 'invoiced' | 'free' | 'paused' | 'after_end'
  invoice_id: string | null
  amount_minor: number | string
  discount_minor: number | string
  created_at: Date
}

/** Records a decided period; `false` when it was already decided. */
export const insertPeriod = async (input: {
  subscriptionId: string
  index: number
  start: string
  end: string
  outcome: PeriodRow['outcome']
  invoiceId: string | null
  amountMinor: number
  discountMinor: number
}): Promise<boolean> => {
  const { rows } = await getDb().query<{ period_index: number }>(
    `INSERT INTO v2_subscription_periods
       (subscription_id, period_index, period_start, period_end, outcome, invoice_id, amount_minor, discount_minor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING RETURNING period_index`,
    [
      input.subscriptionId,
      input.index,
      input.start,
      input.end,
      input.outcome,
      input.invoiceId,
      input.amountMinor,
      input.discountMinor,
    ],
  )

  return rows.length > 0
}

export const periodsOf = async (input: {
  subscriptionId: string
  limit: number
  offset: number
}): Promise<{ rows: PeriodRow[]; total: number }> => {
  const db = getDb()
  const { rows: counted } = await db.query<{ total: number | string }>(
    'SELECT count(*) AS total FROM v2_subscription_periods WHERE subscription_id = $1',
    [input.subscriptionId],
  )
  const { rows } = await db.query<PeriodRow>(
    `SELECT period_index, period_start::text AS period_start, period_end::text AS period_end, outcome,
            invoice_id, amount_minor, discount_minor, created_at
       FROM v2_subscription_periods WHERE subscription_id = $1
      ORDER BY period_start DESC LIMIT $2 OFFSET $3`,
    [input.subscriptionId, input.limit, input.offset],
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

export const countInvoicedPeriods = async (subscriptionId: string): Promise<number> => {
  const { rows } = await getDb().query<{ total: number | string }>(
    `SELECT count(*) AS total FROM v2_subscription_periods WHERE subscription_id = $1 AND outcome = 'invoiced'`,
    [subscriptionId],
  )

  return Number(rows[0]?.total ?? 0)
}

/* ---------------------------------------------------------------- charges */

export type ChargeRow = {
  id: string
  subscription_id: string
  invoice_id: string
  attempt: number
  status: 'scheduled' | 'processing' | 'succeeded' | 'failed' | 'waiting_for_card' | 'cancelled'
  scheduled_on: string
  stripe_payment_intent_id: string | null
  failure_message: string
}

const CHARGE_COLUMNS = `id, subscription_id, invoice_id, attempt, status, scheduled_on::text AS scheduled_on,
  stripe_payment_intent_id, failure_message`

export const insertCharge = async (input: {
  subscriptionId: string
  invoiceId: string
  attempt: number
  scheduledOn: string
}): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_subscription_charges (subscription_id, invoice_id, attempt, scheduled_on)
     VALUES ($1, $2, $3, $4) ON CONFLICT (invoice_id, attempt) DO NOTHING`,
    [input.subscriptionId, input.invoiceId, input.attempt, input.scheduledOn],
  )
}

export const dueChargeIds = async (today: string, limit: number): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    `SELECT id FROM v2_subscription_charges
      WHERE status IN ('scheduled', 'waiting_for_card') AND scheduled_on <= $1
      ORDER BY scheduled_on, id LIMIT $2`,
    [today, limit],
  )

  return rows.map((row) => row.id)
}

export const lockCharge = async (id: string): Promise<ChargeRow | null> => {
  const { rows } = await getDb().query<ChargeRow>(
    `SELECT ${CHARGE_COLUMNS} FROM v2_subscription_charges WHERE id = $1 FOR UPDATE`,
    [id],
  )

  return rows[0] ?? null
}

export const chargesOfInvoice = async (invoiceId: string): Promise<ChargeRow[]> => {
  const { rows } = await getDb().query<ChargeRow>(
    `SELECT ${CHARGE_COLUMNS} FROM v2_subscription_charges WHERE invoice_id = $1 ORDER BY attempt`,
    [invoiceId],
  )

  return rows
}

export const setChargeStatus = async (input: {
  id: string
  status: ChargeRow['status']
  paymentIntentId?: string | null
  message?: string
  attempted?: boolean
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_subscription_charges
        SET status = $2,
            stripe_payment_intent_id = COALESCE($3, stripe_payment_intent_id),
            failure_message = COALESCE($4, failure_message),
            attempted_at = CASE WHEN $5 THEN CURRENT_TIMESTAMP ELSE attempted_at END
      WHERE id = $1`,
    [input.id, input.status, input.paymentIntentId ?? null, input.message ?? null, input.attempted ?? false],
  )
}

/* ---------------------------------------------------------------- notices */

export type NoticeRow = {
  id: string
  invoice_id: string | null
  subscription_id: string | null
  kind: string
  audience: 'owner' | 'customer'
  due_on: string
  status: 'pending' | 'prepared' | 'cancelled'
  message: string
  inbox_draft_id: string | null
  created_at: Date
}

const NOTICE_COLUMNS = `id, invoice_id, subscription_id, kind, audience, due_on::text AS due_on, status, message,
  inbox_draft_id, created_at`

/** One notice per `dedupeKey`, however often it is asked for. */
export const scheduleNotice = async (input: {
  invoiceId: string | null
  subscriptionId: string | null
  kind: string
  audience: 'owner' | 'customer'
  dueOn: string
  message: string
  dedupeKey: string
}): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_invoice_notices (invoice_id, subscription_id, kind, audience, due_on, message, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (dedupe_key) DO NOTHING`,
    [input.invoiceId, input.subscriptionId, input.kind, input.audience, input.dueOn, input.message, input.dedupeKey],
  )
}

export const dueNoticeIds = async (today: string, limit: number): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    `SELECT id FROM v2_invoice_notices WHERE status = 'pending' AND due_on <= $1 ORDER BY due_on, id LIMIT $2`,
    [today, limit],
  )

  return rows.map((row) => row.id)
}

export const lockNotice = async (id: string): Promise<NoticeRow | null> => {
  const { rows } = await getDb().query<NoticeRow>(
    `SELECT ${NOTICE_COLUMNS} FROM v2_invoice_notices WHERE id = $1 FOR UPDATE`,
    [id],
  )

  return rows[0] ?? null
}

export const setNoticeStatus = async (input: {
  id: string
  status: NoticeRow['status']
  inboxDraftId?: string | null
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoice_notices
        SET status = $2, inbox_draft_id = COALESCE($3, inbox_draft_id),
            prepared_at = CASE WHEN $2 = 'prepared' THEN CURRENT_TIMESTAMP ELSE prepared_at END
      WHERE id = $1`,
    [input.id, input.status, input.inboxDraftId ?? null],
  )
}

export const cancelPendingNotices = async (invoiceId: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoice_notices SET status = 'cancelled' WHERE invoice_id = $1 AND status = 'pending'`,
    [invoiceId],
  )
}

export const listNotices = async (input: {
  status: 'pending' | 'prepared' | 'cancelled' | 'all'
  limit: number
  offset: number
}): Promise<{ rows: NoticeRow[]; total: number }> => {
  const db = getDb()
  const where = input.status === 'all' ? '' : 'WHERE status = $1'
  const values = input.status === 'all' ? [] : [input.status]
  const { rows: counted } = await db.query<{ total: number | string }>(
    `SELECT count(*) AS total FROM v2_invoice_notices ${where}`,
    values,
  )
  const { rows } = await db.query<NoticeRow>(
    `SELECT ${NOTICE_COLUMNS} FROM v2_invoice_notices ${where}
      ORDER BY created_at DESC, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, input.limit, input.offset],
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}
