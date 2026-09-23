import type { Currency } from '#/backend2/contracts/invoice-calc.contract'
import { INVOICE_LIMITS } from '#/backend2/contracts/invoice.contract'
import type { SubscriptionFields } from './api'
import { parseMoney, parsePercent } from './money'

/**
 * The new-subscription form's values and rules (`docs/v2/invoices.md`,
 * approved in the Invoices Design Lab, 24 Sep 2026): who and what, when, how
 * it is collected, and an optional discount or free start. The same limits the
 * server's `CreateSubscriptionSchema` enforces, worded for each field.
 */

export type SubscriptionFormValues = {
  clientId: string
  serviceId: string | null
  description: string
  amount: string
  currency: Currency
  fx: { rateId: string; rate: string; rateDate: string; source: 'ecb' | 'manual' } | null
  /** The euro price a USD amount was converted from, while untouched. */
  eurMinor: number | null
  interval: 'monthly' | 'yearly'
  startDate: string
  collection: 'manual' | 'automatic_card'
  language: 'de' | 'en'
  allowBank: boolean
  allowStripe: boolean
  free: 'none' | 'some' | 'always'
  freeCount: string
  discountType: 'none' | 'percent' | 'fixed'
  discountValue: string
  discountLength: 'one' | 'some' | 'always'
  discountPeriods: string
}

export const emptySubscriptionForm = (today: string, language: 'de' | 'en' = 'de'): SubscriptionFormValues => ({
  clientId: '',
  serviceId: null,
  description: '',
  amount: '',
  currency: 'EUR',
  fx: null,
  eurMinor: null,
  interval: 'monthly',
  startDate: today,
  collection: 'manual',
  language,
  allowBank: true,
  allowStripe: false,
  free: 'none',
  freeCount: '1',
  discountType: 'none',
  discountValue: '',
  discountLength: 'one',
  discountPeriods: '3',
})

const whole = (text: string, min: number, max: number): number | null => {
  if (!/^\d{1,3}$/u.test(text.trim())) return null

  const value = Number(text)

  return value >= min && value <= max ? value : null
}

export const subscriptionErrors = (values: SubscriptionFormValues, today: string): Record<string, string> => {
  const errors: Record<string, string> = {}

  if (!values.clientId) errors.clientId = 'Choose who pays for this'
  if (values.description.trim() === '') errors.description = 'Write what the client pays for'
  else if (values.description.trim().length > INVOICE_LIMITS.description) errors.description = 'That is too long'

  const amount = parseMoney(values.amount)

  if (amount === null || amount <= 0) errors.amount = 'Enter the agreed price, like 49 or 49.90'
  else if (amount > INVOICE_LIMITS.amountMinor) errors.amount = 'That price is too large'

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(values.startDate)) errors.startDate = 'Choose the first collection date'
  else if (values.startDate < today) errors.startDate = 'The first collection date cannot be in the past'

  if (values.free === 'some' && whole(values.freeCount, 1, 120) === null) errors.freeCount = 'Between 1 and 120 periods'

  if (values.discountType !== 'none') {
    const value = values.discountType === 'percent' ? parsePercent(values.discountValue) : parseMoney(values.discountValue)

    if (value === null || value <= 0) {
      errors.discountValue = values.discountType === 'percent' ? 'Write it like 10 or 12.5' : 'Write it like 10 or 9.90'
    } else if (values.discountType === 'percent' && value > 10_000) {
      errors.discountValue = 'A discount cannot be more than 100 %'
    }

    if (values.discountLength === 'some' && whole(values.discountPeriods, 1, 120) === null) {
      errors.discountPeriods = 'Between 1 and 120 periods'
    }
  }

  return errors
}

export const formToSubscription = (
  values: SubscriptionFormValues,
  mode: 'test' | 'live',
): SubscriptionFields => ({
  mode,
  clientId: values.clientId,
  collection: values.collection,
  interval: values.interval,
  startDate: values.startDate,
  currency: values.currency,
  language: values.language,
  description: values.description.trim(),
  amountMinor: parseMoney(values.amount) ?? 0,
  serviceId: values.serviceId,
  // An automatic subscription is paid by the saved card; the options do not apply.
  allowBank: values.collection === 'manual' ? values.allowBank : false,
  allowStripe: values.collection === 'manual' ? values.allowStripe : false,
  fx: values.currency === 'USD' && values.fx ? { rateId: values.fx.rateId } : null,
  freePeriods: values.free === 'none' ? 0 : values.free === 'always' ? null : Number(values.freeCount),
})

export const discountOfForm = (values: SubscriptionFormValues) =>
  values.discountType === 'none'
    ? null
    : {
        discountType: values.discountType,
        value: (values.discountType === 'percent' ? parsePercent(values.discountValue) : parseMoney(values.discountValue)) ?? 0,
        periods:
          values.discountLength === 'one' ? 1 : values.discountLength === 'some' ? Number(values.discountPeriods) : null,
      }
