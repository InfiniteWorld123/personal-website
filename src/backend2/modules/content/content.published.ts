import type { ContentValue } from '../../contracts/content.contract'
import { listPublicValues } from './content.repo'

/**
 * The public site's view of Content, for the page renderer
 * (`docs/v2/public-cutover.md`, step 1): only the wording the owner saved,
 * per language plus the shared facts.
 *
 * A field that was never edited has no row, so the page falls through to the
 * release wording in the code — the same contract the legacy overrides had,
 * which is why switching the source changes nothing a visitor can see until
 * something is edited.
 */
export type PublishedOverrides = {
  de: Record<string, ContentValue>
  en: Record<string, ContentValue>
  ar: Record<string, ContentValue>
  shared: Record<string, ContentValue>
}

export const readPublishedOverrides = async (): Promise<PublishedOverrides> => {
  const value: PublishedOverrides = { de: {}, en: {}, ar: {}, shared: {} }

  for (const language of ['de', 'en', 'ar'] as const) {
    for (const row of await listPublicValues(language)) value[row.language][row.field_key] = row.value
  }

  return value
}
