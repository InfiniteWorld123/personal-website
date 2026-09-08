import Lenis from 'lenis'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { gsap, ScrollTrigger, registerMotionPlugins } from './motion'

type MotionContextValue = {
  /** True when the visitor asked for reduced motion, or JS has not resolved yet. */
  reducedMotion: boolean
  lenis: Lenis | null
}

const MotionContext = createContext<MotionContextValue>({ reducedMotion: true, lenis: null })

/**
 * Owns smooth scrolling and the GSAP ticker.
 *
 * Motion is progressive enhancement: the page is complete and readable with
 * animation disabled. When the visitor prefers reduced motion, Lenis is never
 * started and native scrolling is left untouched.
 */
export function MotionProvider({
  children,
  smoothScroll = false,
}: {
  children: ReactNode
  /**
   * Off by default: Lenis changes how the whole site scrolls, so it is opted
   * into per page rather than applied globally.
   */
  smoothScroll?: boolean
}) {
  const [reducedMotion, setReducedMotion] = useState(true)
  const [lenis, setLenis] = useState<Lenis | null>(null)
  const [desktopPointer, setDesktopPointer] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px) and (pointer: fine)')
    const sync = () => setDesktopPointer(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    let active = true
    registerMotionPlugins()
    void document.fonts?.ready.then(() => {
      if (active) ScrollTrigger.refresh()
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    const sync = () => setReducedMotion(media.matches)

    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    registerMotionPlugins()

    if (reducedMotion || !smoothScroll || !desktopPointer) {
      // Native scrolling; `scroll-behavior: smooth` in the stylesheet is
      // disabled for these visitors by the reduced-motion media query.
      setLenis(null)
      return
    }

    const instance = new Lenis({ duration: 0.8, smoothWheel: true, anchors: true })

    const onScroll = () => ScrollTrigger.update()
    instance.on('scroll', onScroll)

    const tick = (time: number) => instance.raf(time * 1000)
    gsap.ticker.add(tick)

    setLenis(instance)

    return () => {
      gsap.ticker.remove(tick)
      instance.off('scroll', onScroll)
      instance.destroy()
      setLenis(null)
    }
  }, [reducedMotion, smoothScroll, desktopPointer])

  const value = useMemo(() => ({ reducedMotion, lenis }), [reducedMotion, lenis])

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
}

export function useMotion() {
  return useContext(MotionContext)
}
