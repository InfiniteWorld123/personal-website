import { createFileRoute } from '@tanstack/react-router'
import { InboxPage } from '#/frontend/pages/admin/inbox/InboxPage'
import type { LetterTarget } from '#/shared/types/invoice.types'
import { LETTER_KINDS, type LetterKind } from '#/shared/validation/invoice.validation'

/**
 * One conversation open. The same screen as the list, not a second one — on a
 * wide display the list stays beside it, and on a phone it replaces it.
 *
 * `?invoice=…` is how the invoicing section hands a letter over: it says which
 * document the composer should open on. In the URL rather than in router state
 * on purpose — a refresh in the middle of writing must not lose the letter, and
 * the id is enough to ask the server for it again.
 *
 * `?subscription=…` is the same handover for the agreement a subscription
 * starts with. A second key rather than a widened first one, because the two
 * ids point at different tables and a single `document=` would leave the
 * composer guessing which.
 */
/**
 * Every key is **optional**, and the omitted-rather-than-undefined shape
 * matters: a key present with an undefined value makes the router treat
 * `search` as required, and every existing link into a conversation — from the
 * inbox list, the person's file, the compose page — would have to start passing
 * an empty one.
 */
type InboxSearch = { invoice?: string; letter?: LetterKind; subscription?: string }

export const Route = createFileRoute('/admin/inbox/$personId')({
  validateSearch: (search: Record<string, unknown>): InboxSearch => {
    const invoice = typeof search.invoice === 'string' ? search.invoice : ''
    const subscription = typeof search.subscription === 'string' ? search.subscription : ''
    const asked = typeof search.letter === 'string' ? search.letter.toUpperCase() : ''
    const letter = (LETTER_KINDS as readonly string[]).includes(asked)
      ? (asked as LetterKind)
      : undefined

    return {
      ...(invoice === '' ? {} : { invoice }),
      ...(letter === undefined ? {} : { letter }),
      ...(subscription === '' ? {} : { subscription }),
    }
  },
  component: PersonRoute,
})

/**
 * An invoice wins if both are somehow in the URL.
 *
 * They cannot both be put there by anything on the screen, so this only
 * decides what a hand-typed address does. It picks the one that demands money,
 * because that is the document whose letter must never be quietly replaced by
 * another.
 */
const targetOf = (search: InboxSearch): LetterTarget | null => {
  if (search.invoice) return { invoiceId: search.invoice, kind: search.letter ?? 'INVOICE' }
  if (search.subscription) return { subscriptionId: search.subscription }

  return null
}

function PersonRoute() {
  const { personId } = Route.useParams()
  const search = Route.useSearch()

  return <InboxPage personId={personId} letterFor={targetOf(search)} />
}
