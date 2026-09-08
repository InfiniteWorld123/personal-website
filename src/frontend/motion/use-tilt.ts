import { useEffect, useRef } from 'react'
import { FINE_POINTER_QUERY, matchMediaSafe } from './motion'

type TiltOptions = {
  /** Maximum rotation in degrees. The portrait uses a smaller angle than cards. */
  max?: number
  /** Peak opacity of the blue light that follows the pointer. */
  spot?: number
}

/**
 * Tilts an element towards the pointer and moves a blue light across it.
 *
 * Everything is written as custom properties; `styles.css` decides what to do
 * with them, so the effect degrades to a plain card when `html.motion` is off.
 * Touch and coarse pointers are excluded: there is no hover there, and a
 * tilt that never resets would leave the card crooked.
 */
export function useTilt<T extends HTMLElement = HTMLElement>({ max = 9, spot = 0.16 }: TiltOptions = {}) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    const media = matchMediaSafe(FINE_POINTER_QUERY)
    if (!element || !media) return
    let frame = 0
    let active = false

    const reset = () => {
      element.classList.remove('is-lit')
      element.style.setProperty('--tilt-x', '0deg')
      element.style.setProperty('--tilt-y', '0deg')
      element.style.setProperty('--spot-a', '0')
    }

    const onMove = (event: PointerEvent) => {
      if (!media.matches) return
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = element.getBoundingClientRect()
        const x = (event.clientX - box.left) / box.width
        const y = (event.clientY - box.top) / box.height

        element.style.setProperty('--tilt-y', `${(x - 0.5) * max}deg`)
        element.style.setProperty('--tilt-x', `${(0.5 - y) * max * 0.85}deg`)
        element.style.setProperty('--spot-x', `${x * 100}%`)
        element.style.setProperty('--spot-y', `${y * 100}%`)
        element.style.setProperty('--spot-a', String(spot))
        element.classList.add('is-lit')
        active = true
      })
    }

    const onLeave = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      if (!active) return
      active = false
      reset()
    }

    element.addEventListener('pointermove', onMove, { passive: true })
    element.addEventListener('pointerleave', onLeave)
    media.addEventListener('change', onLeave)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerleave', onLeave)
      media.removeEventListener('change', onLeave)
      reset()
    }
  }, [max, spot])

  return ref
}
