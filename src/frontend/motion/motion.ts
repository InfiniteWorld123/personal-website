import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

let isRegistered = false

/**
 * GSAP plugins must be registered once, and only in the browser. Calling this
 * more than once is safe.
 */
export function registerMotionPlugins() {
  if (isRegistered || typeof window === 'undefined') return

  gsap.registerPlugin(ScrollTrigger)
  isRegistered = true
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export { gsap, ScrollTrigger }
