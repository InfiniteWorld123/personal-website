import {
  type CalcLine,
  type Currency,
  type InvoiceTotals,
  type TaxMode,
  computeTotals,
  convertMinor,
  installmentProblems,
  parseRateMicro,
} from '#/backend2/contracts/invoice-calc.contract'
import { addDays } from '#/backend2/contracts/invoice-dates.contract'
import type { InvoiceSettings, OwnerInvoice } from '#/backend2/contracts/invoice.contract'
import { INVOICE_LIMITS } from '#/backend2/contracts/invoice.contract'
import type { DraftFields } from './api'
import { bpToText, formatAmount, milliToText, minorToText, parseMoney, parsePercent, parseQuantity } from './money'

/**
 * The invoice editor's values and rules (`docs/v2/invoices.md`, approved in
 * the Invoices Design Lab, 24 Sep 2026).
 *
 * Two sets of rules, as `AGENTS.md` asks of a form that saves drafts and then
 * publishes: **saving a draft** needs only a client and readable numbers — a
 * half-written invoice stays saveable — while **issuing** must satisfy every
 * rule the server checks before it takes a number. Both are keyed by the
 * form's own field names, so each sentence lands under its field. The server
 * checks everything again; its `issueProblems` are the final word.
 *
 * Totals come from the shared contract's `computeTotals`, so the panel beside
 * the form shows the same cents the server will freeze.
 */

export type RecipientValues = {
  name: string
  company: string
  address: string
  country: string
  email: string
  vatId: string
}

export type LineValues = {
  /** Stable React key; never sent. */
  key: string
  description: string
  unit: string
  quantity: string
  unitPrice: string
  taxRateBp: number | null
  serviceId: string | null
  /** The Service snapshot, for the note under the line. */
  service: { name: string; priceMinor: number | null } | null
  /** The euro price this USD price was converted from, while untouched. */
  eurMinor: number | null
}

export type InstallmentValues = { key: string; amount: string; dueDate: string; label: string }

export type FxValues = { rateId: string; rate: string; rateDate: string; source: 'ecb' | 'manual' }

export type InvoiceFormValues = {
  clientId: string
  recipient: RecipientValues
  language: 'de' | 'en'
  currency: Currency
  fx: FxValues | null
  title: string
  serviceDateFrom: string
  serviceDateTo: string
  lines: LineValues[]
  discountType: 'none' | 'percent' | 'fixed'
  discountValue: string
  reverseCharge: boolean
  allowBank: boolean
  allowStripe: boolean
  /** Paid in parts: a payment plan instead of one due date. */
  plan: boolean
  paymentTermsDays: string
  installments: InstallmentValues[]
  notes: string
  internalNote: string
}

export type InvoiceFormErrors = Record<string, string>

let keySeed = 0
export const newKey = (): string => {
  keySeed += 1

  return `k${Date.now().toString(36)}${keySeed}`
}

export const emptyLine = (over: Partial<LineValues> = {}): LineValues => ({
  key: newKey(),
  description: '',
  unit: '',
  quantity: '1',
  unitPrice: '',
  taxRateBp: null,
  serviceId: null,
  service: null,
  eurMinor: null,
  ...over,
})

export const emptyRecipient = (): RecipientValues => ({
  name: '',
  company: '',
  address: '',
  country: '',
  email: '',
  vatId: '',
})

export const emptyInvoiceForm = (settings?: Pick<InvoiceSettings, 'defaultLanguage' | 'paymentTermsDays'>): InvoiceFormValues => ({
  clientId: '',
  recipient: emptyRecipient(),
  language: settings?.defaultLanguage ?? 'de',
  currency: 'EUR',
  fx: null,
  title: '',
  serviceDateFrom: '',
  serviceDateTo: '',
  lines: [emptyLine()],
  discountType: 'none',
  discountValue: '',
  reverseCharge: false,
  allowBank: true,
  allowStripe: false,
  plan: false,
  paymentTermsDays: String(settings?.paymentTermsDays ?? 14),
  installments: [],
  notes: '',
  internalNote: '',
})

export const invoiceToForm = (invoice: OwnerInvoice): InvoiceFormValues => ({
  clientId: invoice.client.id,
  recipient: { ...invoice.recipient },
  language: invoice.language,
  currency: invoice.currency,
  fx: invoice.fx ? { ...invoice.fx } : null,
  title: invoice.title,
  serviceDateFrom: invoice.serviceDateFrom ?? '',
  serviceDateTo: invoice.serviceDateTo ?? '',
  lines:
    invoice.lines.length > 0
      ? invoice.lines.map((line) =>
          emptyLine({
            description: line.description,
            unit: line.unit,
            quantity: milliToText(line.quantityMilli),
            unitPrice: minorToText(line.unitPriceMinor),
            taxRateBp: line.taxRateBp,
            serviceId: line.service?.id ?? null,
            service: line.service ? { name: line.service.name, priceMinor: line.service.priceMinor } : null,
          }),
        )
      : [emptyLine()],
  discountType: invoice.discountType,
  discountValue:
    invoice.discountType === 'percent'
      ? bpToText(invoice.discountValue)
      : invoice.discountType === 'fixed'
        ? minorToText(invoice.discountValue)
        : '',
  reverseCharge: invoice.reverseCharge,
  allowBank: invoice.allowBank,
  allowStripe: invoice.allowStripe,
  plan: invoice.installments.length > 0,
  paymentTermsDays: String(invoice.paymentTermsDays),
  installments: invoice.installments.map((part) => ({
    key: newKey(),
    amount: minorToText(part.amountMinor),
    dueDate: part.dueDate,
    label: part.label,
  })),
  notes: invoice.notes,
  internalNote: invoice.internalNote,
})

/* ------------------------------------------------------------------ numbers */

export const discountOf = (values: Pick<InvoiceFormValues, 'discountType' | 'discountValue'>) => {
  if (values.discountType === 'percent') return { type: 'percent' as const, value: parsePercent(values.discountValue) ?? 0 }
  if (values.discountType === 'fixed') return { type: 'fixed' as const, value: parseMoney(values.discountValue) ?? 0 }

  return { type: 'none' as const, value: 0 }
}

const calcLines = (lines: LineValues[]): CalcLine[] =>
  lines.map((line) => ({
    quantityMilli: parseQuantity(line.quantity) ?? 0,
    unitPriceMinor: parseMoney(line.unitPrice) ?? 0,
    taxRateBp: line.taxRateBp,
  }))

export type TaxContext = { taxMode: TaxMode; defaultTaxRateBp: number }

/** The totals exactly as the server will compute them; unreadable numbers count as 0. */
export const totalsOf = (values: InvoiceFormValues, tax: TaxContext): InvoiceTotals =>
  computeTotals({
    lines: calcLines(values.lines),
    discount: discountOf(values),
    taxMode: tax.taxMode,
    reverseCharge: values.reverseCharge,
    defaultRateBp: tax.defaultTaxRateBp,
  })

export const planSumOf = (values: Pick<InvoiceFormValues, 'installments'>): number =>
  values.installments.reduce((sum, part) => sum + (parseMoney(part.amount) ?? 0), 0)

/** Parts of equal size; any leftover cent goes on the last part. */
export const splitEvenly = (totalMinor: number, parts: number): number[] => {
  if (parts <= 0) return []

  const base = Math.floor(totalMinor / parts)

  return Array.from({ length: parts }, (_, index) => (index === parts - 1 ? totalMinor - base * (parts - 1) : base))
}

/** The due date an invoice issued today would carry. */
export const dueDateOf = (values: InvoiceFormValues, today: string): string | null => {
  if (values.plan) return values.installments.at(-1)?.dueDate || null

  const days = Number(values.paymentTermsDays)

  return Number.isInteger(days) && days >= 0 ? addDays(today, days) : null
}

/** A euro amount at the given rate, the way the server converts it. */
export const toUsd = (eurMinor: number, rate: string): number | null => {
  const micro = parseRateMicro(rate)

  return micro === null ? null : convertMinor(eurMinor, micro)
}

/* -------------------------------------------------------------------- rules */

const tooLong = (text: string, max: number) => text.trim().length > max

/**
 * What stops a draft from being saved: a client (every invoice has one) and
 * numbers the server can read. Nothing about completeness.
 */
export const draftErrors = (values: InvoiceFormValues): InvoiceFormErrors => {
  const errors: InvoiceFormErrors = {}

  if (!values.clientId) errors.clientId = 'Choose who this invoice is for'

  const email = values.recipient.email.trim()

  if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) errors['recipient.email'] = 'Enter a valid email address'
  if (tooLong(values.recipient.name, INVOICE_LIMITS.text)) errors['recipient.name'] = 'The name is too long'
  if (tooLong(values.recipient.company, INVOICE_LIMITS.text)) errors['recipient.company'] = 'The company is too long'
  if (tooLong(values.recipient.address, INVOICE_LIMITS.address)) {
    errors['recipient.address'] = `The address is too long (at most ${INVOICE_LIMITS.address} characters)`
  }
  if (tooLong(values.title, INVOICE_LIMITS.text)) errors.title = 'The title is too long'

  if (values.lines.length > INVOICE_LIMITS.lines) errors.lines = `At most ${INVOICE_LIMITS.lines} lines`

  values.lines.forEach((line, index) => {
    const quantity = parseQuantity(line.quantity)
    const price = line.unitPrice.trim() === '' ? 0 : parseMoney(line.unitPrice)

    if (tooLong(line.description, INVOICE_LIMITS.description)) {
      errors[`lines[${index}].description`] = 'This description is too long'
    }
    if (quantity === null) errors[`lines[${index}].quantity`] = 'Write a number like 1 or 1.5'
    else if (quantity > INVOICE_LIMITS.quantityMilli) errors[`lines[${index}].quantity`] = 'That quantity is too large'
    if (price === null) errors[`lines[${index}].unitPrice`] = 'Write the price like 1890 or 49,90'
    else if (price > INVOICE_LIMITS.amountMinor) errors[`lines[${index}].unitPrice`] = 'That price is too large'
  })

  if (values.discountType === 'percent') {
    const bp = parsePercent(values.discountValue)

    if (bp === null) errors.discountValue = 'Write the discount like 10 or 12.5'
    else if (bp > 10_000) errors.discountValue = 'A discount cannot be more than 100 %'
  } else if (values.discountType === 'fixed') {
    if (parseMoney(values.discountValue) === null) errors.discountValue = 'Write the discount like 100 or 49,90'
  }

  if (values.plan) {
    if (values.installments.length > INVOICE_LIMITS.installments) {
      errors.installments = `At most ${INVOICE_LIMITS.installments} parts`
    }

    values.installments.forEach((part, index) => {
      if (parseMoney(part.amount) === null) errors[`installments[${index}].amount`] = 'Write an amount like 945 or 567,50'
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(part.dueDate)) errors[`installments[${index}].dueDate`] = 'Choose a date'
    })
  } else {
    const days = Number(values.paymentTermsDays)

    if (!/^\d{1,3}$/u.test(values.paymentTermsDays.trim()) || days > INVOICE_LIMITS.paymentTermsDays) {
      errors.paymentTermsDays = `Enter a number of days from 0 to ${INVOICE_LIMITS.paymentTermsDays}`
    }
  }

  if (values.serviceDateFrom && values.serviceDateTo && values.serviceDateTo < values.serviceDateFrom) {
    errors.serviceDateTo = 'The service period ends before it starts'
  }

  return errors
}

/**
 * Everything the server checks before it takes a number, in the same order,
 * worded for the field it sits under. Draft rules first: an issue needs those
 * too.
 */
export const issueErrors = (values: InvoiceFormValues, tax: TaxContext, today: string): InvoiceFormErrors => {
  const errors = draftErrors(values)
  const add = (field: string, message: string) => {
    if (!errors[field]) errors[field] = message
  }

  if (values.recipient.name.trim() === '' && values.recipient.company.trim() === '') {
    add('recipient.name', 'Enter the name or the company the invoice is addressed to')
  }
  if (values.recipient.address.trim() === '') add('recipient.address', 'Enter the full billing address')

  if (values.lines.length === 0) add('lines', 'Add at least one line')

  values.lines.forEach((line, index) => {
    if (line.description.trim() === '') add(`lines[${index}].description`, 'Describe this line or remove it')
    if (parseQuantity(line.quantity) === 0) add(`lines[${index}].quantity`, 'Enter a quantity above zero')
  })

  const totals = totalsOf(values, tax)

  if (values.lines.length > 0 && totals.totalMinor <= 0 && !Object.keys(errors).some((key) => key.startsWith('lines'))) {
    add('lines', 'The invoice total must be above zero')
  }

  if (values.discountType === 'fixed' && (parseMoney(values.discountValue) ?? 0) > totals.subtotalMinor) {
    add('discountValue', 'The discount is larger than the subtotal')
  }

  if (values.reverseCharge) {
    if (tax.taxMode !== 'standard') add('reverseCharge', 'Reverse charge applies only with standard VAT')
    else if (values.recipient.vatId.trim() === '') add('recipient.vatId', 'Reverse charge needs the client’s VAT ID')
  }

  if (values.plan) {
    if (values.installments.length === 0) add('installments', 'Add at least one part, or choose “All at once”')

    const readable = values.installments.every((part) => parseMoney(part.amount) !== null && part.dueDate !== '')

    if (readable) {
      values.installments.forEach((part, index) => {
        if ((parseMoney(part.amount) ?? 0) <= 0) add(`installments[${index}].amount`, 'Enter an amount above zero')
      })

      const problems = installmentProblems(
        values.installments.map((part) => ({ dueDate: part.dueDate, amountMinor: parseMoney(part.amount) ?? 0 })),
        totals.totalMinor,
        today,
      )

      for (const problem of problems) {
        if (problem.startsWith('The installments add up')) add('installments', 'The parts must add up exactly to the total')
        else if (problem.startsWith('Installment dates')) add('installments', 'Each part must be due on or after the one before')
        else if (problem.startsWith('The first installment')) add('installments[0].dueDate', 'The first part cannot be due before today')
      }
    }
  }

  return errors
}

/**
 * Where a sentence from the server's `issueProblems` belongs, so a refusal
 * the browser did not predict still lands under a field when it can.
 */
export const problemField = (problem: string): string | null => {
  if (problem.includes("recipient's name")) return 'recipient.name'
  if (problem.includes('full address')) return 'recipient.address'
  if (problem.includes('VAT id')) return 'recipient.vatId'
  if (problem.startsWith('Reverse charge')) return 'reverseCharge'
  if (problem.includes('client is in Trash')) return 'clientId'
  if (problem.includes('line')) return 'lines'
  if (problem.includes('discount')) return 'discountValue'
  if (problem.includes('service period')) return 'serviceDateTo'
  if (problem.toLowerCase().includes('installment')) return 'installments'

  return null
}

/* ------------------------------------------------------------------ sending */

/** The form as a draft save: only readable values; the server stores the rest. */
export const formToDraft = (values: InvoiceFormValues): DraftFields => {
  const discount = discountOf(values)

  return {
    clientId: values.clientId,
    currency: values.currency,
    language: values.language,
    title: values.title.trim(),
    recipient: {
      name: values.recipient.name.trim(),
      company: values.recipient.company.trim(),
      address: values.recipient.address.trim(),
      country: values.recipient.country,
      email: values.recipient.email.trim(),
      vatId: values.recipient.vatId.trim(),
    },
    serviceDateFrom: values.serviceDateFrom || null,
    serviceDateTo: values.serviceDateTo || null,
    paymentTermsDays: /^\d{1,3}$/u.test(values.paymentTermsDays.trim()) ? Number(values.paymentTermsDays) : undefined,
    discountType: discount.type,
    discountValue: discount.value,
    reverseCharge: values.reverseCharge,
    allowBank: values.allowBank,
    allowStripe: values.allowStripe,
    notes: values.notes.trim(),
    internalNote: values.internalNote.trim(),
    lines: values.lines.map((line) => ({
      description: line.description.trim(),
      unit: line.unit.trim(),
      quantityMilli: parseQuantity(line.quantity) ?? 0,
      unitPriceMinor: parseMoney(line.unitPrice) ?? 0,
      taxRateBp: line.taxRateBp,
      serviceId: line.serviceId,
    })),
    installments: values.plan
      ? values.installments.map((part) => ({
          dueDate: part.dueDate,
          amountMinor: parseMoney(part.amount) ?? 0,
          label: part.label.trim(),
        }))
      : [],
    fx: values.currency === 'USD' && values.fx ? { rateId: values.fx.rateId } : null,
  }
}

/* -------------------------------------------------------------------- words */

export const planMeter = (planned: number, total: number, currency: Currency): { text: string; ok: boolean } => {
  const left = total - planned

  if (left === 0) return { text: 'Adds up to the total', ok: true }
  if (left > 0) return { text: `${formatAmount(left, currency)} not planned yet`, ok: false }

  return { text: `${formatAmount(-left, currency)} more than the total`, ok: false }
}
