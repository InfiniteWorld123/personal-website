import { createFileRoute } from '@tanstack/react-router'
import { InboxPage } from '#/frontend/pages/admin/inbox/InboxPage'
import { LETTER_KINDS, type LetterKind } from '#/shared/validation/invoice.validation'

/**
 * One conversation open. The same screen as the list, not a second one — on a
 * wide display the list stays beside it, and on a phone it replaces it.
 *
 * `?invoice=…` is how the invoicing section hands a letter over: it says which
 * document the composer should open on. In the URL rather than in router state
 * on purpose — a refresh in the middle of writing must not lose the letter, and
 * the id is enough to ask the server for it again.
 */
/**
 * Both keys are **optional**, and the omitted-rather-than-undefined shape
 * matters: a key present with an undefined value makes the router treat
 * `search` as required, and every existing link into a conversation — from the
 * inbox list, the person's file, the compose page — would have to start passing
 * an empty one.
 */
type InboxSearch = { invoice?: string; letter?: LetterKind }

export const Route = createFileRoute('/admin/inbox/$personId')({
  validateSearch: (search: Record<string, unknown>): InboxSearch => {
    const invoice = typeof search.invoice === 'string' ? search.invoice : ''
    const asked = typeof search.letter === 'string' ? search.letter.toUpperCase() : ''
    const letter = (LETTER_KINDS as readonly string[]).includes(asked)
      ? (asked as LetterKind)
      : undefined

    return {
      ...(invoice === '' ? {} : { invoice }),
      ...(letter === undefined ? {} : { letter }),
    }
  },
  component: PersonRoute,
})

function PersonRoute() {
  const { personId } = Route.useParams()
  const { invoice, letter } = Route.useSearch()

  return (
    <InboxPage
      personId={personId}
      letterFor={invoice ? { invoiceId: invoice, kind: letter ?? 'INVOICE' } : null}
    />
  )
}
