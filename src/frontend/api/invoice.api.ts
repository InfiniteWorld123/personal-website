import type {
  Client,
  Invoice,
  InvoiceLetter,
  InvoiceList,
  InvoiceSummary,
  PersonInvoice,
  SentLetter,
} from '#/shared/types/invoice.types'
import type {
  ClientWriteInput,
  CorrectionInput,
  InvoiceWriteInput,
  LetterKind,
  PaymentInput,
} from '#/shared/validation/invoice.validation'
import { api } from './client'
import { unwrap } from './response'

/**
 * Eden Treaty revives anything that parses as a date into a `Date`, so every
 * instant and every day arrives as an object even though the type says
 * `string` — the trap `booking.api.ts`, `inbox.api.ts` and `lead.api.ts` all
 * document. Rendering one throws "Objects are not valid as a React child".
 */
const toInstant = <T extends string | null>(value: T): T =>
  ((value as unknown) instanceof Date ? (value as unknown as Date).toISOString() : value) as T

/**
 * A **day** has to survive the same revival as a day.
 *
 * `2026-09-18` parses as midnight UTC, so the first ten characters of the ISO
 * string hand back exactly the day on the paper — while converting to local
 * time first would move an invoice issued on the 1st into the previous month
 * for anyone west of London, and the month is what every figure is grouped by.
 */
const toDay = <T extends string | null>(value: T): T =>
  ((value as unknown) instanceof Date
    ? (value as unknown as Date).toISOString().slice(0, 10)
    : value) as T

const normaliseClient = (client: Client): Client => ({
  ...client,
  createdAt: toInstant(client.createdAt),
})

const normaliseInvoice = (invoice: Invoice): Invoice => ({
  ...invoice,
  issuedOn: toDay(invoice.issuedOn),
  dueOn: toDay(invoice.dueOn),
  serviceFrom: toDay(invoice.serviceFrom),
  serviceTo: toDay(invoice.serviceTo),
  lastLetterAt: toInstant(invoice.lastLetterAt),
  client: normaliseClient(invoice.client),
  letters: invoice.letters.map((letter) => ({ ...letter, sentAt: toInstant(letter.sentAt) })),
  payments: invoice.payments.map((payment) => ({
    ...payment,
    receivedOn: toDay(payment.receivedOn),
    createdAt: toInstant(payment.createdAt),
  })),
})

const normaliseList = (list: InvoiceList): InvoiceList => ({
  ...list,
  rows: list.rows.map((row) => ({
    ...row,
    issuedOn: toDay(row.issuedOn),
    dueOn: toDay(row.dueOn),
    lastLetterAt: toInstant(row.lastLetterAt),
  })),
})

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

export async function fetchInvoices(settlement: string, search: string): Promise<InvoiceList> {
  return normaliseList(
    unwrap<InvoiceList>(
      await api().admin.invoices.get({ query: { settlement, search, limit: '300' } }),
    ),
  )
}

export async function fetchInvoice(invoiceId: string): Promise<Invoice> {
  return normaliseInvoice(unwrap<Invoice>(await api().admin.invoices({ invoiceId }).get()))
}

/**
 * Every letter that carried a document out of here, newest first.
 *
 * `sentAt` is an instant and arrives revived as a `Date`, like every other
 * instant on this side — rendering one straight into JSX throws.
 */
export async function fetchSentLetters(): Promise<SentLetter[]> {
  return unwrap<SentLetter[]>(await api().admin.invoices.letters.get()).map((letter) => ({
    ...letter,
    sentAt: toInstant(letter.sentAt),
  }))
}

export async function fetchSummary(): Promise<InvoiceSummary> {
  return unwrap<InvoiceSummary>(await api().admin.invoices.summary.get())
}

/**
 * Whether his own details in `seller.ts` are real yet — and whether what is
 * being printed right now is his, or the invented set.
 */
export async function fetchSellerState(): Promise<{
  ready: boolean
  gaps: string[]
  isTest: boolean
  smallBusiness: boolean
}> {
  return unwrap<{ ready: boolean; gaps: string[]; isTest: boolean; smallBusiness: boolean }>(
    await api().admin.invoices.seller.get(),
  )
}

export async function fetchClients(search: string): Promise<Client[]> {
  return unwrap<Client[]>(await api().admin.invoices.clients.get({ query: { search } })).map(
    normaliseClient,
  )
}

/**
 * This person's invoices, for the composer's attach panel.
 *
 * Scoped on the server. Nothing here filters a longer list, because a longer
 * list should never reach the browser in the first place.
 */
export async function fetchPersonInvoices(personId: string): Promise<PersonInvoice[]> {
  return unwrap<PersonInvoice[]>(
    await api().admin.invoices['for-person']({ personId }).get(),
  ).map((invoice) => ({
    ...invoice,
    issuedOn: toDay(invoice.issuedOn),
    lastSentAt: toInstant(invoice.lastSentAt),
  }))
}

/**
 * Puts one invoice's PDF in this person's files and hands back the file.
 *
 * A write, so it is a POST and never a prefetch: it copies bytes into the
 * conversation. Asking twice finds the copy the first call made rather than
 * piling up a second identical PDF.
 */
export async function attachInvoice(
  personId: string,
  invoiceId: string,
): Promise<{ id: string; filename: string; bytes: number }> {
  return unwrap<{ id: string; filename: string; bytes: number }>(
    await api().admin.invoices({ invoiceId }).attach({ personId }).post({}),
  )
}

/**
 * A letter, prepared for the inbox composer.
 *
 * Nothing is sent by calling this. The server resolves who it goes to, copies
 * the frozen PDF into that person's files and writes the words; the composer
 * opens on the result. Idempotent, so asking twice — a second click, a
 * refresh — finds the same person and the same attached file.
 */
export async function fetchLetter(invoiceId: string, kind: LetterKind): Promise<InvoiceLetter> {
  return unwrap<InvoiceLetter>(
    await api()
      .admin.invoices({ invoiceId })
      .letter.get({ query: { kind } }),
  )
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

export async function createClient(input: ClientWriteInput): Promise<Client> {
  return normaliseClient(unwrap<Client>(await api().admin.invoices.clients.post(input)))
}

/**
 * The client that a person in the inbox is, making one if they are not yet.
 *
 * His own suggestion, and the right one: most clients start as somebody who
 * wrote. The name, the address line they gave and their company come across, so
 * the only thing left to type is the postal address the law needs. Calling it
 * twice finds the client the first call made rather than creating a second.
 */
export async function clientFromLead(leadId: string): Promise<Client> {
  return normaliseClient(
    unwrap<Client>(await api().admin.invoices.clients['from-lead']({ leadId }).post({})),
  )
}

export async function updateClient(clientId: string, input: ClientWriteInput): Promise<Client> {
  return normaliseClient(
    unwrap<Client>(await api().admin.invoices.clients({ clientId }).put(input)),
  )
}

export async function deleteClient(clientId: string): Promise<void> {
  unwrap(await api().admin.invoices.clients({ clientId }).delete())
}

export async function createInvoice(input: InvoiceWriteInput): Promise<Invoice> {
  return normaliseInvoice(unwrap<Invoice>(await api().admin.invoices.post(input)))
}

export async function updateInvoice(
  invoiceId: string,
  input: InvoiceWriteInput,
): Promise<Invoice> {
  return normaliseInvoice(unwrap<Invoice>(await api().admin.invoices({ invoiceId }).put(input)))
}

export async function deleteInvoice(invoiceId: string): Promise<void> {
  unwrap(await api().admin.invoices({ invoiceId }).delete())
}

export async function issueInvoice(invoiceId: string): Promise<Invoice> {
  return normaliseInvoice(
    unwrap<Invoice>(await api().admin.invoices({ invoiceId }).issue.post({})),
  )
}

export async function correctInvoice(
  invoiceId: string,
  input: CorrectionInput,
): Promise<Invoice> {
  return normaliseInvoice(
    unwrap<Invoice>(await api().admin.invoices({ invoiceId }).correct.post(input)),
  )
}

export async function addPayment(invoiceId: string, input: PaymentInput): Promise<Invoice> {
  return normaliseInvoice(
    unwrap<Invoice>(await api().admin.invoices({ invoiceId }).payments.post(input)),
  )
}

export async function deletePayment(invoiceId: string, paymentId: string): Promise<Invoice> {
  return normaliseInvoice(
    unwrap<Invoice>(await api().admin.invoices({ invoiceId }).payments({ paymentId }).delete()),
  )
}

/**
 * Where the document lives.
 *
 * A plain URL rather than a fetch: the route answers with the PDF itself
 * behind the admin guard, so the browser can open it in a tab or hand it to
 * the print dialog without any of it passing through React.
 */
export const invoicePdfUrl = (invoiceId: string): string =>
  `/api/admin/invoices/${invoiceId}/pdf`
