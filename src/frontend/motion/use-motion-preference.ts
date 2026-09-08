import { useEffect } from 'react'
import { MOTION_CLASS, REDUCED_MOTION_QUERY, matchMediaSafe } from './motion'

/**
 * Keeps `html.motion` in step with the visitor's system setting after load,
 * so turning "reduce motion" on stops the page without a reload.
 */
export function useMotionPreference() {
  useEffect(() => {
    const media = matchMediaSafe(REDUCED_MOTION_QUERY)
    if (!media) return
    const sync = () => document.documentElement.classList.toggle(MOTION_CLASS, !media.matches)

    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])
}
