/** A sentence, a list of sentences, or a price. */
export type ContentValue = string | string[] | number

/** What a public page render needs: the saved values only, grouped by language. */
export type PublishedContent = {
  de: Record<string, ContentValue>
  en: Record<string, ContentValue>
  ar: Record<string, ContentValue>
  shared: Record<string, ContentValue>
}
