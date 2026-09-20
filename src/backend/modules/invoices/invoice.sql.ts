import { toInt, toIso, toIsoRequired } from '#/backend/modules/inbox/inbox.sql'
import type { Client, InvoiceLine, InvoiceRow, Payment } from '#/shared/types/invoice.types'
import {
  settlementOf,
  type InvoiceKind,
  type InvoiceLanguage,
  type InvoiceStatus,
  type MoneyKind,
  type PaymentMethod,
} from '#/shared/validation/invoice.validation'

export { toInt, toIso, toIsoRequired }

/**
 * Today, where he lives.
 *
 * `CURRENT_DATE` on a Worker is today in UTC, which is yesterday in Erfurt for
 * two hours every night. An invoice that becomes overdue at 02:00 — or a
 * payment that lands in last month because it was recorded late in the
 * evening — is wrong in the only way a money screen must never be wrong. Same
 * constant, same reason, as `lead.sql.ts`.
 */
export const TODAY = `((CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Berlin')::date)`

/**
 * A `date` column crosses the wire as the ten characters he picked.
 *
 * `pg` turns a `date` into a `Date` at the server's midnight, and an ISO
 * string of that lands on the day before for anyone east of the server. Money
 * dates decide which month a figure counts in, so this is not cosmetic.
 */
export const DATE_TEXT = (column: string) => `to_char(${column}, 'YYYY-MM-DD')`

/** Money still owed: issued, not voided. A draft owes nothing; a cancelled one never did. */
export const OWING = `i.status = 'ISSUED'`

/**
 * What one invoice has been settled by, as a scalar subquery.
 *
 * A subquery rather than a join with `GROUP BY`: the list already groups by
 * nothing, and a join over `payments` would multiply rows the moment an
 * invoice has two of them — which is the normal case here, not the exception.
 */
export const PAID_CENTS = `(SELECT COALESCE(SUM(p.amount_cents), 0)
        FROM payments p WHERE p.invoice_id = i.id)`

/**
 * The name to draw on a row.
 *
 * The company when there is one, the person otherwise — the same rule the
 * address block on the paper follows, written once so the list and the PDF can
 * never disagree about what a client is called.
 */
export const CLIENT_NAME = `NULLIF(btrim(c.company), '')`

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

export type ClientShape = {
  id: string
  lead_id: string | null
  company: string
  contact_name: string
  email: string
  phone: string
  street: string
  street_extra: string
  postcode: string
  city: string
  country: string
  vat_id: string
  language: InvoiceLanguage
  notes: string
  created_at: Date
  invoice_count?: number | string
  open_cents?: number | string
}

export const CLIENT_COLUMNS = `c.id, c.lead_id, c.company, c.contact_name, c.email, c.phone,
        c.street, c.street_extra, c.postcode, c.city, c.country, c.vat_id,
        c.language, c.notes, c.created_at`

/**
 * The same columns, renamed, for a query that also selects from `invoices`.
 *
 * `pg` returns one object per row and keeps the **last** value for a repeated
 * column name. `invoices` and `clients` both have `id`, `language` and
 * `notes`, so selecting both bare handed back the client's id as the invoice's
 * id — a bug that looked like nothing until a draft could not be found by the
 * id it had just reported. Aliasing is the only fix that cannot come back.
 */
export const CLIENT_COLUMNS_ALIASED = `c.id AS cl_id, c.lead_id AS cl_lead_id,
        c.company AS cl_company, c.contact_name AS cl_contact_name,
        c.email AS cl_email, c.phone AS cl_phone, c.street AS cl_street,
        c.street_extra AS cl_street_extra, c.postcode AS cl_postcode,
        c.city AS cl_city, c.country AS cl_country, c.vat_id AS cl_vat_id,
        c.language AS cl_language, c.notes AS cl_notes, c.created_at AS cl_created_at`

export type ClientAliasedShape = {
  cl_id: string
  cl_lead_id: string | null
  cl_company: string
  cl_contact_name: string
  cl_email: string
  cl_phone: string
  cl_street: string
  cl_street_extra: string
  cl_postcode: string
  cl_city: string
  cl_country: string
  cl_vat_id: string
  cl_language: InvoiceLanguage
  cl_notes: string
  cl_created_at: Date
}

/** Back to the shape `projectClient` reads, so there is one projection only. */
export const unaliasClient = (row: ClientAliasedShape): ClientShape => ({
  id: row.cl_id,
  lead_id: row.cl_lead_id,
  company: row.cl_company,
  contact_name: row.cl_contact_name,
  email: row.cl_email,
  phone: row.cl_phone,
  street: row.cl_street,
  street_extra: row.cl_street_extra,
  postcode: row.cl_postcode,
  city: row.cl_city,
  country: row.cl_country,
  vat_id: row.cl_vat_id,
  language: row.cl_language,
  notes: row.cl_notes,
  created_at: row.cl_created_at,
})

export const projectClient = (row: ClientShape): Client => ({
  id: row.id,
  leadId: row.lead_id,
  company: row.company,
  contactName: row.contact_name,
  email: row.email,
  phone: row.phone,
  street: row.street,
  streetExtra: row.street_extra,
  postcode: row.postcode,
  city: row.city,
  country: row.country,
  vatId: row.vat_id,
  language: row.language,
  notes: row.notes,
  createdAt: toIsoRequired(row.created_at),
  invoiceCount: toInt(row.invoice_count ?? 0),
  openCents: toInt(row.open_cents ?? 0),
})

/** The name a human uses for this client — company first, person otherwise. */
export const clientLabel = (client: Pick<Client, 'company' | 'contactName'>): string =>
  client.company.trim() || client.contactName.trim() || 'Unnamed client'

/* -------------------------------------------------------------------------- */
/* Invoices                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How many letters really carried this invoice, and when the last one left.
 *
 * A file linked to an outgoing message is the only evidence this system
 * accepts that something was sent. `invoices.sent_at` was a column until
 * `0018` and nothing wrote it once sending moved to the inbox — so rather than
 * a flag somebody sets, "sent" is a join nobody can forget to keep true.
 */
const SENT_LETTERS = `FROM lead_attachments a
         JOIN lead_messages m ON m.id = a.message_id
        WHERE a.invoice_id = i.id AND m.direction = 'OUT'`

export const LETTERS_COUNT = `(SELECT COUNT(*) ${SENT_LETTERS})`
export const LETTERS_LAST = `(SELECT MAX(m.sent_at) ${SENT_LETTERS})`

export type InvoiceRowShape = {
  id: string
  number: string | null
  kind: InvoiceKind
  status: InvoiceStatus
  money_kind: MoneyKind
  client_id: string
  client_name: string
  first_line: string | null
  issued_on: string | null
  due_on: string | null
  total_cents: number | string
  paid_cents: number | string
  currency: string
  pdf_key: string | null
  letter_count: number | string
  last_letter_at: Date | null
  subscription_id: string | null
  today: string
}

/**
 * Every column a row of the list needs, spelled the same way everywhere.
 *
 * `today` rides along on each row rather than being taken from the server's
 * clock in JavaScript. The database already knows what day it is in Berlin,
 * and asking it once per query is cheaper than being wrong for two hours a
 * night on a Worker that has no idea where its reader lives.
 */
export const INVOICE_ROW_COLUMNS = `i.id, i.number, i.kind, i.status, i.money_kind,
        i.client_id,
        COALESCE(${CLIENT_NAME}, c.contact_name) AS client_name,
        (SELECT l.description FROM invoice_lines l
          WHERE l.invoice_id = i.id ORDER BY l.position LIMIT 1) AS first_line,
        ${DATE_TEXT('i.issued_on')} AS issued_on,
        ${DATE_TEXT('i.due_on')} AS due_on,
        i.total_cents, ${PAID_CENTS} AS paid_cents, i.currency,
        i.pdf_key,
        ${LETTERS_COUNT} AS letter_count,
        ${LETTERS_LAST} AS last_letter_at,
        i.subscription_id,
        ${DATE_TEXT(TODAY)} AS today`

const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)

export const projectRow = (row: InvoiceRowShape): InvoiceRow => {
  const totalCents = toInt(row.total_cents)
  const paidCents = toInt(row.paid_cents)

  const settlement = settlementOf({
    status: row.status,
    kind: row.kind,
    dueOn: row.due_on,
    totalCents,
    paidCents,
    today: row.today,
  })

  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    settlement,
    moneyKind: row.money_kind,
    clientId: row.client_id,
    clientName: row.client_name || 'Unnamed client',
    title: row.first_line ?? '',
    issuedOn: row.issued_on,
    dueOn: row.due_on,
    totalCents,
    paidCents,
    currency: row.currency,
    // Only ever a positive number of days, and only for something still owed.
    // "Late by -3 days" is not a thing anyone says.
    daysLate:
      settlement === 'OVERDUE' || settlement === 'PART'
        ? Math.max(0, row.due_on ? daysBetween(row.due_on, row.today) : 0)
        : 0,
    hasPdf: Boolean(row.pdf_key),
    letterCount: toInt(row.letter_count),
    lastLetterAt: toIso(row.last_letter_at),
    fromSubscription: row.subscription_id !== null,
  }
}

/* -------------------------------------------------------------------------- */
/* Lines and payments                                                         */
/* -------------------------------------------------------------------------- */

export type LineShape = {
  id: string
  position: number
  description: string
  detail: string
  quantity: string | number
  unit_cents: number | string
  tax_rate: string | number
}

export const projectLine = (row: LineShape): InvoiceLine => {
  const quantity = Number(row.quantity)
  const unitCents = toInt(row.unit_cents)

  return {
    id: row.id,
    position: row.position,
    description: row.description,
    detail: row.detail,
    quantity,
    unitCents,
    taxRate: Number(row.tax_rate),
    // Rounded here, once, by the same rule `totalsOf` uses — so the line on
    // the screen, the line on the paper and the stored total agree.
    netCents: Math.round(quantity * unitCents),
  }
}

export type PaymentShape = {
  id: string
  amount_cents: number | string
  method: PaymentMethod
  received_on: string
  reference: string
  note: string
  created_at: Date
}

export const projectPayment = (row: PaymentShape): Payment => ({
  id: row.id,
  amountCents: toInt(row.amount_cents),
  method: row.method,
  receivedOn: row.received_on,
  reference: row.reference,
  note: row.note,
  createdAt: toIsoRequired(row.created_at),
})
