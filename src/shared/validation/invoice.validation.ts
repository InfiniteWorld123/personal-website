import * as v from 'valibot'

/**
 * The contract for invoicing.
 *
 * Three rules from the lab run through all of it:
 *
 * - **The two kinds of money never meet.** `moneyKind` is required on every
 *   invoice and no schema here lets a document carry both.
 * - **A draft is editable; an issued invoice is not.** Nothing in this file
 *   describes an edit to money on an issued document, because there is no such
 *   act — the correction is a second document.
 * - **Euros exist only in the form.** Everything behind it counts integer
 *   cents, so nothing is rounded twice.
 */

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Three documents, not one with a sign on it.
 *
 * `CANCELLATION` voids an invoice whole — the wrong client, the wrong price,
 * a duplicate. `CREDIT_NOTE` gives part of it back — a discount agreed after
 * the fact, a line that was not delivered. He asked for both on day one, and
 * they are genuinely different acts: one makes the original count for nothing,
 * the other leaves it standing and reduces it.
 */
export const INVOICE_KINDS = ['INVOICE', 'CANCELLATION', 'CREDIT_NOTE'] as const

export type InvoiceKind = (typeof INVOICE_KINDS)[number]

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  INVOICE: 'Invoice',
  CANCELLATION: 'Cancellation',
  CREDIT_NOTE: 'Credit note',
}

/** What the paper calls itself, in the language it was written in. */
export const DOCUMENT_TITLE: Record<InvoiceLanguage, Record<InvoiceKind, string>> = {
  de: { INVOICE: 'Rechnung', CANCELLATION: 'Stornorechnung', CREDIT_NOTE: 'Gutschrift' },
  en: { INVOICE: 'Invoice', CANCELLATION: 'Cancellation', CREDIT_NOTE: 'Credit note' },
}

export const INVOICE_STATUSES = ['DRAFT', 'ISSUED', 'CANCELLED'] as const

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/**
 * The state a row is in, which is not the state a person sees.
 *
 * `ISSUED` is one database status covering three different mornings: sent and
 * waiting, sent and late, sent and settled. The screen derives those from the
 * dates and the payments — see `settlementOf` — because they change by
 * themselves as the calendar moves, and a stored flag would have to be
 * rewritten by something that runs every night.
 */
export const SETTLEMENTS = [
  'DRAFT',
  'OPEN',
  'OVERDUE',
  'PART',
  'PAID',
  'CANCELLED',
  'ISSUED',
] as const

export type Settlement = (typeof SETTLEMENTS)[number]

/*
 * `MONEY_KINDS` stood here until 20 Sep 2026.
 *
 * It was the flag that kept build money out of the recurring figure, back
 * when that figure had to be inferred from invoices because no subscriptions
 * table existed. `0020` brought one back, the figure now reads the
 * arrangements themselves, and the flag was left being written by the form
 * and read by nothing.
 *
 * The rule it stood for — «التقسيط ينتهي. الاشتراك لا ينتهي.» — is now
 * structural instead of declared: an invoice a subscription wrote carries a
 * `subscriptionId`, and one he wrote does not. See `0022`.
 */

export const PAYMENT_METHODS = ['TRANSFER', 'CARD', 'CASH', 'PAYPAL', 'OTHER'] as const

export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  TRANSFER: 'Bank transfer',
  CARD: 'Card',
  CASH: 'Cash',
  PAYPAL: 'PayPal',
  OTHER: 'Something else',
}

export const INVOICE_LANGUAGES = ['de', 'en'] as const

export type InvoiceLanguage = (typeof INVOICE_LANGUAGES)[number]

/**
 * The two letters an invoice produces.
 *
 * Neither is sent from here. Both are handed to the inbox composer, where he
 * reads them and presses send — his own design, and the reason a sent invoice
 * now appears in the conversation with the person who received it.
 */
export const LETTER_KINDS = ['INVOICE', 'REMINDER'] as const

export type LetterKind = (typeof LETTER_KINDS)[number]

/**
 * One currency, said once.
 *
 * `invoices.currency` is a column and every screen reads it per row, which
 * makes the system look as though it handles several. It does not, and one
 * place gives that away: `getSummary` sums `total_cents` across every row and
 * labels the result EUR. The day a dollar invoice exists, the figures on top
 * would add dollars to euros and print a € sign over the answer — exactly the
 * kind of untraceable number this admin was built to never show.
 *
 * Nothing offers him a choice today, so the lie is only latent. This makes it
 * impossible instead: an invoice in anything else is refused at the door.
 *
 * **The day he does want dollars**, this constant is the thread to pull. The
 * summary has to group by currency and the screen has to show more than one
 * figure — and that is a real piece of work, not a column change. Refusing
 * now is what keeps that an honest decision later rather than a bug he finds
 * in a total.
 */
export const THE_CURRENCY = 'EUR'

/** His answer: fourteen days. Seven reads as impatient, thirty is a month without money. */
export const DEFAULT_DUE_DAYS = 14

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

const trimmed = (message: string, max: number) =>
  v.pipe(v.string(message), v.trim(), v.nonEmpty(message), v.maxLength(max, 'That text is too long'))

const optionalText = (max: number) =>
  v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max, 'That text is too long'))

export const IdSchema = v.pipe(v.string(), v.uuid('That is not a valid id'))

/**
 * Money arrives as euros from a number input and is stored in cents.
 *
 * `Math.round` on the cent, not on the euro: `39.9 * 100` is `3989.999…` in
 * binary floating point, and truncating it would quietly bill a client one
 * cent less than the paper says.
 */
const euros = v.pipe(
  v.optional(v.union([v.string(), v.number()]), 0),
  v.transform((value) => Math.round(Number(value) * 100)),
  v.number('That is not a number'),
  v.integer(),
  v.minValue(0, 'A price cannot be negative'),
  v.maxValue(100_000_000, 'That is more than a million euros'),
)

/** A day he picked, never an instant inferred from one. */
const day = v.pipe(v.string(), v.trim(), v.regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'))

const optionalDay = v.nullish(day)

/* -------------------------------------------------------------------------- */
/* The client                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Either a company or a person, never neither.
 *
 * The check sits `forward`ed onto `company` so the message lands on a field
 * rather than at the top of the form, where it reads as "something is wrong"
 * and he has to hunt for what.
 */
export const ClientWriteSchema = v.pipe(
  v.object({
    company: optionalText(160),
    contactName: optionalText(120),
    email: v.pipe(
      v.optional(v.string(), ''),
      v.trim(),
      v.maxLength(200, 'That address is too long'),
      v.check(
        (value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
        'That is not an email address',
      ),
    ),
    phone: optionalText(60),
    street: optionalText(160),
    streetExtra: optionalText(160),
    postcode: optionalText(20),
    city: optionalText(120),
    country: v.pipe(
      v.optional(v.string(), 'DE'),
      v.trim(),
      v.toUpperCase(),
      v.regex(/^[A-Z]{2}$/, 'Two letters, like DE or AT'),
    ),
    vatId: optionalText(40),
    language: v.optional(v.picklist(INVOICE_LANGUAGES), 'de'),
    notes: optionalText(2000),
    /** The conversation this client came out of, when there was one. */
    leadId: v.nullish(IdSchema),
  }),
  v.forward(
    v.check(
      (input) => input.company !== '' || input.contactName !== '',
      'Give a company or a name',
    ),
    ['company'],
  ),
)

export type ClientWriteInput = v.InferOutput<typeof ClientWriteSchema>

/* -------------------------------------------------------------------------- */
/* The invoice                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One line of the paper.
 *
 * `taxRate` is here and defaults to zero. Under `§19` every line he writes
 * this year is zero, but the field exists so that crossing the threshold is a
 * number typed into a form rather than a migration across rows that were
 * correct when they were issued.
 */
export const InvoiceLineSchema = v.object({
  description: trimmed('Say what it is', 200),
  detail: optionalText(300),
  quantity: v.pipe(
    v.optional(v.union([v.string(), v.number()]), 1),
    v.transform((value) => Math.round(Number(value) * 100) / 100),
    v.number('That is not a number'),
    v.minValue(0.01, 'At least a hundredth'),
    v.maxValue(100_000, 'That is a very large quantity'),
  ),
  unitEuros: euros,
  taxRate: v.pipe(
    v.optional(v.union([v.string(), v.number()]), 0),
    v.transform((value) => Number(value)),
    v.number('That is not a number'),
    v.minValue(0, 'A rate cannot be negative'),
    v.maxValue(100, 'A rate cannot be over a hundred'),
  ),
})

export type InvoiceLineInput = v.InferOutput<typeof InvoiceLineSchema>

/**
 * Writing a draft.
 *
 * There is no `status` and no `number` here on purpose: issuing is its own act
 * with its own rules, and folding it into a save is how a document could
 * quietly acquire a number without anything recording that it had.
 *
 * `dueDays` rather than a due date: he picks the term once (fourteen days) and
 * the date is computed from the day it is actually issued. A date typed in
 * while drafting is wrong the moment the draft sits overnight.
 */
export const InvoiceWriteSchema = v.pipe(
  v.object({
    clientId: IdSchema,
    dealId: v.nullish(IdSchema),
    language: v.optional(v.picklist(INVOICE_LANGUAGES), 'de'),
    dueDays: v.pipe(
      v.optional(v.union([v.string(), v.number()]), DEFAULT_DUE_DAYS),
      v.transform((value) => Number(value)),
      v.number(),
      v.integer(),
      v.minValue(0, 'Zero days or more'),
      v.maxValue(90, 'More than ninety days is not a payment term'),
    ),
    serviceFrom: optionalDay,
    serviceTo: optionalDay,
    note: optionalText(600),
    lines: v.pipe(
      v.array(InvoiceLineSchema),
      v.minLength(1, 'An invoice needs at least one line'),
      v.maxLength(40, 'Forty lines is more than one page holds'),
    ),
  }),
  v.forward(
    v.check(
      (input) => !input.serviceFrom || !input.serviceTo || input.serviceTo >= input.serviceFrom,
      'The period ends before it starts',
    ),
    ['serviceTo'],
  ),
)

export type InvoiceWriteInput = v.InferOutput<typeof InvoiceWriteSchema>

/**
 * Correcting an issued invoice.
 *
 * A cancellation takes nothing but a reason: it voids the original whole, so
 * its lines are the original's lines with the sign flipped by meaning, not by
 * arithmetic. A credit note takes its own lines, because giving part of
 * something back is a decision about which part.
 */
export const CorrectionSchema = v.pipe(
  v.object({
    kind: v.picklist(['CANCELLATION', 'CREDIT_NOTE'] as const),
    reason: trimmed('Say why', 300),
    lines: v.optional(v.array(InvoiceLineSchema), []),
  }),
  v.forward(
    v.check(
      (input) => input.kind === 'CANCELLATION' || input.lines.length > 0,
      'A credit note needs at least one line',
    ),
    ['lines'],
  ),
)

export type CorrectionInput = v.InferOutput<typeof CorrectionSchema>

/* -------------------------------------------------------------------------- */
/* Money arriving                                                             */
/* -------------------------------------------------------------------------- */

/**
 * A payment that actually landed.
 *
 * `receivedOn` is required and has no default of "today": the transfer he is
 * recording on Thursday usually arrived on Tuesday, and that two-day
 * difference decides which month it counts in — for his screen and for his
 * tax return, which are the same figure by design.
 */
export const PaymentSchema = v.object({
  amountEuros: v.pipe(euros, v.minValue(1, 'An amount is needed')),
  method: v.optional(v.picklist(PAYMENT_METHODS), 'TRANSFER'),
  receivedOn: day,
  reference: optionalText(140),
  note: optionalText(300),
})

export type PaymentInput = v.InferOutput<typeof PaymentSchema>

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One filter over the settlements a person recognises, not over the database's
 * three statuses. `OVERDUE` is the reason the section gets opened at all, so
 * it is a thing he can ask for by name.
 */
export const InvoiceQuerySchema = v.object({
  settlement: v.optional(v.union([v.picklist(SETTLEMENTS), v.literal('ALL')]), 'ALL'),
  search: optionalText(120),
  limit: v.pipe(
    v.optional(v.union([v.string(), v.number()]), 200),
    v.transform((value) => Number(value)),
    v.number(),
    v.integer(),
    v.minValue(1),
    v.maxValue(500),
  ),
})

export type InvoiceQueryInput = v.InferOutput<typeof InvoiceQuerySchema>

/* -------------------------------------------------------------------------- */
/* Subscriptions                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The highest day of the month a subscription may bill on.
 *
 * Not 31, and the ceiling is the point. A subscription set to the 31st has no
 * 31st in February, and every system that allows it then has to invent a rule
 * — bill early, bill late, skip the month — that nobody remembers choosing and
 * that silently moves a client's billing date forever. The 28th exists in
 * every month of every year, so there is no rule to invent.
 */
export const LAST_BILLING_DAY = 28

/**
 * The two rates that exist for him, and nothing in between.
 *
 * A free number box invites a typo nobody catches — 1,9 instead of 19 on a
 * subscription bills wrong every month until somebody reads a PDF closely.
 * And there is no third answer to pick: selling web development from Erfurt,
 * he charges **0 % under `§19`** until he crosses the threshold, and **19 %**
 * after. The reduced 7 % rate covers books, food and public transport, not
 * software, so offering it would be offering a wrong answer.
 *
 * His own words, 20 Sep: *"I have just the 19 percent taxes… you can add zero
 * or 19 as a dropdown."*
 */
export const VAT_RATES = [0, 19] as const

export const VAT_RATE_LABEL: Record<number, string> = {
  0: '0 % — Kleinunternehmer (§19)',
  19: '19 % — Regelbesteuerung',
}

/**
 * The next few months a subscription will bill, and when.
 *
 * Pure, so the screen can show him what is going to happen before it happens.
 * That is the whole reason it exists: the generator writes a draft once a
 * month, silently, and until this there was no way to watch it except to wait
 * a month and hope. A feature he cannot see is a feature he cannot trust, and
 * he said so.
 */
export const plannedInvoices = (
  fromPeriod: string,
  billingDay: number,
  count = 3,
): Array<{ period: string; on: string }> => {
  const planned: Array<{ period: string; on: string }> = []
  let period = fromPeriod

  for (let index = 0; index < count; index += 1) {
    planned.push({ period, on: billingDate(period, billingDay) })
    period = nextPeriod(period)
  }

  return planned
}

export const SubscriptionWriteSchema = v.object({
  clientId: IdSchema,
  description: trimmed('Say what they are paying for each month', 200),
  /** Euros in the form, cents everywhere behind it. */
  amountEuros: v.pipe(
    v.number('That is not an amount'),
    v.minValue(0.01, 'A subscription has to be worth something'),
    v.maxValue(1_000_000, 'That is too large'),
  ),
  billingDay: v.pipe(
    v.number('Pick a day of the month'),
    v.integer(),
    v.minValue(1, 'Pick a day between 1 and 28'),
    v.maxValue(LAST_BILLING_DAY, `The 28th is the last day every month has — pick 1 to ${LAST_BILLING_DAY}`),
  ),
  /**
   * The rate every invoice it writes will carry.
   *
   * Zero while `§19` applies, and `issueInvoice` refuses anything else. It is
   * a field rather than a literal in the generator for the day after that: a
   * subscription that kept billing 0 % silently, with nothing on any screen to
   * say so, would be found out months of sent invoices later.
   */
  taxRate: v.picklist(
    VAT_RATES,
    'Pick 0 % while §19 applies, or 19 % once it does not',
  ),
  note: optionalText(500),
})

export type SubscriptionWriteInput = v.InferOutput<typeof SubscriptionWriteSchema>

/**
 * The calendar a subscription runs on.
 *
 * Every period is the first of a month, and every function here is pure string
 * arithmetic — no `Date`, and no timezone. A subscription billed on the 1st
 * must not become the 31st of the previous month for anyone west of London,
 * and the only reliable way to guarantee that is never to parse the string at
 * all. The same rule `invoice.types.ts` states for every date that is a *day*.
 */

/** `2026-10-01` → `2026-11-01`. */
export const nextPeriod = (period: string): string => {
  const [year, month] = period.split('-').map(Number) as [number, number]

  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`
}

/** The first of the month a day falls in. */
export const periodOf = (day: string): string => `${day.slice(0, 7)}-01`

/**
 * The day an invoice for this period is dated.
 *
 * `billingDay` never exceeds 28, so this cannot name a day that does not
 * exist — the whole reason for that ceiling.
 */
export const billingDate = (period: string, billingDay: number): string =>
  `${period.slice(0, 7)}-${String(billingDay).padStart(2, '0')}`

/**
 * The first month a new subscription bills.
 *
 * **This month, if its day has not passed; otherwise next month.** Adding one
 * on the 20th that bills on the 1st should not immediately produce an invoice
 * for a month three weeks gone — he would delete it every single time. Adding
 * one on the 20th that bills on the 25th should, because that money is
 * genuinely due in five days.
 */
export const firstPeriod = (today: string, billingDay: number): string => {
  const thisMonth = periodOf(today)

  return Number(today.slice(8, 10)) <= billingDay ? thisMonth : nextPeriod(thisMonth)
}

/**
 * The month a subscription invoice bills, in the language of the paper.
 *
 * `2026-10-01` → «Oktober 2026». Appended to his fixed description so he types
 * "Website-Betreuung" once and the client reads which month they are paying
 * for — his answer on 20 Sep, and the difference between a line a client can
 * check and one they have to take on trust.
 *
 * Hand-rolled rather than `Intl`: the Worker's ICU data is not something this
 * code controls, and a month name that differs between runtimes would mean two
 * clients holding two different-looking invoices from the same system — the
 * same reason `money` in `pdf.service.ts` is hand-rolled.
 */
const MONTH_NAMES: Record<InvoiceLanguage, string[]> = {
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
       'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  en: ['January', 'February', 'March', 'April', 'May', 'June',
       'July', 'August', 'September', 'October', 'November', 'December'],
}

export const periodLabel = (period: string, language: InvoiceLanguage): string => {
  const [year, month] = period.split('-')
  const name = MONTH_NAMES[language][Number(month) - 1]

  return name ? `${name} ${year}` : period
}

/** The full line as it reaches the paper. */
export const subscriptionLine = (
  description: string,
  period: string,
  language: InvoiceLanguage,
): string => `${description} · ${periodLabel(period, language)}`

/* -------------------------------------------------------------------------- */
/* Shared arithmetic                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What a document is worth, from its lines.
 *
 * Here rather than in the service because the draft editor shows a running
 * total while he types, and a second implementation on the client is a second
 * rounding rule waiting to disagree with the paper.
 *
 * Tax is rounded per line, which is what `§14` expects and what every German
 * accounting package does: rounding the sum instead can be a cent out on an
 * invoice with several rates, and a cent out is a call from a Steuerberater.
 */
export const totalsOf = (
  lines: Array<{ quantity: number; unitEuros: number; taxRate: number }>,
): { netCents: number; taxCents: number; totalCents: number } => {
  let netCents = 0
  let taxCents = 0

  for (const line of lines) {
    const net = Math.round(line.quantity * line.unitEuros)

    netCents += net
    taxCents += Math.round((net * line.taxRate) / 100)
  }

  return { netCents, taxCents, totalCents: netCents + taxCents }
}

/**
 * What is still owed on a document, and what to call it.
 *
 * One function because three surfaces were each doing their own subtraction
 * and two of them were wrong. Until 20 Sep the list and the document computed
 * `total − paid` and ignored credit notes entirely, so an invoice credited
 * 400 € of 990 € still read "990 € left" while the figure above it — computed
 * in SQL, which did subtract — said 590 €. He would have chased a client for
 * money he had given back himself.
 *
 * `over` is the other direction and had no name at all: a payment larger than
 * the invoice was accepted in silence, so he would believe he had been paid
 * when in fact he owes a refund.
 */
export const balanceOf = (invoice: {
  status: InvoiceStatus
  kind: InvoiceKind
  totalCents: number
  paidCents: number
  creditedCents: number
}): { owed: number; refund: number } => {
  /*
   * Whether this document asks for money at all.
   *
   * Three that do not, and the third is the one that was missing. A draft has
   * not been issued. A correction never demanded anything — it *is* the
   * giving back. And a **cancelled invoice has been voided**, so what it once
   * demanded is now zero.
   *
   * That last one left money invisible. Cancel an invoice a client has
   * already paid — a legitimate act, and the right one when a job falls
   * through after payment — and the old subtraction read
   * `total − paid = 0`: nothing owed, nothing over, nothing anywhere on any
   * screen. The payment row stayed, the month still counted the income, and
   * the refund he now owed existed only in a warning that vanished the moment
   * he pressed the button. Verified on 20 Sep 2026.
   *
   * With the total voided the arithmetic says it by itself: every cent that
   * arrived on a cancelled invoice is a cent he owes back.
   */
  const demands = invoice.status === 'ISSUED' && invoice.kind === 'INVOICE'
  const due = demands ? invoice.totalCents - invoice.creditedCents : 0
  const balance = due - invoice.paidCents

  return { owed: Math.max(0, balance), refund: Math.max(0, -balance) }
}

/**
 * Whether the card link on an invoice still leads somewhere.
 *
 * `payUrl` is written once, at issue, and never cleared — the link stays on
 * the row as a record of what was offered. But `syncPaymentLink` switches it
 * off at Stripe the moment anything settles against the invoice, because a
 * link that charges the full total is wrong the moment the total is not what
 * is owed. So a partial payment, a credit note, a cancellation: the URL still
 * reads like an offer and the page behind it says "this link is no longer
 * active".
 *
 * Until 20 Sep the reminder letter printed that dead link under "pay by card"
 * — on exactly the invoice a partly-paid client was being reminded about —
 * and the invoice screen offered to copy it. The same rule Stripe is told,
 * written once here so a screen and a letter can only agree:
 *
 *     usable  ⇔  a link exists, on an issued ordinary invoice, untouched
 */
export const payLinkUsable = (invoice: {
  payUrl: string | null
  status: InvoiceStatus
  kind: InvoiceKind
  totalCents: number
  paidCents: number
  creditedCents: number
}): invoice is typeof invoice & { payUrl: string } =>
  invoice.payUrl !== null &&
  invoice.status === 'ISSUED' &&
  invoice.kind === 'INVOICE' &&
  invoice.totalCents > 0 &&
  invoice.paidCents === 0 &&
  invoice.creditedCents === 0

/**
 * Whether a draft a subscription wrote is still exactly what it wrote.
 *
 * When he changes a subscription's price, a draft for the current month may
 * already be sitting in the list — written on the 1st, price raised on the
 * 2nd. `updateSubscription` rewrites that draft to the new figures, but only
 * if it is still the generator's own: one line, the generated description,
 * the old amount, the old rate. A draft he has touched by hand is his, and
 * a generator that overwrote it would be a second author on one document.
 */
export const subscriptionDraftUntouched = (
  lines: Array<{ description: string; quantity: number; unitCents: number; taxRate: number }>,
  was: { description: string; amountCents: number; taxRate: number },
  period: string,
  language: InvoiceLanguage,
): boolean => {
  const only = lines.length === 1 ? lines[0] : undefined

  return (
    only !== undefined &&
    only.quantity === 1 &&
    only.unitCents === was.amountCents &&
    only.taxRate === was.taxRate &&
    only.description === subscriptionLine(was.description, period, language)
  )
}

/**
 * The one combination that cannot be printed: `§19` and a VAT row.
 *
 * A `Kleinunternehmer` charges no VAT, and the paper says so in a sentence
 * that is a legal statement rather than a label. Put a rate on a line anyway
 * and the document ends up saying both — "no VAT is charged under §19" above
 * a row reading "Umsatzsteuer 19 % · 188,10 €".
 *
 * That is not a cosmetic contradiction. **`§14c(2) UStG`: VAT shown on an
 * invoice is owed to the Finanzamt whether or not it was allowed to be
 * charged.** A Kleinunternehmer who prints 188,10 € of VAT owes 188,10 €, has
 * no input tax to set against it, and finds out months later. The client, for
 * their part, may not deduct it — so the invoice is wrong for both of them.
 *
 * Hence a refusal rather than a quiet correction. Dropping the sentence would
 * leave the VAT standing and the liability with it; dropping the VAT would
 * change what he charged. Only he can say which he meant.
 */
export const vatConflict = (
  lines: Array<{ taxRate: number }>,
  smallBusiness: boolean,
): boolean => smallBusiness && lines.some((line) => line.taxRate > 0)

/**
 * What a document *is*, right now, to someone looking at the screen.
 *
 * Derived on every read rather than stored, because two of the six answers
 * change without anybody touching the row: an open invoice becomes overdue
 * because a day passed, and only a payment makes it paid.
 */
export const settlementOf = (invoice: {
  status: InvoiceStatus
  kind: InvoiceKind
  dueOn: string | null
  totalCents: number
  paidCents: number
  today: string
}): Settlement => {
  if (invoice.status === 'DRAFT') return 'DRAFT'
  if (invoice.status === 'CANCELLED') return 'CANCELLED'

  /*
   * A cancellation or a credit note is a document, not a debt.
   *
   * Before this it fell through to the bottom line and came out `OPEN` —
   * which the list drew as "still owed" while the figure above it correctly
   * counted nothing, because `getSummary` filters on `kind = 'INVOICE'`. The
   * row and the total disagreed, and the row was the one that was wrong.
   *
   * `ISSUED` makes no claim about money. It says only that the document
   * exists, which for a correction is the whole of what is true.
   */
  if (invoice.kind !== 'INVOICE') return 'ISSUED'

  if (invoice.paidCents >= invoice.totalCents) return 'PAID'
  if (invoice.paidCents > 0) return 'PART'

  return invoice.dueOn && invoice.dueOn < invoice.today ? 'OVERDUE' : 'OPEN'
}

export const SETTLEMENT_LABEL: Record<Settlement, string> = {
  DRAFT: 'Draft',
  /*
   * "Unpaid", not "Sent".
   *
   * It said Sent, and an invoice reaches this state the moment it is issued —
   * whether or not a letter ever left. The word was survivable until the
   * section grew a register of letters that really did leave, where "sent" is
   * proven by an outgoing message and nothing else. Two places using one word
   * for two different facts is how a screen starts lying quietly.
   *
   * This axis is about money, so the word is about money. Unpaid and overdue
   * then read as the pair they are: not yet due, and late.
   */
  OPEN: 'Unpaid',
  OVERDUE: 'Overdue',
  PART: 'Part paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  ISSUED: 'Issued',
}
