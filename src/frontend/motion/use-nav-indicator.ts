import { useEffect, useRef } from 'react'

/**
 * Places the single capsule that sits behind the nav links: on the active
 * link at rest, on whichever link the pointer is over, and back on the
 * active one when the pointer leaves.
 *
 * The active link is read from the DOM (`data-status`, which the router
 * sets) rather than from the pathname, so the hook does not have to repeat
 * the router's idea of which route counts as active.
 *
 * Offsets are measured against the nav itself and applied as a physical
 * `translateX`, so the same arithmetic holds in both writing directions.
 * `revision` re-measures after a navigation or a language change, where the
 * labels — and with them the widths — are new.
 */
export function useNavIndicator<T extends HTMLElement>(revision: string) {
  const navRef = useRef<T>(null)

  useEffect(() => {
    const nav = navRef.current
    const indicator = nav?.querySelector<HTMLElement>('.nav-indicator')
    if (!nav || !indicator) return

    let alive = true

    const place = (link: HTMLElement | null) => {
      if (!link) {
        nav.dataset.indicator = 'off'
        return
      }

      const navBox = nav.getBoundingClientRect()
      const linkBox = link.getBoundingClientRect()

      indicator.style.width = `${linkBox.width}px`
      indicator.style.transform = `translateX(${linkBox.left - navBox.left}px)`
      nav.dataset.indicator = 'on'
    }

    const rest = () => {
      if (alive) place(nav.querySelector<HTMLElement>('[data-status="active"]'))
    }

    const follow = (event: Event) => place(event.currentTarget as HTMLElement)

    const links = Array.from(nav.querySelectorAll<HTMLElement>('a'))
    links.forEach((link) => link.addEventListener('pointerenter', follow))
    nav.addEventListener('pointerleave', rest)
    window.addEventListener('resize', rest)

    rest()
    // The labels are measured before the web fonts land; the fallback face
    // is a different width, so the first placement would be off by a few
    // pixels and stay there until something else moved the capsule.
    document.fonts?.ready.then(rest)

    return () => {
      alive = false
      links.forEach((link) => link.removeEventListener('pointerenter', follow))
      nav.removeEventListener('pointerleave', rest)
      window.removeEventListener('resize', rest)
    }
  }, [revision])

  return navRef
}
