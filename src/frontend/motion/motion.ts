/**
 * The motion layer is CSS driven. JavaScript only decides *when* an element
 * has entered the viewport and *where* the pointer is; every transition and
 * keyframe lives in `styles.css`.
 *
 * `html.motion` is the single switch. The inline script in `__root.tsx` adds
 * it before first paint when the visitor has not asked for reduced motion,
 * and removes it again if this module never signals that it is ready, so a
 * failed script can never leave content parked at `opacity: 0`.
 */
export const MOTION_CLASS = 'motion'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
export const FINE_POINTER_QUERY = '(min-width: 1024px) and (pointer: fine)'

/** Tells the failsafe in the boot script that the motion layer is alive. */
export function markMotionReady() {
  if (typeof window === 'undefined') return
  ;(window as Window & { __motionReady?: boolean }).__motionReady = true
}

/**
 * `matchMedia` is missing in jsdom and in a few old embedded browsers. Motion
 * is an enhancement, so the honest answer there is "no query, no effect".
 */
export function matchMediaSafe(query: string): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(query)
}

export function motionEnabled() {
  return typeof document !== 'undefined' && document.documentElement.classList.contains(MOTION_CLASS)
}

/**
 * Inline script for the document head. It runs before first paint, so the
 * "from" state of an entrance is in place on the very first frame instead of
 * flashing the finished layout first.
 *
 * The timer is the safety net: if the motion layer never mounts — a failed
 * chunk, an old browser, a script error — the class goes away and the page is
 * simply the complete, static page.
 */
export const MOTION_BOOT_SCRIPT = `(() => {
  try {
    var root = document.documentElement;
    if (window.matchMedia('${REDUCED_MOTION_QUERY}').matches) return;
    root.classList.add('${MOTION_CLASS}');
    setTimeout(function () {
      if (!window.__motionReady) root.classList.remove('${MOTION_CLASS}');
    }, 2500);
  } catch (error) {}
})();`
