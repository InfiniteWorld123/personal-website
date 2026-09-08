import { useEffect, useState } from 'react'

const query = '(prefers-reduced-motion: reduce)'

/**
 * Whether the visitor asked for reduced motion. Starts `true` so the server
 * render and the first client render agree and nothing moves before the
 * preference is known; follows the media query afterwards.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true)

  useEffect(() => {
    const media = window.matchMedia(query)
    const sync = () => setReduced(media.matches)

    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  return reduced
}
