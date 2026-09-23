import * as v from 'valibot'
import { CountryCodeSchema } from './country.contract'
import {
  CURRENCIES,
  type Currency,
  DISCOUNT_TYPES,
  type DiscountType,
  TAX_MODES,
  TAX_RATES_BP,
  type TaxMode,
} from './invoice-calc.contract'
import { BILLING_INTERVALS, type BillingInterval, isCalendarDate } from './invoice-dates.contract'

/**
 * The Invoices contract, shared by the server and the Dashboard.
 *
 * See `docs/v2/invoices.md`. Pure — valibot and plain TypeScript — so the
 * Dashboard's TanStack forms and the server enforce identical rules. The
 * server validates again, and is the authority: a draft may be incomplete,
 * issuing may not.
 */

export * from './invoice-calc.contract'
export * from './invoice-dates.contract'

export const INVOICE_MODES = ['test', 'live'] as const
export type InvoiceMode = (typeof INVOICE_MODES)[number]

export const INVOICE_KINDS = ['invoice', 'cancellation'] as const
export type InvoiceKind = (typeof INVOICE_KINDS)[number]

export const INVOICE_STATUSES = ['draft', 'issued', 'cancelled'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

/** Derived on every read from payments, refunds, dates and Berlin's today. */
export const PAYMENT_STATES = [
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
  'cancelled',
  'not_applicable',
] as const
export type PaymentState = (typeof PAYMENT_STATES)[number]

/** Languages a document can be printed in. Arabic is recorded but refused. */
export const DOCUMENT_LANGUAGES = ['de', 'en'] as const
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number]

/** What the owner may ask for; `ar` answers `LANGUAGE_NOT_SUPPORTED`. */
export const REQUESTABLE_LANGUAGES = ['de', 'en', 'ar'] as const
export type RequestableLanguage = (typeof REQUESTABLE_LANGUAGES)[number]

export const PAYMENT_METHODS = ['bank', 'stripe', 'cash', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** Stripe payments come only from a verified webhook, never from a form. */
export const MANUAL_PAYMENT_METHODS = ['bank', 'cash', 'other'] as const

export const REFUND_METHODS = ['bank', 'stripe', 'cash', 'other'] as const
export type RefundMethod = (typeof REFUND_METHODS)[number]

export const INVOICE_LIMITS = {
  text: 200,
  description: 2000,
  address: 600,
  notes: 4000,
  lines: 200,
  installments: 60,
  /** 9 999 999.99 in minor units: per unit price, per payment, per line. */
  amountMinor: 999_999_999,
  /** 999 999.999 of anything. */
  quantityMilli: 999_999_999,
  paymentTermsDays: 365,
  reason: 1000,
  search: 120,
} as const

export const INVOICE_PAGE_SIZE = { min: 1, default: 25, max: 100 } as const

/* ------------------------------------------------------------------ pieces */

const Text = (max: number, label = 'This') =>
  v.pipe(
    v.optional(v.string(), ''),
    v.trim(),
    v.maxLength(max, `${label} is too long (at most ${max} characters)`),
  )

/** A date the owner picked, as `YYYY-MM-DD`. */
export const CalendarDateSchema = v.pipe(
  v.string('Choose a date'),
  v.trim(),
  v.check(isCalendarDate, 'Choose a real date'),
)

const OptionalDate = v.optional(v.nullable(CalendarDateSchema), null)

const Uuid = (message: string) => v.pipe(v.string(message), v.uuid(message))

const Minor = (label: string) =>
  v.pipe(
    v.number(`Enter ${label}`),
    v.integer(`${label} must be in whole cents`),
    v.minValue(0, `${label} cannot be negative`),
    v.maxValue(INVOICE_LIMITS.amountMinor, `${label} is too large`),
  )

const PositiveMinor = (label: string) =>
  v.pipe(Minor(label), v.minValue(1, `${label} must be above zero`))

const Email = v.pipe(
  v.optional(v.string(), ''),
  v.trim(),
  v.maxLength(254, 'That email address is too long'),
  v.check((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value), 'Enter a valid email address'),
)

const IdempotencyKey = Uuid('Send an idempotency key (a new uuid per action)')

const CountFromQuery = (fallback: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(value.trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(1, 'That is below the smallest allowed value'),
    v.maxValue(max, 'That is above the largest allowed value'),
  )

const OptionalUuidQuery = v.optional(
  v.pipe(
    v.string(),
    v.trim(),
    v.check((value) => value === '' || /^[0-9a-f-]{36}$/iu.test(value), 'That is not a valid id'),
    v.transform((value) => (value === '' ? null : value)),
  ),
  '',
)

/* ---------------------------------------------------------------- settings */

export const SettingsPutSchema = v.object({
  revision: v.pipe(v.number('Send the revision you edited'), v.integer(), v.minValue(1)),
  sellerName: Text(INVOICE_LIMITS.text, 'The name'),
  sellerAddress: Text(INVOICE_LIMITS.address, 'The address'),
  sellerCountry: v.optional(CountryCodeSchema, 'DE'),
  sellerEmail: Email,
  sellerPhone: Text(40, 'The phone number'),
  sellerWebsite: Text(INVOICE_LIMITS.text, 'The website'),
  taxNumber: Text(40, 'The tax number'),
  vatId: Text(40, 'The VAT id'),
  bankHolder: Text(INVOICE_LIMITS.text, 'The account holder'),
  bankIban: v.pipe(
    Text(42, 'The IBAN'),
    v.transform((value) => value.replace(/\s+/gu, '').toUpperCase()),
    v.check((value) => value === '' || /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/u.test(value), 'Enter a valid IBAN'),
  ),
  bankBic: v.pipe(
    Text(11, 'The BIC'),
    v.transform((value) => value.replace(/\s+/gu, '').toUpperCase()),
    v.check((value) => value === '' || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/u.test(value), 'Enter a valid BIC'),
  ),
  bankName: Text(INVOICE_LIMITS.text, 'The bank name'),
  taxMode: v.picklist(TAX_MODES, 'Choose Kleinunternehmer or standard'),
  defaultTaxRateBp: v.picklist(TAX_RATES_BP, 'Choose 19 %, 7 % or 0 %'),
  paymentTermsDays: v.pipe(
    v.number(),
    v.integer(),
    v.minValue(0),
    v.maxValue(INVOICE_LIMITS.paymentTermsDays),
  ),
  defaultLanguage: v.picklist(DOCUMENT_LANGUAGES),
  /** Test-mode emails go here instead of to the client, when set. */
  testRecipientEmail: Email,
})

export type SettingsPut = v.InferOutput<typeof SettingsPutSchema>

export type InvoiceSettings = Omit<SettingsPut, 'revision'> & {
  revision: number
  updatedAt: string
  /** What is still missing before a real (live) invoice may be issued. */
  readiness: { liveReady: boolean; missing: string[]; liveEnabled: boolean }
}

/* ------------------------------------------------------------------- lines */

export const LineInputSchema = v.object({
  description: Text(INVOICE_LIMITS.description, 'The description'),
  unit: Text(40, 'The unit'),
  quantityMilli: v.pipe(
    v.optional(v.number(), 1000),
    v.integer('Quantity has at most three decimals'),
    v.minValue(0, 'Quantity cannot be negative'),
    v.maxValue(INVOICE_LIMITS.quantityMilli, 'Quantity is too large'),
  ),
  unitPriceMinor: v.optional(Minor('The price'), 0),
  taxRateBp: v.optional(v.nullable(v.picklist(TAX_RATES_BP, 'Choose 19 %, 7 % or 0 %')), null),
  /** A Service the line started from. Its name and price are copied once. */
  serviceId: v.optional(v.nullable(Uuid('Choose a service from the list')), null),
})

export type LineInput = v.InferOutput<typeof LineInputSchema>

export const InstallmentInputSchema = v.object({
  dueDate: CalendarDateSchema,
  amountMinor: Minor('The installment'),
  label: Text(INVOICE_LIMITS.text, 'The label'),
})

export type InstallmentInput = v.InferOutput<typeof InstallmentInputSchema>

export const RecipientSchema = v.object({
  name: Text(INVOICE_LIMITS.text, 'The name'),
  company: Text(INVOICE_LIMITS.text, 'The company'),
  address: Text(INVOICE_LIMITS.address, 'The address'),
  country: v.optional(v.union([v.literal(''), CountryCodeSchema]), ''),
  email: Email,
  vatId: Text(40, 'The VAT id'),
})

export type RecipientInput = v.InferOutput<typeof RecipientSchema>

const FxSchema = v.nullable(
  v.object({
    rateId: Uuid('That rate is not on file'),
  }),
)

/** Everything a draft may hold. All optional: a draft can be incomplete. */
const draftEntries = {
  currency: v.optional(v.picklist(CURRENCIES, 'Choose EUR or USD')),
  language: v.optional(v.picklist(DOCUMENT_LANGUAGES, 'Choose German or English')),
  title: v.optional(Text(INVOICE_LIMITS.text, 'The title')),
  recipient: v.optional(RecipientSchema),
  serviceDateFrom: v.optional(v.nullable(CalendarDateSchema)),
  serviceDateTo: v.optional(v.nullable(CalendarDateSchema)),
  paymentTermsDays: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(INVOICE_LIMITS.paymentTermsDays)),
  ),
  discountType: v.optional(v.picklist(DISCOUNT_TYPES)),
  /** Basis points for a percentage (10 % = 1000), minor units for a fixed amount. */
  discountValue: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(INVOICE_LIMITS.amountMinor)),
  ),
  reverseCharge: v.optional(v.boolean()),
  allowBank: v.optional(v.boolean()),
  allowStripe: v.optional(v.boolean()),
  notes: v.optional(Text(INVOICE_LIMITS.notes, 'The notes')),
  internalNote: v.optional(Text(INVOICE_LIMITS.notes, 'The internal note')),
  lines: v.optional(
    v.pipe(v.array(LineInputSchema), v.maxLength(INVOICE_LIMITS.lines, 'Too many lines')),
  ),
  installments: v.optional(
    v.pipe(
      v.array(InstallmentInputSchema),
      v.maxLength(INVOICE_LIMITS.installments, 'Too many installments'),
    ),
  ),
  fx: v.optional(FxSchema),
}

/** A Client typed into the invoice flow, created through the Clients module. */
export const QuickClientSchema = v.object({
  kind: v.picklist(['person', 'company']),
  name: v.string(),
  email: v.string(),
  phone: v.optional(v.string(), ''),
  country: v.string(),
  companyName: v.optional(v.string(), ''),
  allowDuplicate: v.optional(v.boolean(), false),
})

export const CreateInvoiceSchema = v.pipe(
  v.object({
    mode: v.picklist(INVOICE_MODES, 'Choose test or live'),
    clientId: v.optional(v.nullable(Uuid('Choose a client'))),
    newClient: v.optional(QuickClientSchema),
    ...draftEntries,
  }),
  v.check(
    (input) => Boolean(input.clientId) !== Boolean(input.newClient),
    'Choose an existing client or create a new one — every invoice belongs to a client',
  ),
)

export type CreateInvoiceInput = v.InferOutput<typeof CreateInvoiceSchema>

export const InvoicePatchSchema = v.object({
  revision: v.pipe(v.number('Send the revision you edited'), v.integer(), v.minValue(1)),
  clientId: v.optional(Uuid('Choose a client')),
  ...draftEntries,
})

export type InvoicePatch = v.InferOutput<typeof InvoicePatchSchema>

export const IssueSchema = v.object({
  /** The revision the owner previewed. A draft changed since is not issued. */
  revision: v.pipe(v.number('Send the revision you previewed'), v.integer(), v.minValue(1)),
})

export const LanguageQuerySchema = v.object({
  language: v.optional(v.picklist(REQUESTABLE_LANGUAGES, 'Choose de, en or ar')),
})

export const SendSchema = v.object({
  language: v.optional(v.picklist(REQUESTABLE_LANGUAGES, 'Choose de, en or ar')),
})

export const INVOICE_LIST_STATUSES = [
  'all',
  'draft',
  'issued',
  'cancelled',
  'unpaid',
  'partially_paid',
  'paid',
  'overdue',
] as const

export const InvoiceListQuerySchema = v.object({
  page: CountFromQuery(1, 100_000),
  pageSize: CountFromQuery(INVOICE_PAGE_SIZE.default, INVOICE_PAGE_SIZE.max),
  mode: v.optional(v.picklist(['all', ...INVOICE_MODES]), 'all'),
  status: v.optional(v.picklist(INVOICE_LIST_STATUSES), 'all'),
  kind: v.optional(v.picklist(['all', ...INVOICE_KINDS]), 'all'),
  clientId: OptionalUuidQuery,
  subscriptionId: OptionalUuidQuery,
  year: v.optional(
    v.pipe(
      v.union([v.string(), v.number()]),
      v.transform((value) => (value === '' ? null : Number(value))),
      v.nullable(v.pipe(v.number(), v.integer(), v.minValue(2000), v.maxValue(2999))),
    ),
    '',
  ),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(INVOICE_LIMITS.search)), ''),
})

export type InvoiceListQuery = v.InferOutput<typeof InvoiceListQuerySchema>

export const PageOnlyQuerySchema = v.object({
  page: CountFromQuery(1, 100_000),
  pageSize: CountFromQuery(INVOICE_PAGE_SIZE.default, INVOICE_PAGE_SIZE.max),
})

export const PaymentListQuerySchema = v.object({
  page: CountFromQuery(1, 100_000),
  pageSize: CountFromQuery(INVOICE_PAGE_SIZE.default, INVOICE_PAGE_SIZE.max),
  mode: v.optional(v.picklist(INVOICE_MODES), 'live'),
})

/* ---------------------------------------------------------------- payments */

export const PaymentInputSchema = v.object({
  idempotencyKey: IdempotencyKey,
  method: v.picklist(
    MANUAL_PAYMENT_METHODS,
    'Choose bank, cash or other. Card payments are recorded by Stripe itself.',
  ),
  amountMinor: PositiveMinor('The amount'),
  paidOn: CalendarDateSchema,
  reference: Text(INVOICE_LIMITS.text, 'The reference'),
  note: Text(INVOICE_LIMITS.reason, 'The note'),
})

export type PaymentInput = v.InferOutput<typeof PaymentInputSchema>

export const VoidPaymentSchema = v.object({
  reason: v.pipe(
    v.string('Say why this payment is being voided'),
    v.trim(),
    v.nonEmpty('Say why this payment is being voided'),
    v.maxLength(INVOICE_LIMITS.reason),
  ),
})

export const RefundInputSchema = v.object({
  idempotencyKey: IdempotencyKey,
  method: v.picklist(REFUND_METHODS, 'Choose how the money went back'),
  amountMinor: PositiveMinor('The refund'),
  refundedOn: CalendarDateSchema,
  note: Text(INVOICE_LIMITS.reason, 'The note'),
})

export type RefundInput = v.InferOutput<typeof RefundInputSchema>

export const CancelSchema = v.object({
  reason: v.pipe(
    v.string('Say why the invoice is cancelled'),
    v.trim(),
    v.nonEmpty('Say why the invoice is cancelled'),
    v.maxLength(INVOICE_LIMITS.reason),
  ),
})

/* ------------------------------------------------------------ conversion */

export const FxProposalSchema = v.object({
  amountMinor: Minor('The EUR amount'),
  /** The owner's own rate, `1 EUR = rate USD`. Omit to use the ECB's. */
  rate: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.regex(/^\d{1,6}(\.\d{1,6})?$/u, 'Enter the rate like 1.0875'),
    ),
  ),
})

export type FxProposal = {
  rateId: string
  rate: string
  rateDate: string
  source: 'ecb' | 'manual'
  from: 'EUR'
  to: 'USD'
  fromMinor: number
  toMinor: number
}

export type FxRate = {
  id: string
  base: 'EUR'
  quote: 'USD'
  rate: string
  rateDate: string
  source: 'ecb' | 'manual'
  fetchedAt: string
}

/* ----------------------------------------------------------- what is read */

export type InvoiceLine = {
  position: number
  description: string
  unit: string
  quantityMilli: number
  unitPriceMinor: number
  taxRateBp: number | null
  netMinor: number
  service: { id: string; name: string; priceMinor: number | null } | null
}

export type InvoiceInstallment = {
  position: number
  dueDate: string
  amountMinor: number
  label: string
  /** How much of it the payments so far cover, oldest installment first. */
  paidMinor: number
  state: 'paid' | 'partially_paid' | 'open' | 'overdue'
}

export type InvoicePayment = {
  id: string
  invoiceId: string
  method: PaymentMethod
  amountMinor: number
  currency: Currency
  paidOn: string
  reference: string
  note: string
  voided: boolean
  voidReason: string
  receiptAvailable: boolean
  createdAt: string
}

export type InvoiceRefund = {
  id: string
  invoiceId: string
  method: RefundMethod
  amountMinor: number
  currency: Currency
  refundedOn: string
  note: string
  createdAt: string
}

export type InvoiceRecipient = {
  name: string
  company: string
  address: string
  country: string
  email: string
  vatId: string
}

export type InvoiceMoney = {
  subtotalMinor: number
  discountMinor: number
  netMinor: number
  taxMinor: number
  totalMinor: number
  paidMinor: number
  refundedMinor: number
  /** What is still owed; never negative. */
  amountDueMinor: number
  /** Paid in excess of the total, or on a cancelled invoice: could go back. */
  refundableMinor: number
}

export type OwnerInvoiceListItem = {
  id: string
  mode: InvoiceMode
  kind: InvoiceKind
  status: InvoiceStatus
  paymentState: PaymentState
  number: string | null
  client: { id: string; displayName: string }
  recipientName: string
  currency: Currency
  language: DocumentLanguage
  issueDate: string | null
  dueDate: string | null
  totalMinor: number
  amountDueMinor: number
  subscriptionId: string | null
  createdAt: string
  updatedAt: string
}

export type OwnerInvoice = OwnerInvoiceListItem & {
  title: string
  recipient: InvoiceRecipient
  serviceDateFrom: string | null
  serviceDateTo: string | null
  paymentTermsDays: number
  discountType: DiscountType
  discountValue: number
  taxMode: TaxMode
  reverseCharge: boolean
  allowBank: boolean
  allowStripe: boolean
  notes: string
  internalNote: string
  fx: { rateId: string; rate: string; rateDate: string; source: 'ecb' | 'manual' } | null
  lines: InvoiceLine[]
  installments: InvoiceInstallment[]
  money: InvoiceMoney
  taxGroups: Array<{ rateBp: number; netMinor: number; taxMinor: number }>
  /** Why this draft cannot be issued yet. Empty when it can. */
  issueProblems: string[]
  payments: InvoicePayment[]
  refunds: InvoiceRefund[]
  documents: Array<{ language: DocumentLanguage; assetId: string }>
  cancels: { id: string; number: string | null } | null
  cancelledBy: { id: string; number: string | null } | null
  replaces: { id: string; number: string | null } | null
  replacedBy: { id: string; number: string | null } | null
  periodStart: string | null
  periodEnd: string | null
  stripeCheckoutUrl: string | null
  collectionFailed: boolean
  inboxDraftId: string | null
  sentAt: string | null
  issuedAt: string | null
  cancelledAt: string | null
  cancelReason: string
  revision: number
}

/* ----------------------------------------------------------- subscriptions */

export const SUBSCRIPTION_STATUSES = ['active', 'paused', 'ended'] as const
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export const COLLECTION_MODES = ['manual', 'automatic_card'] as const
export type CollectionMode = (typeof COLLECTION_MODES)[number]

export const CARD_STATUSES = ['none', 'pending', 'valid', 'invalid'] as const
export type CardStatus = (typeof CARD_STATUSES)[number]

export { BILLING_INTERVALS }
export type { BillingInterval }

export const CreateSubscriptionSchema = v.object({
  mode: v.picklist(INVOICE_MODES, 'Choose test or live'),
  clientId: Uuid('Choose a client'),
  collection: v.picklist(COLLECTION_MODES, 'Choose manual or automatic card collection'),
  interval: v.picklist(BILLING_INTERVALS, 'Choose monthly or yearly'),
  startDate: CalendarDateSchema,
  currency: v.picklist(CURRENCIES, 'Choose EUR or USD'),
  language: v.optional(v.picklist(DOCUMENT_LANGUAGES), 'de'),
  description: v.pipe(
    v.string('Describe what is billed'),
    v.trim(),
    v.nonEmpty('Describe what is billed'),
    v.maxLength(INVOICE_LIMITS.description),
  ),
  amountMinor: PositiveMinor('The price'),
  taxRateBp: v.optional(v.nullable(v.picklist(TAX_RATES_BP)), null),
  serviceId: v.optional(v.nullable(Uuid('Choose a service from the list')), null),
  recipient: v.optional(RecipientSchema),
  paymentTermsDays: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(INVOICE_LIMITS.paymentTermsDays)),
    14,
  ),
  allowBank: v.optional(v.boolean(), true),
  allowStripe: v.optional(v.boolean(), false),
  fx: v.optional(FxSchema, null),
  /** Free from the start, for this many periods (`null` = indefinitely). */
  freePeriods: v.optional(
    v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(120))),
    0,
  ),
})

export type CreateSubscriptionInput = v.InferOutput<typeof CreateSubscriptionSchema>

export const SubscriptionPatchSchema = v.object({
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  description: v.optional(
    v.pipe(v.string(), v.trim(), v.nonEmpty('Describe what is billed'), v.maxLength(INVOICE_LIMITS.description)),
  ),
  language: v.optional(v.picklist(DOCUMENT_LANGUAGES)),
  recipient: v.optional(RecipientSchema),
  paymentTermsDays: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(INVOICE_LIMITS.paymentTermsDays)),
  ),
  allowBank: v.optional(v.boolean()),
  allowStripe: v.optional(v.boolean()),
  taxRateBp: v.optional(v.nullable(v.picklist(TAX_RATES_BP))),
})

export const SubscriptionDateSchema = v.object({
  /** When it takes effect; defaults to the next unbilled period. */
  date: OptionalDate,
})

export const PriceChangeSchema = v.object({
  amountMinor: PositiveMinor('The new price'),
  /** Must be a period start no earlier than the next unbilled period. */
  effectiveFrom: OptionalDate,
  note: Text(INVOICE_LIMITS.reason, 'The note'),
  fx: v.optional(FxSchema, null),
})

export const SubscriptionDiscountSchema = v.object({
  discountType: v.picklist(['percent', 'fixed'], 'Choose percent or fixed'),
  value: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(INVOICE_LIMITS.amountMinor)),
  /** `null` = indefinitely. */
  periods: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(120))),
  startsOn: OptionalDate,
  note: Text(INVOICE_LIMITS.reason, 'The note'),
})

export const FreePeriodSchema = v.object({
  startsOn: OptionalDate,
  /** `null` = indefinitely free. */
  endsOn: OptionalDate,
  note: Text(INVOICE_LIMITS.reason, 'The note'),
})

export const SubscriptionListQuerySchema = v.object({
  page: CountFromQuery(1, 100_000),
  pageSize: CountFromQuery(INVOICE_PAGE_SIZE.default, INVOICE_PAGE_SIZE.max),
  mode: v.optional(v.picklist(['all', ...INVOICE_MODES]), 'all'),
  status: v.optional(v.picklist(['all', ...SUBSCRIPTION_STATUSES]), 'all'),
  clientId: OptionalUuidQuery,
})

export type SubscriptionListQuery = v.InferOutput<typeof SubscriptionListQuerySchema>

export type SubscriptionPeriod = {
  index: number
  periodStart: string
  periodEnd: string
  outcome: 'invoiced' | 'free' | 'paused' | 'after_end'
  invoiceId: string | null
  amountMinor: number
  discountMinor: number
  createdAt: string
}

export type OwnerSubscription = {
  id: string
  mode: InvoiceMode
  client: { id: string; displayName: string }
  status: SubscriptionStatus
  collection: CollectionMode
  interval: BillingInterval
  startDate: string
  endsOn: string | null
  pausedFrom: string | null
  currency: Currency
  language: DocumentLanguage
  description: string
  taxRateBp: number | null
  service: { id: string; name: string; priceMinor: number | null } | null
  fx: { rateId: string; rate: string; rateDate: string; source: 'ecb' | 'manual' } | null
  recipient: InvoiceRecipient
  paymentTermsDays: number
  allowBank: boolean
  allowStripe: boolean
  /** The price of the next unbilled period, and any change already scheduled. */
  currentAmountMinor: number
  terms: Array<{ effectiveFrom: string; amountMinor: number; note: string }>
  discounts: Array<{
    id: string
    discountType: 'percent' | 'fixed'
    value: number
    startsOn: string
    periods: number | null
    appliedCount: number
    endedAt: string | null
    note: string
  }>
  freePeriods: Array<{ id: string; startsOn: string; endsOn: string | null; note: string }>
  pauses: Array<{ startsOn: string; endsOn: string | null }>
  nextPeriodStart: string | null
  card: { status: CardStatus; label: string; consentAt: string | null }
  revision: number
  createdAt: string
  updatedAt: string
}

export type InvoiceNotice = {
  id: string
  kind: string
  audience: 'owner' | 'customer'
  dueOn: string
  status: 'pending' | 'prepared' | 'cancelled'
  invoiceId: string | null
  subscriptionId: string | null
  inboxDraftId: string | null
  message: string
  createdAt: string
}
