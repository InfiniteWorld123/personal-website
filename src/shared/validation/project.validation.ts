/**
 * The three languages the public project pages are published in. Written out
 * rather than imported from a Backend2 contract, so the page bundle does not
 * carry the contract's validation schemas.
 */
export const PROJECT_LANGUAGES = ['de', 'en', 'ar'] as const

export type ProjectLanguage = (typeof PROJECT_LANGUAGES)[number]

/** The site's two words for a project: finished ("Live") or not ("In progress"). */
export type ProjectStatus = 'live' | 'building'
