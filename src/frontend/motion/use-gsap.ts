import { useEffect, useLayoutEffect, useRef } from 'react'
import type { DependencyList, RefObject } from 'react'
import { gsap, registerMotionPlugins } from './motion'
import { useMotion } from './motion-provider'

/**
 * Layout effect in the browser, plain effect on the server (where layout
 * effects only warn). The distinction matters for cleanup order: React runs
 * layout-effect cleanups *before* it removes a component's DOM nodes, but
 * passive-effect cleanups *after*. ScrollTrigger's `pin` wraps the pinned
 * element in a spacer, so reverting it after React has already tried to
 * remove the element throws "The node to be removed is not a child of this
 * node" on every client-side navigation away from the page.
 */
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Runs GSAP work inside a scoped context that is reverted on cleanup, so
 * animations never leak between routes.
 *
 * `dependencies` must keep a constant length between renders, exactly like a
 * plain `useEffect` dependency array.
 *
 * The callback is skipped entirely when the visitor prefers reduced motion —
 * elements keep whatever their CSS resting state is. Never park content at
 * `opacity: 0` in CSS and rely on this hook to reveal it; animate from the
 * visible state instead.
 */
export function useGsap<T extends HTMLElement>(
  scope: RefObject<T | null>,
  callback: (context: gsap.Context) => void,
  dependencies: DependencyList = [],
) {
  const { reducedMotion } = useMotion()
  const callbackRef = useRef(callback)

  useEffect(() => {
    callbackRef.current = callback
  })

  useIsomorphicLayoutEffect(() => {
    if (reducedMotion || !scope.current) return

    registerMotionPlugins()

    const context = gsap.context((self) => callbackRef.current(self), scope.current)

    return () => context.revert()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, scope, ...dependencies])
}
