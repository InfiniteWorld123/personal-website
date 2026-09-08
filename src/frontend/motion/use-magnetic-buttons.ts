import { useEffect } from 'react'
import { FINE_POINTER_QUERY, matchMediaSafe } from './motion'

const SELECTOR = '[data-slot="button"][data-variant="default"]'
const PULL = 0.28
const LIMIT_X = 10
const LIMIT_Y = 8

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value))

/**
 * Primary buttons lean a few pixels towards the pointer and spring back.
 *
 * One delegated listener covers every blue button on the page, including the
 * ones React renders later, so no button component needs to know about this.
 */
export function useMagneticButtons() {
  useEffect(() => {
    const media = matchMediaSafe(FINE_POINTER_QUERY)
    if (!media) return
    let current: HTMLElement | null = null
    let frame = 0

    const release = () => {
      if (!current) return
      current.style.setProperty('--magnet-duration', '520ms')
      current.style.setProperty('--magnet-x', '0px')
      current.style.setProperty('--magnet-y', '0px')
      current = null
    }

    const onMove = (event: PointerEvent) => {
      if (!media.matches || event.pointerType !== 'mouse') return
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(SELECTOR) : null

      if (target !== current) release()
      if (!target) return

      current = target
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const box = target.getBoundingClientRect()
        const dx = event.clientX - (box.left + box.width / 2)
        const dy = event.clientY - (box.top + box.height / 2)

        target.style.setProperty('--magnet-duration', '160ms')
        target.style.setProperty('--magnet-x', `${clamp(dx * PULL, LIMIT_X)}px`)
        target.style.setProperty('--magnet-y', `${clamp(dy * PULL, LIMIT_Y)}px`)
      })
    }

    document.addEventListener('pointermove', onMove, { passive: true })
    media.addEventListener('change', release)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      document.removeEventListener('pointermove', onMove)
      media.removeEventListener('change', release)
      release()
    }
  }, [])
}
