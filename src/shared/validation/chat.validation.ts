import * as v from 'valibot'

/**
 * The contract for the public assistant (D34).
 *
 * The three languages are written out here rather than imported, for the same
 * reason `booking.validation.ts` writes them out: this contract should read on
 * its own, and the database enforces the same list in a CHECK.
 */
export const CHAT_LANGUAGES = ['de', 'en', 'ar'] as const

export type ChatLanguage = (typeof CHAT_LANGUAGES)[number]

/**
 * A question is one message, not an essay. The ceiling is low on purpose:
 * this endpoint's cost scales with what a stranger types, and nothing a
 * visitor legitimately asks an FAQ assistant runs past a few sentences.
 */
export const CHAT_MESSAGE_MAX_LENGTH = 600

/** Enough to tell Leistungen from a blog post; not enough to carry a query string. */
export const CHAT_PATH_MAX_LENGTH = 120

export const ChatLanguageSchema = v.picklist(CHAT_LANGUAGES, 'That language is not published')

export const ChatAskSchema = v.object({
  message: v.pipe(
    v.string('A question is required'),
    v.trim(),
    v.nonEmpty('A question is required'),
    v.maxLength(CHAT_MESSAGE_MAX_LENGTH, 'That message is too long'),
  ),

  language: ChatLanguageSchema,

  /**
   * Absent on the first message, present afterwards. Optional rather than
   * required-with-a-sentinel so a widget that lost its id simply starts a new
   * conversation instead of failing.
   */
  conversationId: v.optional(v.pipe(v.string(), v.uuid('That is not a valid conversation'))),

  /**
   * The path the bubble was opened from. Trimmed to a path by the service
   * before it is stored — a visitor can put anything in this field, and a
   * query string is exactly the place personal data would arrive by accident.
   */
  path: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(CHAT_PATH_MAX_LENGTH, 'That path is too long')),
    '',
  ),
})

export type ChatAskInput = v.InferOutput<typeof ChatAskSchema>
