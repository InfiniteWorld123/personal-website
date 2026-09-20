import type {
  InvoiceKind,
  InvoiceLanguage,
  InvoiceStatus,
  LetterKind,
  PaymentMethod,
  Settlement,
} from '#/shared/validation/invoice.validation'

/**
 * What crosses the wire.
 *
 * Money is integer cents everywhere on this side of the form. Dates that are
 * **days** — issued, due, received, the service period — are ten-character
 * strings, never instants: the day he picked has to survive a Worker in UTC
 * and a browser in Berlin without moving, and an ISO timestamp does not.
 */

export type Client = {
  id: string
  leadId: string | null
  company: string
  contactName: string
  email: string
  phone: string
  street: string
  streetExtra: string
  postcode: string
  city: string
  country: string
  vatId: string
  language: InvoiceLanguage
  notes: string
  createdAt: string
  /** What he has billed them, and what of it is still owed. */
  invoiceCount: number
  openCents: number
}

export type InvoiceLine = {
  id: string
  position: number
  description: string
  detail: string
  quantity: number
  unitCents: number
  taxRate: number
  /** `quantity × unitCents`, rounded once, on the server that will print it. */
  netCents: number
}

export type Payment = {
  id: string
  amountCents: number
  method: PaymentMethod
  receivedOn: string
  reference: string
  note: string
  createdAt: string
}

/** One row of the list — enough to draw it, not enough to print it. */
export type InvoiceRow = {
  id: string
  number: string | null
  kind: InvoiceKind
  status: InvoiceStatus
  settlement: Settlement
  clientId: string
  clientName: string
  title: string
  issuedOn: string | null
  dueOn: string | null
  totalCents: number
  paidCents: number
  currency: string
  /** Days past due, positive only. Zero when it is not late. */
  daysLate: number
  hasPdf: boolean
  /**
   * How many letters have actually carried this document, and when the last
   * one left.
   *
   * Counted from outgoing messages, not from a flag somebody set: `sent_at`
   * and `reminded_at` were columns until 18 Sep 2026 and nothing wrote them
   * once sending moved to the inbox. A letter that really went is the only
   * evidence this system accepts that something was sent.
   */
  letterCount: number
  lastLetterAt: string | null
  /**
   * True when a subscription wrote this rather than he did.
   *
   * On the row because a draft he did not create appearing in his list is
   * otherwise unexplained — he asked, in those words, how he could tell the
   * generator had run. This is the answer, on the invoice itself.
   */
  fromSubscription: boolean
}

export type Invoice = InvoiceRow & {
  client: Client
  dealId: string | null
  language: InvoiceLanguage
  serviceFrom: string | null
  serviceTo: string | null
  note: string
  netCents: number
  taxCents: number
  lines: InvoiceLine[]
  payments: Payment[]
  /** The document that corrected this one, and the one this corrects. */
  correctsId: string | null
  correctsNumber: string | null
  correctedBy: Array<{ id: string; number: string | null; kind: InvoiceKind }>
  /** Every letter that carried this document, newest first. */
  letters: Array<{ messageId: string; sentAt: string; subject: string }>
}

/**
 * The five figures he asked for, and the sixth he switched on.
 *
 * Every one is computed from rows in the same request. There is no cached
 * total anywhere in this system — the last panel he deleted had those, and he
 * could not trace any of them back to a fact.
 */
export type InvoiceSummary = {
  /** Still owed and past its due date. The reason to open this section. */
  overdueCents: number
  overdueCount: number
  /** Still owed, late or not. */
  openCents: number
  openCount: number
  /**
   * What actually reached him this month, counted by the day it arrived.
   * His switch, and also what his own tax return counts — the Zuflussprinzip.
   */
  thisMonthCents: number
  /**
   * What he has agreed to be paid every month, summed from the arrangements
   * themselves rather than from what he happens to have invoiced.
   *
   * Build money cannot reach it by construction: a row in `subscriptions`
   * **is** a subscription. Stronger than the `money_kind` flag this replaced,
   * which depended on him remembering to set it — see `0022`.
   */
  recurringCents: number
  currency: string
  /** The month these figures describe, as `YYYY-MM`. */
  month: string
}

/**
 * One letter that really left, carrying one document.
 *
 * The row of the sent register. Every field is read from the message and the
 * file it carried, never from a flag on the invoice: `sent_at` was a column
 * until 18 Sep 2026 and nothing wrote it once sending moved to the inbox.
 *
 * `attachmentId` is the file as the client received it — not the invoice's
 * current PDF, the copy that was attached to *this* letter. On a document
 * issued before a correction, those are the same bytes; the distinction still
 * matters, because the question this screen answers is "what did they get",
 * and only the copy can answer it.
 */
export type SentLetter = {
  attachmentId: string
  messageId: string
  sentAt: string
  subject: string
  filename: string
  bytes: number
  /** Where to open the conversation this letter lives in. */
  personId: string
  personName: string
  /** The document it carried. Null number means it never had one — impossible
   * by construction, since a draft cannot be prepared as a letter, and kept
   * nullable only because the column is. */
  invoiceId: string
  invoiceNumber: string | null
  invoiceKind: InvoiceKind
  invoiceStatus: InvoiceStatus
  totalCents: number
  currency: string
}

/**
 * One of this person's invoices, as the inbox composer offers it.
 *
 * Enough to recognise a document and decide whether to send it again, and
 * nothing more — the composer is a place to write a letter, not a second
 * invoice screen.
 *
 * `attachable` is false for a draft. A draft has no frozen file, so there is
 * nothing to attach; it appears in the list anyway, greyed, because hiding it
 * would send him hunting for an invoice he knows he wrote.
 */
export type PersonInvoice = {
  id: string
  number: string | null
  kind: InvoiceKind
  settlement: Settlement
  title: string
  issuedOn: string | null
  totalCents: number
  currency: string
  attachable: boolean
  /** What the file will be called once it is attached. */
  filename: string
  /**
   * When a letter last carried this document, or null.
   *
   * On the row because this panel makes sending the same invoice twice easy,
   * and the moment to notice is before pressing send, not after.
   */
  lastSentAt: string | null
}

/**
 * Money that does not stop: a client, an amount, and a day of the month.
 *
 * Deliberately not the tier model that `0012` carried and `0013` deleted —
 * tiers, add-ons and instalment schedules all assume a price list he has not
 * settled. This is the smallest shape that can write next month's invoice.
 */
export type Subscription = {
  id: string
  clientId: string
  clientName: string
  /** The fixed half of the line. The month is appended when the paper is drawn. */
  description: string
  amountCents: number
  currency: string
  /** Carried onto every line this writes. Zero while `§19` applies. */
  taxRate: number
  /** 1–28. The 28th is the last day every month has. */
  billingDay: number
  startedOn: string
  /** The next month this owes an invoice for, as its first day. */
  nextPeriod: string
  cancelledOn: string | null
  note: string
  /** How many invoices it has written. Deleting is only allowed while this is 0. */
  invoiceCount: number
}

export type InvoiceList = {
  rows: InvoiceRow[]
  summary: InvoiceSummary
}

/**
 * A letter prepared for the inbox composer.
 *
 * `personId` is where the composer opens. The attachment is already stored on
 * that person, so the composer attaches it the way it attaches any other file
 * and `reply()` links it to the message at the moment of sending.
 */
export type InvoiceLetter = {
  personId: string
  subject: string
  body: string
  attachment: { id: string; filename: string; bytes: number }
  kind: LetterKind
}
