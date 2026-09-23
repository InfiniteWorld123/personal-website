import type {
  InvoiceInstallment,
  InvoiceKind,
  InvoiceStatus,
  PaymentState,
} from '../../contracts/invoice.contract'

/**
 * What an issued invoice is owed and what it is: pure, so the rules the
 * Dashboard shows are the rules the tests prove.
 *
 * `effectivePaid` is what was received minus what went back. Mirrors
 * `paymentStateSql` in `invoice.repo.ts`, which lists filter with.
 */

export type MoneyFacts = {
  kind: InvoiceKind
  status: InvoiceStatus
  totalMinor: number
  paidMinor: number
  refundedMinor: number
  dueDate: string | null
  installments: Array<{ dueDate: string; amountMinor: number }>
  collectionFailed: boolean
}

export const amountDueMinor = (facts: MoneyFacts): number =>
  facts.kind === 'invoice' && facts.status === 'issued'
    ? Math.max(0, facts.totalMinor - (facts.paidMinor - facts.refundedMinor))
    : 0

/**
 * What could be owed back: everything kept on a cancelled invoice, or what was
 * paid beyond the total on a live one. Only ever shown — a refund is recorded
 * by the owner, never assumed.
 */
export const refundableMinor = (facts: MoneyFacts): number => {
  const kept = facts.paidMinor - facts.refundedMinor

  if (facts.kind !== 'invoice') return 0
  if (facts.status === 'cancelled') return Math.max(0, kept)

  return Math.max(0, kept - facts.totalMinor)
}

/** What should have been paid by the end of yesterday. */
export const dueSoFarMinor = (facts: MoneyFacts, today: string): number => {
  if (facts.installments.length > 0) {
    return facts.installments
      .filter((part) => part.dueDate < today)
      .reduce((sum, part) => sum + part.amountMinor, 0)
  }

  return facts.dueDate !== null && facts.dueDate < today ? facts.totalMinor : 0
}

export const paymentStateOf = (facts: MoneyFacts, today: string): PaymentState => {
  if (facts.kind === 'cancellation' || facts.status === 'draft') return 'not_applicable'
  if (facts.status === 'cancelled') return 'cancelled'

  const effectivePaid = facts.paidMinor - facts.refundedMinor

  if (facts.totalMinor - effectivePaid <= 0) return 'paid'
  if (facts.collectionFailed || dueSoFarMinor(facts, today) > effectivePaid) return 'overdue'
  if (effectivePaid > 0) return 'partially_paid'

  return 'unpaid'
}

/**
 * Payments cover installments oldest first: the plan says what was due when,
 * the payments say how much arrived, and the owner never has to assign one to
 * the other by hand.
 */
export const allocateInstallments = (
  installments: Array<{ position: number; dueDate: string; amountMinor: number; label: string }>,
  effectivePaidMinor: number,
  today: string,
): InvoiceInstallment[] => {
  let left = Math.max(0, effectivePaidMinor)

  return installments.map((part) => {
    const paid = Math.min(left, part.amountMinor)

    left -= paid

    const state: InvoiceInstallment['state'] =
      paid >= part.amountMinor && part.amountMinor > 0
        ? 'paid'
        : part.dueDate < today
          ? 'overdue'
          : paid > 0
            ? 'partially_paid'
            : 'open'

    return { ...part, paidMinor: paid, state }
  })
}
