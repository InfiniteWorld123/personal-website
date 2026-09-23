import { getDb } from '../../db/client'
import type {
  Currency,
  DiscountType,
  DocumentLanguage,
  InvoiceKind,
  InvoiceListQuery,
  InvoiceMode,
  InvoiceStatus,
  PaymentMethod,
  RefundMethod,
  TaxMode,
} from '../../contracts/invoice.contract'

/**
 * Every statement Invoices runs against `0012_invoices.sql`. No business rule
 * lives here and no HTTP concept reaches it.
 *
 * Dates are read back as text (`::text`), never as `Date`: `pg` and PGlite
 * disagree about which midnight a `date` column means, and a calendar day
 * has no time zone to disagree about. Counts and `bigint` columns go through
 * `Number()` in the mapper for the same kind of reason.
 *
 * Queries run one after another, never `Promise.all` (see the Clients repo).
 */

/* ----------------------------------------------------------------- settings */

export type SettingsRow = {
  seller_name: string
  seller_address: string
  seller_country_code: string
  seller_email: string
  seller_phone: string
  seller_website: string
  tax_number: string
  vat_id: string
  bank_holder: string
  bank_iban: string
  bank_bic: string
  bank_name: string
  tax_mode: TaxMode
  default_tax_rate_bp: number
  payment_terms_days: number
  default_language: DocumentLanguage
  test_recipient_email: string
  media_folder_id: string | null
  revision: number
  updated_at: Date
}

/** The seller row, written with its defaults the first time it is needed. */
export const readSettings = async (): Promise<SettingsRow> => {
  const db = getDb()

  await db.query('INSERT INTO v2_invoice_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING')

  const { rows } = await db.query<SettingsRow>('SELECT * FROM v2_invoice_settings WHERE id = 1')

  return rows[0]!
}

export const lockSettings = async (): Promise<SettingsRow> => {
  const db = getDb()

  await db.query('INSERT INTO v2_invoice_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING')

  const { rows } = await db.query<SettingsRow>('SELECT * FROM v2_invoice_settings WHERE id = 1 FOR UPDATE')

  return rows[0]!
}

export const writeSettings = async (fields: Record<string, unknown>): Promise<void> => {
  const keys = Object.keys(fields)
  const sets = keys.map((key, index) => `${key} = $${index + 1}`)

  await getDb().query(
    `UPDATE v2_invoice_settings
        SET ${sets.join(', ')}, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = 1`,
    keys.map((key) => fields[key]),
  )
}

export const setMediaFolder = async (folderId: string): Promise<void> => {
  await getDb().query('UPDATE v2_invoice_settings SET media_folder_id = $1 WHERE id = 1', [folderId])
}

/* ----------------------------------------------------------------- invoices */

export type InvoiceRow = {
  id: string
  mode: InvoiceMode
  kind: InvoiceKind
  status: InvoiceStatus
  client_id: string
  client_name: string
  number: string | null
  number_year: number | null
  number_seq: number | null
  currency: Currency
  language: DocumentLanguage
  title: string
  recipient_name: string
  recipient_company: string
  recipient_address: string
  recipient_country_code: string
  recipient_email: string
  recipient_vat_id: string
  service_date_from: string | null
  service_date_to: string | null
  payment_terms_days: number
  issue_date: string | null
  due_date: string | null
  discount_type: DiscountType
  discount_value: number | string
  tax_mode: TaxMode
  reverse_charge: boolean
  allow_bank: boolean
  allow_stripe: boolean
  notes: string
  internal_note: string
  fx: Record<string, unknown> | null
  subtotal_minor: number | string
  discount_minor: number | string
  net_minor: number | string
  tax_minor: number | string
  total_minor: number | string
  paid_minor: number | string
  refunded_minor: number | string
  snapshot: Record<string, unknown> | null
  cancels_invoice_id: string | null
  replaces_invoice_id: string | null
  subscription_id: string | null
  period_start: string | null
  period_end: string | null
  stripe_checkout_session_id: string | null
  stripe_checkout_url: string | null
  stripe_checkout_expires_at: Date | null
  collection_failed_at: Date | null
  inbox_draft_id: string | null
  sent_at: Date | null
  issued_at: Date | null
  cancelled_at: Date | null
  cancel_reason: string
  revision: number
  created_at: Date
  updated_at: Date
  /** Only on reads that ask for it (lists). */
  payment_state?: string
}

const DISPLAY_NAME = `(SELECT CASE WHEN c.kind = 'company' AND c.company_name <> '' THEN c.company_name ELSE c.name END
    FROM v2_clients c WHERE c.id = i.client_id)`

export const INVOICE_COLUMNS = `i.id, i.mode, i.kind, i.status, i.client_id, ${DISPLAY_NAME} AS client_name,
  i.number, i.number_year, i.number_seq, i.currency, i.language, i.title,
  i.recipient_name, i.recipient_company, i.recipient_address, i.recipient_country_code,
  i.recipient_email, i.recipient_vat_id,
  i.service_date_from::text AS service_date_from, i.service_date_to::text AS service_date_to,
  i.payment_terms_days, i.issue_date::text AS issue_date, i.due_date::text AS due_date,
  i.discount_type, i.discount_value, i.tax_mode, i.reverse_charge, i.allow_bank, i.allow_stripe,
  i.notes, i.internal_note, i.fx,
  i.subtotal_minor, i.discount_minor, i.net_minor, i.tax_minor, i.total_minor,
  i.paid_minor, i.refunded_minor, i.snapshot,
  i.cancels_invoice_id, i.replaces_invoice_id, i.subscription_id,
  i.period_start::text AS period_start, i.period_end::text AS period_end,
  i.stripe_checkout_session_id, i.stripe_checkout_url, i.stripe_checkout_expires_at,
  i.collection_failed_at, i.inbox_draft_id, i.sent_at, i.issued_at, i.cancelled_at, i.cancel_reason,
  i.revision, i.created_at, i.updated_at`

/**
 * The payment state as SQL, so a list can filter by it. `$today` is Berlin's
 * calendar day. Mirrors `paymentStateOf` in `invoice.money.ts`; the tests
 * check that the two agree.
 */
export const paymentStateSql = (today: string): string => `CASE
  WHEN i.kind = 'cancellation' OR i.status = 'draft' THEN 'not_applicable'
  WHEN i.status = 'cancelled' THEN 'cancelled'
  WHEN i.total_minor - i.paid_minor + i.refunded_minor <= 0 THEN 'paid'
  WHEN i.collection_failed_at IS NOT NULL
    OR (CASE WHEN EXISTS (SELECT 1 FROM v2_invoice_installments s WHERE s.invoice_id = i.id)
          THEN (SELECT coalesce(sum(s.amount_minor), 0) FROM v2_invoice_installments s
                 WHERE s.invoice_id = i.id AND s.due_date < ${today}::date)
          ELSE CASE WHEN i.due_date < ${today}::date THEN i.total_minor ELSE 0 END
        END) > i.paid_minor - i.refunded_minor
    THEN 'overdue'
  WHEN i.paid_minor - i.refunded_minor > 0 THEN 'partially_paid'
  ELSE 'unpaid'
END`

export const findInvoice = async (id: string): Promise<InvoiceRow | null> => {
  const { rows } = await getDb().query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS} FROM v2_invoices i WHERE i.id = $1`,
    [id],
  )

  return rows[0] ?? null
}

/** The same row, locked until the transaction ends. */
export const lockInvoice = async (id: string): Promise<InvoiceRow | null> => {
  const { rows } = await getDb().query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS} FROM v2_invoices i WHERE i.id = $1 FOR UPDATE OF i`,
    [id],
  )

  return rows[0] ?? null
}

export type DraftColumns = {
  client_id: string
  currency: Currency
  language: DocumentLanguage
  title: string
  recipient_name: string
  recipient_company: string
  recipient_address: string
  recipient_country_code: string
  recipient_email: string
  recipient_vat_id: string
  service_date_from: string | null
  service_date_to: string | null
  payment_terms_days: number
  discount_type: DiscountType
  discount_value: number
  tax_mode: TaxMode
  reverse_charge: boolean
  allow_bank: boolean
  allow_stripe: boolean
  notes: string
  internal_note: string
  fx: Record<string, unknown> | null
}

export const insertInvoice = async (
  input: DraftColumns & {
    mode: InvoiceMode
    subscription_id?: string | null
    period_start?: string | null
    period_end?: string | null
    replaces_invoice_id?: string | null
  },
): Promise<string> => {
  const columns = Object.keys(input)
  const values = columns.map((key) => {
    const value = (input as Record<string, unknown>)[key]

    return key === 'fx' && value !== null && value !== undefined ? JSON.stringify(value) : value
  })

  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_invoices (${columns.join(', ')})
     VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})
     RETURNING id`,
    values,
  )

  return rows[0]!.id
}

/** Writes a draft's editable columns and moves its revision on by one. */
export const writeDraft = async (id: string, fields: Partial<DraftColumns>): Promise<void> => {
  const keys = Object.keys(fields)
  const values = keys.map((key) => {
    const value = (fields as Record<string, unknown>)[key]

    return key === 'fx' && value !== null && value !== undefined ? JSON.stringify(value) : value
  })
  const sets = keys.map((key, index) => `${key} = $${index + 2}`)

  await getDb().query(
    `UPDATE v2_invoices
        SET ${[...sets, 'revision = revision + 1', 'updated_at = CURRENT_TIMESTAMP'].join(', ')}
      WHERE id = $1 AND status = 'draft'`,
    [id, ...values],
  )
}

export const writeTotals = async (
  id: string,
  totals: { subtotal: number; discount: number; net: number; tax: number; total: number },
): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoices
        SET subtotal_minor = $2, discount_minor = $3, net_minor = $4, tax_minor = $5, total_minor = $6
      WHERE id = $1 AND status = 'draft'`,
    [id, totals.subtotal, totals.discount, totals.net, totals.tax, totals.total],
  )
}

export const deleteDraftRow = async (id: string): Promise<void> => {
  await getDb().query(`DELETE FROM v2_invoices WHERE id = $1 AND status = 'draft'`, [id])
}

/**
 * Takes the next number for this mode and year.
 *
 * The counter row is created if missing and then locked with `FOR UPDATE`, so
 * two issuing transactions queue on it: the second reads the first's number
 * only after the first commits (or rolls back, returning it unused). That is
 * what keeps the sequence gapless. The unique index on
 * `(mode, number_year, number_seq)` is the last line if anything else slips.
 */
export const takeNumber = async (mode: InvoiceMode, year: number): Promise<number> => {
  const db = getDb()

  await db.query(
    `INSERT INTO v2_invoice_number_counters (mode, year) VALUES ($1, $2)
     ON CONFLICT (mode, year) DO NOTHING`,
    [mode, year],
  )

  const { rows } = await db.query<{ last_number: number }>(
    `SELECT last_number FROM v2_invoice_number_counters WHERE mode = $1 AND year = $2 FOR UPDATE`,
    [mode, year],
  )
  const next = Number(rows[0]!.last_number) + 1

  await db.query(
    `UPDATE v2_invoice_number_counters SET last_number = $3 WHERE mode = $1 AND year = $2`,
    [mode, year, next],
  )

  return next
}

export const markIssued = async (input: {
  id: string
  number: string
  year: number
  seq: number
  issueDate: string
  dueDate: string | null
  serviceDateFrom: string | null
  serviceDateTo: string | null
  taxMode: TaxMode
  snapshot: unknown
  totals: { subtotal: number; discount: number; net: number; tax: number; total: number }
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoices
        SET status = 'issued', number = $2, number_year = $3, number_seq = $4,
            issue_date = $5, due_date = $6, service_date_from = $7, service_date_to = $8,
            tax_mode = $9, snapshot = $10,
            subtotal_minor = $11, discount_minor = $12, net_minor = $13, tax_minor = $14, total_minor = $15,
            issued_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'draft'`,
    [
      input.id,
      input.number,
      input.year,
      input.seq,
      input.issueDate,
      input.dueDate,
      input.serviceDateFrom,
      input.serviceDateTo,
      input.taxMode,
      JSON.stringify(input.snapshot),
      input.totals.subtotal,
      input.totals.discount,
      input.totals.net,
      input.totals.tax,
      input.totals.total,
    ],
  )
}

export const insertCancellation = async (input: {
  original: InvoiceRow
  number: string
  year: number
  seq: number
  issueDate: string
  snapshot: unknown
}): Promise<string> => {
  const o = input.original
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_invoices
       (mode, kind, status, client_id, number, number_year, number_seq, currency, language, title,
        recipient_name, recipient_company, recipient_address, recipient_country_code, recipient_email,
        recipient_vat_id, service_date_from, service_date_to, payment_terms_days, issue_date, due_date,
        discount_type, discount_value, tax_mode, reverse_charge, allow_bank, allow_stripe,
        subtotal_minor, discount_minor, net_minor, tax_minor, total_minor, snapshot,
        cancels_invoice_id, subscription_id, period_start, period_end, issued_at)
     VALUES ($1, 'cancellation', 'issued', $2, $3, $4, $5, $6, $7, $8,
             $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NULL,
             $19, $20, $21, $22, false, false,
             $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, CURRENT_TIMESTAMP)
     RETURNING id`,
    [
      o.mode,
      o.client_id,
      input.number,
      input.year,
      input.seq,
      o.currency,
      o.language,
      o.title,
      o.recipient_name,
      o.recipient_company,
      o.recipient_address,
      o.recipient_country_code,
      o.recipient_email,
      o.recipient_vat_id,
      o.service_date_from,
      o.service_date_to,
      o.payment_terms_days,
      input.issueDate,
      o.discount_type,
      o.discount_value,
      o.tax_mode,
      o.reverse_charge,
      -Number(o.subtotal_minor),
      -Number(o.discount_minor),
      -Number(o.net_minor),
      -Number(o.tax_minor),
      -Number(o.total_minor),
      JSON.stringify(input.snapshot),
      o.id,
      o.subscription_id,
      o.period_start,
      o.period_end,
    ],
  )

  return rows[0]!.id
}

export const markCancelled = async (id: string, reason: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoices
        SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancel_reason = $2,
            stripe_checkout_url = NULL, stripe_checkout_session_id = NULL, stripe_checkout_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'issued' AND kind = 'invoice'`,
    [id, reason],
  )
}

export const findCancellationOf = async (invoiceId: string): Promise<InvoiceRow | null> => {
  const { rows } = await getDb().query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS} FROM v2_invoices i WHERE i.cancels_invoice_id = $1`,
    [invoiceId],
  )

  return rows[0] ?? null
}

export const findReplacementOf = async (invoiceId: string): Promise<InvoiceRow | null> => {
  const { rows } = await getDb().query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS} FROM v2_invoices i WHERE i.replaces_invoice_id = $1
      ORDER BY i.created_at, i.id LIMIT 1`,
    [invoiceId],
  )

  return rows[0] ?? null
}

export const numberOf = async (id: string | null): Promise<{ id: string; number: string | null } | null> => {
  if (!id) return null

  const { rows } = await getDb().query<{ id: string; number: string | null }>(
    'SELECT id, number FROM v2_invoices WHERE id = $1',
    [id],
  )

  return rows[0] ?? null
}

export const setMoney = async (id: string, delta: { paid?: number; refunded?: number }): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoices
        SET paid_minor = paid_minor + $2, refunded_minor = refunded_minor + $3,
            -- a stale Checkout link would ask for the old balance
            stripe_checkout_url = NULL, stripe_checkout_session_id = NULL, stripe_checkout_expires_at = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, delta.paid ?? 0, delta.refunded ?? 0],
  )
}

export const setCollectionFailed = async (id: string, failed: boolean): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoices
        SET collection_failed_at = CASE WHEN $2 THEN COALESCE(collection_failed_at, CURRENT_TIMESTAMP) ELSE NULL END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, failed],
  )
}

export const setCheckout = async (input: {
  id: string
  sessionId: string
  url: string
  expiresAt: Date | null
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoices
        SET stripe_checkout_session_id = $2, stripe_checkout_url = $3, stripe_checkout_expires_at = $4,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [input.id, input.sessionId, input.url, input.expiresAt],
  )
}

export const setSent = async (id: string, inboxDraftId: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoices SET inbox_draft_id = $2, sent_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [id, inboxDraftId],
  )
}

/** The recipient on this Client's most recent invoice, to prefill the next. */
export const lastRecipientFor = async (clientId: string): Promise<InvoiceRow | null> => {
  const { rows } = await getDb().query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS} FROM v2_invoices i
      WHERE i.client_id = $1 AND i.kind = 'invoice' AND i.recipient_address <> ''
      ORDER BY i.created_at DESC, i.id DESC LIMIT 1`,
    [clientId],
  )

  return rows[0] ?? null
}

/* -------------------------------------------------------------------- lists */

const likePattern = (text: string): string => `%${text.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`

export const listInvoices = async (
  query: InvoiceListQuery,
  today: string,
): Promise<{ rows: InvoiceRow[]; total: number }> => {
  const where: string[] = []
  const values: unknown[] = []
  const add = (value: unknown): string => {
    values.push(value)

    return `$${values.length}`
  }
  const todayParam = add(today)
  const state = paymentStateSql(todayParam)

  // Always referenced, so the count and the page take the same parameters.
  where.push(`${todayParam}::date IS NOT NULL`)

  if (query.mode !== 'all') where.push(`i.mode = ${add(query.mode)}`)
  if (query.kind !== 'all') where.push(`i.kind = ${add(query.kind)}`)
  if (query.clientId) where.push(`i.client_id = ${add(query.clientId)}`)
  if (query.subscriptionId) where.push(`i.subscription_id = ${add(query.subscriptionId)}`)
  if (query.year) where.push(`i.number_year = ${add(query.year)}`)

  if (query.status === 'draft' || query.status === 'issued' || query.status === 'cancelled') {
    where.push(`i.status = ${add(query.status)}`)
  } else if (query.status !== 'all') {
    where.push(`(${state}) = ${add(query.status)}`)
  }

  if (query.search !== '') {
    const pattern = add(likePattern(query.search))

    where.push(
      `(i.number ILIKE ${pattern} OR i.recipient_name ILIKE ${pattern} OR i.recipient_company ILIKE ${pattern}
        OR i.title ILIKE ${pattern} OR ${DISPLAY_NAME} ILIKE ${pattern})`,
    )
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string | number }>(
    `SELECT count(*) AS total FROM v2_invoices i ${clause}`,
    values,
  )
  const limit = add(query.pageSize)
  const offset = add((query.page - 1) * query.pageSize)

  // Newest first; the id breaks ties so a page boundary never moves.
  const { rows } = await db.query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS}, (${state}) AS payment_state
       FROM v2_invoices i ${clause}
      ORDER BY i.created_at DESC, i.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

/* ------------------------------------------------------ lines, installments */

export type LineRow = {
  position: number
  description: string
  unit: string
  quantity_milli: number | string
  unit_price_minor: number | string
  tax_rate_bp: number | null
  service_id: string | null
  service_name: string | null
  service_price_minor: number | string | null
}

export const linesOf = async (invoiceId: string): Promise<LineRow[]> => {
  const { rows } = await getDb().query<LineRow>(
    `SELECT position, description, unit, quantity_milli, unit_price_minor, tax_rate_bp,
            service_id, service_name, service_price_minor
       FROM v2_invoice_lines WHERE invoice_id = $1 ORDER BY position`,
    [invoiceId],
  )

  return rows
}

export const replaceLines = async (
  invoiceId: string,
  lines: Array<{
    description: string
    unit: string
    quantityMilli: number
    unitPriceMinor: number
    taxRateBp: number | null
    serviceId: string | null
    serviceName: string | null
    servicePriceMinor: number | null
  }>,
): Promise<void> => {
  const db = getDb()

  await db.query('DELETE FROM v2_invoice_lines WHERE invoice_id = $1', [invoiceId])

  for (const [position, line] of lines.entries()) {
    await db.query(
      `INSERT INTO v2_invoice_lines
         (invoice_id, position, description, unit, quantity_milli, unit_price_minor, tax_rate_bp,
          service_id, service_name, service_price_minor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        invoiceId,
        position,
        line.description,
        line.unit,
        line.quantityMilli,
        line.unitPriceMinor,
        line.taxRateBp,
        line.serviceId,
        line.serviceName,
        line.servicePriceMinor,
      ],
    )
  }
}

export type InstallmentRow = {
  position: number
  due_date: string
  amount_minor: number | string
  label: string
}

export const installmentsOf = async (invoiceId: string): Promise<InstallmentRow[]> => {
  const { rows } = await getDb().query<InstallmentRow>(
    `SELECT position, due_date::text AS due_date, amount_minor, label
       FROM v2_invoice_installments WHERE invoice_id = $1 ORDER BY position`,
    [invoiceId],
  )

  return rows
}

export const replaceInstallments = async (
  invoiceId: string,
  installments: Array<{ dueDate: string; amountMinor: number; label: string }>,
): Promise<void> => {
  const db = getDb()

  await db.query('DELETE FROM v2_invoice_installments WHERE invoice_id = $1', [invoiceId])

  for (const [position, part] of installments.entries()) {
    await db.query(
      `INSERT INTO v2_invoice_installments (invoice_id, position, due_date, amount_minor, label)
       VALUES ($1, $2, $3, $4, $5)`,
      [invoiceId, position, part.dueDate, part.amountMinor, part.label],
    )
  }
}

/* --------------------------------------------------------- payments, refunds */

export type PaymentRow = {
  id: string
  invoice_id: string
  method: PaymentMethod
  amount_minor: number | string
  currency: Currency
  paid_on: string
  reference: string
  note: string
  idempotency_key: string | null
  stripe_event_id: string | null
  stripe_payment_intent_id: string | null
  voided_at: Date | null
  void_reason: string
  created_at: Date
  has_receipt?: boolean
  /** Joined on the global list. */
  invoice_number?: string | null
  invoice_mode?: InvoiceMode
}

const PAYMENT_COLUMNS = `p.id, p.invoice_id, p.method, p.amount_minor, p.currency, p.paid_on::text AS paid_on,
  p.reference, p.note, p.idempotency_key, p.stripe_event_id, p.stripe_payment_intent_id,
  p.voided_at, p.void_reason, p.created_at,
  EXISTS (SELECT 1 FROM v2_invoice_files f WHERE f.payment_id = p.id) AS has_receipt`

export const paymentsOf = async (invoiceId: string): Promise<PaymentRow[]> => {
  const { rows } = await getDb().query<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS} FROM v2_invoice_payments p
      WHERE p.invoice_id = $1 ORDER BY p.paid_on, p.created_at, p.id LIMIT 500`,
    [invoiceId],
  )

  return rows
}

export const findPayment = async (id: string): Promise<PaymentRow | null> => {
  const { rows } = await getDb().query<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS} FROM v2_invoice_payments p WHERE p.id = $1`,
    [id],
  )

  return rows[0] ?? null
}

export const findPaymentByKey = async (key: string): Promise<PaymentRow | null> => {
  const { rows } = await getDb().query<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS} FROM v2_invoice_payments p WHERE p.idempotency_key = $1`,
    [key],
  )

  return rows[0] ?? null
}

export const findPaymentByIntent = async (intentId: string): Promise<PaymentRow | null> => {
  const { rows } = await getDb().query<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS} FROM v2_invoice_payments p WHERE p.stripe_payment_intent_id = $1`,
    [intentId],
  )

  return rows[0] ?? null
}

export const insertPayment = async (input: {
  invoiceId: string
  method: PaymentMethod
  amountMinor: number
  currency: Currency
  paidOn: string
  reference: string
  note: string
  idempotencyKey: string | null
  stripeEventId: string | null
  stripePaymentIntentId: string | null
}): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_invoice_payments
       (invoice_id, method, amount_minor, currency, paid_on, reference, note, idempotency_key,
        stripe_event_id, stripe_payment_intent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id`,
    [
      input.invoiceId,
      input.method,
      input.amountMinor,
      input.currency,
      input.paidOn,
      input.reference,
      input.note,
      input.idempotencyKey,
      input.stripeEventId,
      input.stripePaymentIntentId,
    ],
  )

  return rows[0]!.id
}

export const voidPaymentRow = async (id: string, reason: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_invoice_payments SET voided_at = CURRENT_TIMESTAMP, void_reason = $2
      WHERE id = $1 AND voided_at IS NULL`,
    [id, reason],
  )
}

export const listPayments = async (input: {
  mode: InvoiceMode
  limit: number
  offset: number
}): Promise<{ rows: PaymentRow[]; total: number }> => {
  const db = getDb()
  const { rows: counted } = await db.query<{ total: number | string }>(
    `SELECT count(*) AS total FROM v2_invoice_payments p
       JOIN v2_invoices i ON i.id = p.invoice_id WHERE i.mode = $1`,
    [input.mode],
  )
  const { rows } = await db.query<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS}, i.number AS invoice_number, i.mode AS invoice_mode
       FROM v2_invoice_payments p JOIN v2_invoices i ON i.id = p.invoice_id
      WHERE i.mode = $1
      ORDER BY p.paid_on DESC, p.created_at DESC, p.id DESC
      LIMIT $2 OFFSET $3`,
    [input.mode, input.limit, input.offset],
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

export type RefundRow = {
  id: string
  invoice_id: string
  method: RefundMethod
  amount_minor: number | string
  currency: Currency
  refunded_on: string
  note: string
  idempotency_key: string | null
  created_at: Date
}

const REFUND_COLUMNS = `r.id, r.invoice_id, r.method, r.amount_minor, r.currency,
  r.refunded_on::text AS refunded_on, r.note, r.idempotency_key, r.created_at`

export const refundsOf = async (invoiceId: string): Promise<RefundRow[]> => {
  const { rows } = await getDb().query<RefundRow>(
    `SELECT ${REFUND_COLUMNS} FROM v2_invoice_refunds r
      WHERE r.invoice_id = $1 ORDER BY r.refunded_on, r.created_at, r.id LIMIT 500`,
    [invoiceId],
  )

  return rows
}

export const findRefundByKey = async (key: string): Promise<RefundRow | null> => {
  const { rows } = await getDb().query<RefundRow>(
    `SELECT ${REFUND_COLUMNS} FROM v2_invoice_refunds r WHERE r.idempotency_key = $1`,
    [key],
  )

  return rows[0] ?? null
}

export const insertRefund = async (input: {
  invoiceId: string
  method: RefundMethod
  amountMinor: number
  currency: Currency
  refundedOn: string
  note: string
  idempotencyKey: string
}): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_invoice_refunds (invoice_id, method, amount_minor, currency, refunded_on, note, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      input.invoiceId,
      input.method,
      input.amountMinor,
      input.currency,
      input.refundedOn,
      input.note,
      input.idempotencyKey,
    ],
  )

  return rows[0]!.id
}

/* -------------------------------------------------------------------- files */

export type FileRow = {
  id: string
  invoice_id: string
  kind: 'document' | 'receipt'
  language: DocumentLanguage
  payment_id: string | null
  asset_id: string
}

export const filesOf = async (invoiceId: string): Promise<FileRow[]> => {
  const { rows } = await getDb().query<FileRow>(
    `SELECT id, invoice_id, kind, language, payment_id, asset_id
       FROM v2_invoice_files WHERE invoice_id = $1 ORDER BY created_at, id`,
    [invoiceId],
  )

  return rows
}

export const findDocumentFile = async (
  invoiceId: string,
  language: DocumentLanguage,
): Promise<FileRow | null> => {
  const { rows } = await getDb().query<FileRow>(
    `SELECT id, invoice_id, kind, language, payment_id, asset_id
       FROM v2_invoice_files WHERE invoice_id = $1 AND kind = 'document' AND language = $2`,
    [invoiceId, language],
  )

  return rows[0] ?? null
}

export const findReceiptFile = async (
  paymentId: string,
  language: DocumentLanguage,
): Promise<FileRow | null> => {
  const { rows } = await getDb().query<FileRow>(
    `SELECT id, invoice_id, kind, language, payment_id, asset_id
       FROM v2_invoice_files WHERE payment_id = $1 AND kind = 'receipt' AND language = $2`,
    [paymentId, language],
  )

  return rows[0] ?? null
}

/** Records a stored file; `false` when another request stored it first. */
export const insertFile = async (input: {
  invoiceId: string
  kind: 'document' | 'receipt'
  language: DocumentLanguage
  paymentId: string | null
  assetId: string
}): Promise<boolean> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_invoice_files (invoice_id, kind, language, payment_id, asset_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [input.invoiceId, input.kind, input.language, input.paymentId, input.assetId],
  )

  return rows.length > 0
}

/* ------------------------------------------------------------------- events */

export const recordEvent = async (input: {
  invoiceId?: string | null
  subscriptionId?: string | null
  kind: string
  detail?: Record<string, unknown>
}): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_invoice_events (invoice_id, subscription_id, kind, detail) VALUES ($1, $2, $3, $4)`,
    [input.invoiceId ?? null, input.subscriptionId ?? null, input.kind, JSON.stringify(input.detail ?? {})],
  )
}

/* ------------------------------------------------------------------ export */

/** Every live document issued in a year: invoices, cancelled ones, and Storno. */
export const liveDocumentsOfYear = async (year: number): Promise<InvoiceRow[]> => {
  const { rows } = await getDb().query<InvoiceRow>(
    `SELECT ${INVOICE_COLUMNS} FROM v2_invoices i
      WHERE i.mode = 'live' AND i.status <> 'draft'
        AND i.issue_date >= make_date($1, 1, 1) AND i.issue_date < make_date($1 + 1, 1, 1)
      ORDER BY i.number_seq, i.id`,
    [year],
  )

  return rows
}

export const livePaymentsOfYear = async (year: number): Promise<PaymentRow[]> => {
  const { rows } = await getDb().query<PaymentRow>(
    `SELECT ${PAYMENT_COLUMNS}, i.number AS invoice_number, i.mode AS invoice_mode
       FROM v2_invoice_payments p JOIN v2_invoices i ON i.id = p.invoice_id
      WHERE i.mode = 'live' AND p.paid_on >= make_date($1, 1, 1) AND p.paid_on < make_date($1 + 1, 1, 1)
      ORDER BY p.paid_on, p.created_at, p.id`,
    [year],
  )

  return rows
}

export const liveRefundsOfYear = async (year: number): Promise<Array<RefundRow & { invoice_number: string }>> => {
  const { rows } = await getDb().query<RefundRow & { invoice_number: string }>(
    `SELECT ${REFUND_COLUMNS}, i.number AS invoice_number
       FROM v2_invoice_refunds r JOIN v2_invoices i ON i.id = r.invoice_id
      WHERE i.mode = 'live' AND r.refunded_on >= make_date($1, 1, 1) AND r.refunded_on < make_date($1 + 1, 1, 1)
      ORDER BY r.refunded_on, r.created_at, r.id`,
    [year],
  )

  return rows
}
