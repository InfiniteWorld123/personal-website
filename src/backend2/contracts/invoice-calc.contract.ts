/**
 * The arithmetic of an invoice, shared by the server and the Dashboard.
 *
 * See `docs/v2/invoices.md` ("Engineering decisions"). Pure: no valibot, no
 * I/O, no clock. The Dashboard can show the same totals the server will
 * freeze at issue, and the tests can prove every rounding rule without a
 * database.
 *
 * Money is always an integer number of minor units (cents) together with its
 * currency. Nothing here ever adds two amounts in different currencies: every
 * function takes one invoice's lines, all in that invoice's currency.
 *
 * Rounding is "half away from zero" on non-negative values, applied once per
 * line and once per tax group — the way a German invoice is normally
 * computed and the way a reader can reproduce it with a calculator.
 */

export const CURRENCIES = ['EUR', 'USD'] as const
export type Currency = (typeof CURRENCIES)[number]

/** Every tax rate a line may carry, in basis points: 19 %, 7 %, 0 %. */
export const TAX_RATES_BP = [1900, 700, 0] as const
export type TaxRateBp = (typeof TAX_RATES_BP)[number]

export const TAX_MODES = ['kleinunternehmer', 'standard'] as const
export type TaxMode = (typeof TAX_MODES)[number]

export const DISCOUNT_TYPES = ['none', 'percent', 'fixed'] as const
export type DiscountType = (typeof DISCOUNT_TYPES)[number]

/** 1.000 of something, in thousandths, so `1.5 hours` is exact. */
export const QUANTITY_SCALE = 1000

/**
 * `a * b / c`, rounded half away from zero, for non-negative integers.
 *
 * BigInt inside so a large quantity times a large price cannot lose a cent to
 * floating point on the way; the result is back in a safe `number`.
 */
export const mulDivRound = (a: number, b: number, c: number): number => {
  if (c <= 0) throw new Error('Division by a non-positive number')

  const numerator = BigInt(Math.round(a)) * BigInt(Math.round(b))
  const divisor = BigInt(Math.round(c))
  const negative = numerator < 0n
  const magnitude = negative ? -numerator : numerator
  const rounded = (magnitude * 2n + divisor) / (divisor * 2n)

  return Number(negative ? -rounded : rounded)
}

export type CalcLine = {
  quantityMilli: number
  unitPriceMinor: number
  /** `null` means "the invoice's default": 0 under Kleinunternehmer. */
  taxRateBp: number | null
}

export type TaxGroup = { rateBp: number; netMinor: number; taxMinor: number }

export type InvoiceTotals = {
  /** Each line's net amount, in the order given. */
  lineNetMinor: number[]
  subtotalMinor: number
  discountMinor: number
  netMinor: number
  taxMinor: number
  totalMinor: number
  /** Net after discount and the tax on it, per rate, highest rate first. */
  taxGroups: TaxGroup[]
}

export const lineNetMinor = (line: Pick<CalcLine, 'quantityMilli' | 'unitPriceMinor'>): number =>
  mulDivRound(line.quantityMilli, line.unitPriceMinor, QUANTITY_SCALE)

/**
 * The rate a line is actually taxed at.
 *
 * Under Kleinunternehmer (§ 19 UStG) no tax is charged, whatever a line says.
 * A reverse-charge invoice likewise shows no German tax. Otherwise an empty
 * rate falls back to the default the owner set (19 % unless changed).
 */
export const effectiveRateBp = (
  line: Pick<CalcLine, 'taxRateBp'>,
  context: { taxMode: TaxMode; reverseCharge: boolean; defaultRateBp: number },
): number => {
  if (context.taxMode === 'kleinunternehmer' || context.reverseCharge) return 0

  return line.taxRateBp ?? context.defaultRateBp
}

/**
 * Splits `amount` across `weights` in proportion, so the parts always add up
 * to exactly `amount` — the largest-remainder method, ties to the earlier
 * part. Used to spread an invoice-level discount over its tax groups.
 */
export const allocateProportionally = (amount: number, weights: number[]): number[] => {
  const total = weights.reduce((sum, weight) => sum + weight, 0)

  if (total <= 0 || amount === 0) return weights.map(() => 0)

  const exact = weights.map((weight) => {
    const product = BigInt(amount) * BigInt(weight)
    const floor = product / BigInt(total)

    return { floor: Number(floor), remainder: Number(product - floor * BigInt(total)) }
  })
  let left = amount - exact.reduce((sum, part) => sum + part.floor, 0)
  const order = exact
    .map((part, index) => ({ index, remainder: part.remainder }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  const parts = exact.map((part) => part.floor)

  for (const { index } of order) {
    if (left <= 0) break

    parts[index] = parts[index]! + 1
    left -= 1
  }

  return parts
}

/** The discount in money. A fixed discount larger than the subtotal is capped. */
export const discountMinor = (
  subtotal: number,
  discount: { type: DiscountType; value: number },
): number => {
  if (discount.type === 'percent') return mulDivRound(subtotal, Math.min(discount.value, 10_000), 10_000)
  if (discount.type === 'fixed') return Math.min(Math.max(discount.value, 0), subtotal)

  return 0
}

export const computeTotals = (input: {
  lines: CalcLine[]
  discount: { type: DiscountType; value: number }
  taxMode: TaxMode
  reverseCharge: boolean
  defaultRateBp: number
}): InvoiceTotals => {
  const nets = input.lines.map(lineNetMinor)
  const subtotal = nets.reduce((sum, net) => sum + net, 0)
  const discount = discountMinor(subtotal, input.discount)

  const byRate = new Map<number, number>()

  input.lines.forEach((line, index) => {
    const rate = effectiveRateBp(line, input)

    byRate.set(rate, (byRate.get(rate) ?? 0) + nets[index]!)
  })

  const rates = [...byRate.keys()].sort((a, b) => b - a)
  const groupNets = rates.map((rate) => byRate.get(rate)!)
  const groupDiscounts = allocateProportionally(discount, groupNets)
  const taxGroups = rates.map((rateBp, index) => {
    const net = groupNets[index]! - groupDiscounts[index]!

    return { rateBp, netMinor: net, taxMinor: mulDivRound(net, rateBp, 10_000) }
  })
  const tax = taxGroups.reduce((sum, group) => sum + group.taxMinor, 0)
  const net = subtotal - discount

  return {
    lineNetMinor: nets,
    subtotalMinor: subtotal,
    discountMinor: discount,
    netMinor: net,
    taxMinor: tax,
    totalMinor: net + tax,
    taxGroups,
  }
}

/* ------------------------------------------------------------ installments */

export type InstallmentInput = { dueDate: string; amountMinor: number }

/**
 * What is wrong with a payment plan, as sentences; empty when it is sound.
 *
 * The plan must add up to the total exactly — a plan one cent short would
 * leave a balance nobody asked for — every amount must be positive, and the
 * dates may not go backwards.
 */
export const installmentProblems = (
  installments: InstallmentInput[],
  totalMinor: number,
  issueDate?: string,
): string[] => {
  if (installments.length === 0) return []

  const problems: string[] = []
  const sum = installments.reduce((total, part) => total + part.amountMinor, 0)

  if (installments.some((part) => !Number.isInteger(part.amountMinor) || part.amountMinor <= 0)) {
    problems.push('Every installment needs an amount above zero')
  }

  if (sum !== totalMinor) {
    problems.push(
      `The installments add up to ${formatMinor(sum)}, but the invoice total is ${formatMinor(totalMinor)}`,
    )
  }

  for (let index = 1; index < installments.length; index += 1) {
    if (installments[index]!.dueDate < installments[index - 1]!.dueDate) {
      problems.push('Installment dates must not go backwards')
      break
    }
  }

  if (issueDate && installments[0] && installments[0].dueDate < issueDate) {
    problems.push('The first installment cannot be due before the invoice date')
  }

  return problems
}

/**
 * Splits a total into parts by percentage, putting any rounding cent on the
 * last part so the plan always adds up. A proposal for the form — the owner
 * then edits the amounts freely.
 */
export const splitByPercent = (totalMinor: number, percents: number[]): number[] => {
  const parts = percents.map((percent) => mulDivRound(totalMinor, Math.round(percent * 100), 10_000))
  const drift = totalMinor - parts.reduce((sum, part) => sum + part, 0)

  if (parts.length > 0) parts[parts.length - 1] = parts[parts.length - 1]! + drift

  return parts
}

/* ------------------------------------------------------------------ money */

/** `123456` → `1234.56`, for messages and CSV. Never for arithmetic. */
export const formatMinor = (minor: number): string => {
  const negative = minor < 0
  const magnitude = Math.abs(Math.round(minor))
  const whole = Math.floor(magnitude / 100)
  const cents = String(magnitude % 100).padStart(2, '0')

  return `${negative ? '-' : ''}${whole}.${cents}`
}

/** Amount with a locale's separators, for the printed document. */
export const formatMoney = (minor: number, currency: Currency, language: 'de' | 'en'): string => {
  const negative = minor < 0
  const magnitude = Math.abs(Math.round(minor))
  const whole = String(Math.floor(magnitude / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/gu,
    language === 'de' ? '.' : ',',
  )
  const cents = String(magnitude % 100).padStart(2, '0')
  const number = `${whole}${language === 'de' ? ',' : '.'}${cents}`
  const sign = negative ? '-' : ''

  if (language === 'de') return `${sign}${number} ${currency === 'EUR' ? '€' : 'USD'}`

  return `${sign}${currency === 'EUR' ? '€' : 'US$'}${number}`
}

/* ------------------------------------------------------------ conversion */

/**
 * A rate as an exact integer of millionths: `"1.0876"` → `1087600`. Refuses
 * anything that is not a plain positive decimal, so a rate can never be
 * `NaN`, negative or written in exponent notation.
 */
export const parseRateMicro = (rate: string): number | null => {
  const text = rate.trim()

  if (!/^\d{1,6}(\.\d{1,6})?$/u.test(text)) return null

  const [whole, fraction = ''] = text.split('.')
  const micro = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, '0'))

  return micro > 0 ? micro : null
}

/** EUR minor units into USD minor units at a rate "1 EUR = rate USD". */
export const convertMinor = (amountMinor: number, rateMicro: number): number =>
  mulDivRound(amountMinor, rateMicro, 1_000_000)
