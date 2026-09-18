import type { ChatSettings } from '../chat.settings'

/**
 * What the public assistant endpoint hands back (D34).
 *
 * Explicit projections, like every other public contract here: the visitor is
 * never shown a database row. There is no id for the message and no timestamp,
 * because the widget has no use for either and a field nobody reads is a field
 * that eventually leaks something.
 */

export type ChatAuthor = 'VISITOR' | 'ASSISTANT'

export type ChatAnswer = {
  /**
   * Minted by the server on the first message and carried by the widget for
   * the rest of the visit. Not a login and not a cookie: it identifies a
   * conversation, never a person, and it dies with the browser tab.
   */
  conversationId: string
  /** What to show. Already shaped for the configured tone. */
  reply: string
  /**
   * True when the book had no answer and the fallback spoke instead. The
   * widget uses it to render the contact details as a real link rather than
   * as text inside a sentence.
   */
  fallback: boolean
  /** Messages this visitor has left in this conversation, against the ceiling. */
  used: number
  limit: number
  /** False once the ceiling is reached; the composer closes itself. */
  canContinue: boolean
}

/**
 * Everything the widget needs to render before anyone types, fetched with the
 * page rather than hard-coded in the bundle — so a settings change reaches a
 * visitor on the next request instead of the next deploy.
 */
export type ChatIntro = {
  /** The subset of the settings the browser actually needs. */
  settings: Pick<ChatSettings, 'launcher' | 'side' | 'reveal' | 'opening' | 'disclosure'>
  greeting: string
  /** Shown as chips under the greeting. Empty unless `opening` is `suggestions`. */
  suggestions: string[]
  /** The sentence that says a machine is answering. Never empty. */
  disclosure: string
  limit: number
}
