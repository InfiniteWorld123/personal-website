/**
 * The three languages the public blog is published in. Written out rather
 * than imported from a Backend2 contract, so the page bundle does not carry
 * the contract's validation schemas.
 */
export const POST_LANGUAGES = ['de', 'en', 'ar'] as const

export type PostLanguage = (typeof POST_LANGUAGES)[number]
