/**
 * The two shapes the content API and the content tree agree on.
 *
 * Kept apart from `content.types.ts` because the frontend's content module
 * needs them too, and importing the API's types from inside the copy itself
 * would tie the words on the page to an HTTP contract.
 */

export type ContentLanguage = 'de' | 'en' | 'ar' | '*'

/** A sentence, a list of sentences, or a price. */
export type ContentValue = string | string[] | number
