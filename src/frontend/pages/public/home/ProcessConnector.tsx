import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

type Shape = {
  width: number
  height: number
  paths: { d: string; delay: number }[]
  rings: { cx: number; cy: number; delay: number }[]
}

const STEP_DELAY = 450

/**
 * The hand-drawn line that ties the four steps together.
 *
 * The curve is measured, not authored: each end sits on the real top corner
 * of a real card, so the line still lands correctly when the cards are
 * tilted, when the text reflows, or when Arabic mirrors the whole row. Below
 * the four-column layout there is no line at all — arcs between stacked cards
 * would say nothing that the numbers do not already say.
 *
 * The stage is read through this element's own parent rather than a ref
 * passed down: React attaches a parent's ref only *after* its children's
 * layout effects have run, so a ref prop would still be empty here.
 */
export function ProcessConnector() {
  const [shape, setShape] = useState<Shape | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  useLayoutEffect(() => {
    const stage = svgRef.current?.parentElement
    if (!stage || typeof window === 'undefined') return

    const measure = () => {
      const cards = [...stage.querySelectorAll<HTMLElement>('.step')]
      const wide = typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches

      if (!wide || cards.length < 2) {
        setShape(null)
        return
      }

      const box = stage.getBoundingClientRect()
      const centre = (element: Element) => {
        const rect = element.getBoundingClientRect()
        return { x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top }
      }

      const paths: Shape['paths'] = []
      const rings: Shape['rings'] = []

      cards.slice(0, -1).forEach((card, index) => {
        const out = card.querySelector('.step-anchor-out')
        const into = cards[index + 1]?.querySelector('.step-anchor-in')
        if (!out || !into) return

        const start = centre(out)
        const end = centre(into)
        const top = Math.min(start.y, end.y)
        const dx = end.x - start.x

        // The middle link loops back on itself; the outer two are plain arcs.
        const d =
          index === 1
            ? `M${start.x},${start.y} C${start.x + dx * 2.1},${top - 82} ${start.x - dx * 1.1},${top - 82} ${end.x},${end.y}`
            : `M${start.x},${start.y} C${start.x + dx * 0.18},${top - 88} ${start.x + dx * 0.82},${top - 92} ${end.x},${end.y}`

        paths.push({ d, delay: index * STEP_DELAY + 100 })
        rings.push({ cx: start.x, cy: start.y, delay: index * STEP_DELAY })
        rings.push({ cx: end.x, cy: end.y, delay: index * STEP_DELAY + 1100 })
      })

      setShape({ width: box.width, height: box.height, paths, rings })
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // A dashed line can only be drawn once its own length is known.
  useLayoutEffect(() => {
    svgRef.current?.querySelectorAll('path').forEach((path) => {
      const length = path.getTotalLength()
      path.style.strokeDasharray = String(length)
      path.style.setProperty('--len', String(length))
    })
  }, [shape])

  return (
    <svg
      ref={svgRef}
      className="steps-connector"
      viewBox={shape ? `0 0 ${shape.width} ${shape.height}` : undefined}
      aria-hidden="true"
    >
      {shape?.paths.map((path) => (
        <path key={path.d} d={path.d} style={{ '--delay': `${path.delay}ms` } as CSSProperties} />
      ))}
      {shape?.rings.map((ring) => (
        <circle
          key={`${ring.cx}-${ring.cy}-${ring.delay}`}
          cx={ring.cx}
          cy={ring.cy}
          r={7}
          style={{ '--delay': `${ring.delay}ms` } as CSSProperties}
        />
      ))}
    </svg>
  )
}
