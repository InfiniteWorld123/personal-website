import { applyContentOverrides, emptyOverrides } from '#/frontend/content/overrides'
import type { PublishedContent } from '#/shared/types/content.types'

/**
 * Puts the published overrides into the content module before the page under
 * them renders.
 *
 * Applied during render rather than in an effect on purpose: an effect runs
 * after the first paint, so the browser would hydrate the code's wording over
 * the server's published wording and React would report a mismatch. The call
 * is idempotent — an unchanged payload does nothing at all — which is what
 * makes running it on every render safe.
 */

let lastSignature: string | undefined

export const useContentOverrides = (published: PublishedContent | undefined): void => {
  if (!published) return

  const signature = JSON.stringify(published)
  if (signature === lastSignature) return

  lastSignature = signature

  applyContentOverrides({
    ...emptyOverrides(),
    de: published.de,
    en: published.en,
    ar: published.ar,
    shared: published.shared,
  })
}
