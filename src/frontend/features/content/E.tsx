import { useResolvedList, useResolvedText } from './content-overlay'

/**
 * Marks a string on a public page as one the owner may rewrite from
 * `/admin/content`.
 *
 *   <E k="home.hero.headline">{home.hero.headline}</E>
 *
 * It renders its child and nothing else — no wrapper element, no attributes.
 * The only thing it adds is that inside the editor's preview pane the same
 * string shows the unpublished wording instead of the published one, so the
 * owner can see a change in place before anyone else does.
 *
 * Where a component needs the string itself rather than a rendered one — a
 * heading that animates by splitting its own words, a list that cycles —
 * `useResolvedText` and `useResolvedList` do the same job.
 */
export function E({ k, index, children }: { k: string; index?: number; children: string }) {
  const list = useResolvedList(index === undefined ? undefined : k, [])
  const text = useResolvedText(index === undefined ? k : undefined, children)

  if (index !== undefined) return <>{list[index] ?? children}</>

  return <>{text}</>
}
