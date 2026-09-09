import { useEffect, useRef } from 'react'
import { markMotionReady } from './motion'

const SCOPE_ATTRIBUTE = 'data-reveal-scope'

/**
 * Reveals a section once, as it scrolls into view.
 *
 * The returned ref marks the scope. Every `[data-reveal]` descendant that
 * belongs to *this* scope is numbered, and the numbers become CSS transition
 * delays, so a grid of cards rises in sequence rather than all at once.
 *
 * The resting DOM state is the finished page: the hidden state only exists
 * under `html.motion`, which is never set for visitors who prefer reduced
 * motion or who have no JavaScript.
 */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const scope = ref.current
    if (!scope) return

    markMotionReady()
    // Components render the attribute so the hidden state exists on the first
    // painted frame; this is only a guard for a caller that forgot it.
    if (!scope.hasAttribute(SCOPE_ATTRIBUTE)) scope.setAttribute(SCOPE_ATTRIBUTE, '')

    // Descendants inside a nested scope belong to that scope, not this one.
    const targets = [...scope.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
      (element) => element.closest(`[${SCOPE_ATTRIBUTE}]`) === scope,
    )
    targets.forEach((element, index) => element.style.setProperty('--reveal-i', String(index)))

    const show = () => scope.classList.add('is-in')

    if (typeof IntersectionObserver === 'undefined') {
      show()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        show()
        observer.disconnect()
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    )

    observer.observe(scope)
    return () => observer.disconnect()
  }, [])

  return ref
}
