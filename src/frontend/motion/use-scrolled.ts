import { useEffect, useState } from 'react'

/**
 * True once the page has moved past `threshold`. The header uses it to give up
 * a little height after the first scroll.
 *
 * The listener reads `scrollY` directly: the browser already fires scroll at
 * most once per frame, and reading the offset costs nothing because the value
 * is what the scroll itself just produced.
 */
export function useScrolled(threshold = 40) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const read = () => setScrolled(window.scrollY > threshold)

    read()
    window.addEventListener('scroll', read, { passive: true })
    return () => window.removeEventListener('scroll', read)
  }, [threshold])

  return scrolled
}
