/**
 * How V2 writes money and dates.
 *
 * German formatting with English labels, which is the combination the owner
 * chose: he reads `8.450 €` and `20.09.2026` without translating, but the
 * interface itself stays in one language.
 *
 * Deliberately not `features/invoices/invoice-format`. That one belongs to the
 * legacy backend and speaks its shapes; V2 keeps its own so the two can be cut
 * apart later without a shared helper holding them together.
 *
 * Money arrives in cents and stays an integer until the last moment. Nothing
 * here rounds, sums or converts — the figure it is given is the figure it
 * prints.
 */

const MONEY = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const MONEY_EXACT = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
})

const COUNT = new Intl.NumberFormat('de-DE')

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** `845000` → `8.450 €`. Cents are dropped, because a whole-euro figure on a
    dashboard card reads faster than one carrying `,00` it never needs. */
export const money = (cents: number) => MONEY.format(Math.round(cents / 100))

/** `124050` → `1.240,50 €`. For a line that names one invoice, where the cents
    are part of the actual document. */
export const moneyExact = (cents: number) => MONEY_EXACT.format(cents / 100)

/** `1284` → `1.284`. */
export const count = (value: number) => COUNT.format(value)

/** `+18 %` / `−4 %`, with a real minus sign rather than a hyphen. */
export const percentChange = (value: number) =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)} %`

export const date = (value: Date | string) =>
  DATE.format(typeof value === 'string' ? new Date(value) : value)
