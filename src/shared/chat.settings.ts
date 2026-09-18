/**
 * The eleven switches, in one place (D34).
 *
 * Every one of these was a question the owner answered in a prototype before
 * a line of this was written, and several of them he will answer differently
 * once he lives with the result. More to the point: the client he sells this
 * to will want different answers than he does. So they are a configuration
 * object rather than eleven decisions scattered through a service and a
 * component — a sold setting instead of a rebuild.
 *
 * Read by both sides. The backend owns behaviour, the widget owns shape.
 * There is no language switch: the assistant answers in the language of the
 * page it sits on, which is the route's own `$lang`, not a setting.
 */

/** What it does when the book has no answer. */
export const CHAT_FALLBACKS = ['contact', 'inbox'] as const
export type ChatFallback = (typeof CHAT_FALLBACKS)[number]

/** How much it is allowed to say about money. */
export const CHAT_PRICE_MODES = ['range', 'exact', 'silent'] as const
export type ChatPriceMode = (typeof CHAT_PRICE_MODES)[number]

/** The first thing the visitor sees when the panel opens. */
export const CHAT_OPENINGS = ['silent', 'greeting', 'suggestions'] as const
export type ChatOpening = (typeof CHAT_OPENINGS)[number]

/** How the answer is worded. */
export const CHAT_TONES = ['formal', 'warm', 'terse'] as const
export type ChatTone = (typeof CHAT_TONES)[number]

/** The closed button's shape. */
export const CHAT_LAUNCHERS = ['circle', 'pill', 'bar'] as const
export type ChatLauncher = (typeof CHAT_LAUNCHERS)[number]

/** Whether the answer appears at once or is typed out. */
export const CHAT_REVEALS = ['instant', 'stream'] as const
export type ChatReveal = (typeof CHAT_REVEALS)[number]

/** How plainly it admits to being a machine. Never fully off — see below. */
export const CHAT_DISCLOSURES = ['always', 'once'] as const
export type ChatDisclosure = (typeof CHAT_DISCLOSURES)[number]

export type ChatSettings = {
  fallback: ChatFallback
  prices: ChatPriceMode
  opening: ChatOpening
  tone: ChatTone
  launcher: ChatLauncher
  /** `end` is the corner the reading direction ends in — right in German, left in Arabic. */
  side: 'start' | 'end'
  reveal: ChatReveal
  disclosure: ChatDisclosure
  /**
   * Days a conversation is kept before it deletes itself. The owner delegated
   * this one and it was set at 30: what he wants to learn — what people ask,
   * where the assistant failed — lives in this month, and an archive is
   * liability without a matching use. `0` would mean keep forever and is
   * deliberately not offered; if it is ever wanted it is a decision, not a
   * setting change.
   */
  retentionDays: 7 | 30 | 90
  /** Messages one visitor may send in one conversation. This is the cost ceiling. */
  visitorMessageLimit: number
  /** Conversations one address may start in a day. This is the other one. */
  conversationsPerAddressPerDay: number
}

/**
 * The owner's own answers, as given.
 *
 * `fallback: 'contact'` is his, against my recommendation — I argued for
 * `inbox`, because a question the assistant could not answer is the most
 * valuable thing the system ever sees, and handing it to the existing inbox
 * costs almost nothing to build. He chose to show the contact details instead
 * and not chase the visitor. `first_unanswered_at` in the schema is the
 * compromise: he still learns *that* it failed and what was asked, without the
 * assistant asking a stranger for an address.
 */
export const CHAT_SETTINGS: ChatSettings = {
  fallback: 'contact',
  prices: 'range',
  opening: 'suggestions',
  tone: 'formal',
  launcher: 'pill',
  side: 'end',
  reveal: 'stream',
  disclosure: 'always',
  retentionDays: 30,
  visitorMessageLimit: 20,
  conversationsPerAddressPerDay: 12,
}

/**
 * Not a setting, on purpose.
 *
 * The prototype offered "hidden" as a third disclosure option and coloured it
 * red. It is not carried into the code: a German business site that lets a
 * visitor believe a person is answering is the one thing on this list that is
 * not merely unwise. `always` and `once` differ in placement, not in whether
 * the visitor is told.
 */
export const CHAT_DISCLOSURE_IS_MANDATORY = true
