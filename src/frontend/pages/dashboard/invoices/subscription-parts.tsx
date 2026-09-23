import type { OwnerSubscription } from '#/backend2/contracts/invoice.contract'
import { StatusChip } from '#/frontend/dashboard/primitives'

/**
 * How a subscription's state reads in a list and in its file: never by colour
 * alone. Amber for paused (neither a problem nor a choice), red only for a card
 * that cannot be charged.
 */

export const subscriptionState = (sub: Pick<OwnerSubscription, 'status' | 'freePeriods' | 'nextPeriodStart' | 'card' | 'collection'>) => {
  if (sub.status === 'ended') return { label: 'Ended', tone: 'outline' as const }
  if (sub.status === 'paused') return { label: 'Paused', tone: 'amber' as const }
  if (sub.collection === 'automatic_card' && sub.card.status === 'invalid') return { label: 'Card problem', tone: 'red' as const }

  const next = sub.nextPeriodStart
  const free = next
    ? sub.freePeriods.some((range) => range.startsOn <= next && (range.endsOn === null || range.endsOn >= next))
    : false

  if (free) return { label: 'Free period', tone: 'grey' as const }

  return { label: 'Active', tone: 'blue' as const }
}

export function SubscriptionChip({ state }: { state: ReturnType<typeof subscriptionState> | { label: string; tone: 'red' } }) {
  if (state.tone === 'amber') {
    return (
      <span className="inv-tone-amber inline-flex h-[22px] shrink-0 items-center rounded-md px-2.5 text-[11px] font-semibold">
        {state.label}
      </span>
    )
  }

  return <StatusChip tone={state.tone}>{state.label}</StatusChip>
}

