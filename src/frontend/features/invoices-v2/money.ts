import type { Currency } from '#/backend2/contracts/invoice-calc.contract'

/**
 * Amounts as the owner types and reads them. Arithmetic never happens here:
 * the shared contract (`invoice-calc.contract.ts`) does it in whole cents,
 * exactly as the server does, and these only translate between cents and text.
 */

/** `189000` → `1890.00`: what a price field shows. */
export const minorToText = (minor: number | null | undefined): string => {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return ''

  const magnitude = Math.abs(Math.round(minor))

  return `${minor < 0 ? '-' : ''}${Math.floor(magnitude / 100)}.${String(magnitude % 100).padStart(2, '0')}`
}

/**
 * `1890`, `1890.5`, `1890,50` or `1,890.00` into cents; `null` for anything
 * that is not plainly an amount, including an empty field.
 */
export const parseMoney = (text: string): number | null => {
  const value = text.replace(/[\s€$]|US/gu, '')

  if (value === '') return null

  const plain = /^(\d{1,9})(?:[.,](\d{1,2}))?$/u.exec(value)
  const grouped = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/u.exec(value)
  const match = plain ?? grouped

  if (!match) return null

  const whole = Number(match[1]!.replace(/,/gu, ''))
  const cents = Number((match[2] ?? '').padEnd(2, '0'))

  return whole * 100 + cents
}

/** `1`, `1.5` or `2,25` hours into thousandths; `null` when it is not one. */
export const parseQuantity = (text: string): number | null => {
  const match = /^(\d{1,6})(?:[.,](\d{1,3}))?$/u.exec(text.trim())

  if (!match) return null

  return Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'))
}

export const milliToText = (milli: number): string => {
  const whole = Math.floor(milli / 1000)
  const fraction = String(milli % 1000).padStart(3, '0').replace(/0+$/u, '')

  return fraction === '' ? String(whole) : `${whole}.${fraction}`
}

/** `10` or `12.5` percent into basis points; `null` when it is not one. */
export const parsePercent = (text: string): number | null => {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?\s*%?$/u.exec(text.trim())

  if (!match) return null

  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
}

export const bpToText = (bp: number): string => {
  const rest = bp % 100

  return rest ? `${Math.floor(bp / 100)}.${String(rest).padStart(2, '0').replace(/0$/u, '')}` : String(bp / 100)
}

const formatters = new Map<Currency, Intl.NumberFormat>()

/** `€1,890.00` / `US$2,050.00` — the Dashboard is English. */
export const formatAmount = (minor: number, currency: Currency): string => {
  let format = formatters.get(currency)

  if (!format) {
    format = new Intl.NumberFormat('en-GB', { style: 'currency', currency })
    formatters.set(currency, format)
  }

  return format.format(minor / 100)
}

/** `2026-10-07` → `7 Oct 2026`, read as a calendar day, whatever the browser's zone. */
export const formatDate = (date: string | null | undefined, withYear = true): string => {
  if (!date) return '—'

  const [year, month, day] = date.slice(0, 10).split('-').map(Number)

  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  })
}

/** An instant, as the owner reads it in Berlin: `22 Sep, 14:05`. */
export const formatMoment = (iso: string | null | undefined): string => {
  if (!iso) return '—'

  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  })
}

/** The Berlin calendar day of an instant: `2026-09-23T22:40Z` → `24 Sept 2026`. */
export const formatDay = (iso: string | null | undefined): string => {
  if (!iso) return '—'

  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Berlin' })
}
