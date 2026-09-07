import type { RefObject } from 'react'
import { gsap } from './motion'
import { useGsap } from './use-gsap'

/**
 * Reveals every `[data-reveal]` descendant of `scope` as it scrolls into
 * view: a short rise and fade, staggered. The resting DOM state is fully
 * visible, so visitors who prefer reduced motion see the finished page.
 */
export function useReveal<T extends HTMLElement>(scope: RefObject<T | null>) {
  useGsap(scope, () => {
    const targets = gsap.utils.toArray<HTMLElement>('[data-reveal]')

    if (targets.length === 0) return

    gsap.from(targets, {
      y: 18,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
      stagger: 0.07,
      scrollTrigger: { trigger: scope.current, start: 'top 78%', once: true },
    })
  })
}
