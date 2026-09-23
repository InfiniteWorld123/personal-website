import { berlinToday } from '../../contracts/invoice.contract'

/**
 * The one clock Invoices reads.
 *
 * Every "today" — the issue date, what is overdue, which subscription period
 * is due — comes from here, as a Berlin calendar day. The tests move it to
 * prove behaviour across months, leap years and daylight-saving changes
 * without waiting for them.
 */

let fixed: Date | undefined

export const useInvoiceClockForTest = (now: Date | string | undefined): void => {
  fixed = now === undefined ? undefined : new Date(now)
}

export const now = (): Date => (fixed ? new Date(fixed) : new Date())

export const today = (): string => berlinToday(now())
