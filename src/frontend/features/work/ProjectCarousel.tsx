import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import type { WorkCopy } from '#/frontend/content/types'
import type { Language } from '#/frontend/i18n/language'
import { usePrefersReducedMotion } from '#/frontend/hooks/use-prefers-reduced-motion'
import { ProjectCard } from './ProjectCard'
import type { ProjectEntry } from './project-list'

export function ProjectCarousel({ entries, work, language }: { entries: ProjectEntry[]; work: WorkCopy; language: Language }) {
  const track = useRef<HTMLDivElement>(null)
  const [nav, setNav] = useState({ overflow: false, previous: false, next: false })
  const reducedMotion = usePrefersReducedMotion()
  useEffect(() => {
    const el = track.current
    if (!el) return
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth
      const position = Math.abs(el.scrollLeft)
      setNav({ overflow: max > 2, previous: position > 2, next: position < max - 2 })
    }
    el.scrollLeft = 0
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => { observer.disconnect(); el.removeEventListener('scroll', measure) }
  }, [entries.length, language])
  const move = (step: number) => {
    const el = track.current
    const card = el?.firstElementChild
    if (!el || !card) return
    const distance = card.getBoundingClientRect().width + Number.parseFloat(getComputedStyle(el).columnGap)
    el.scrollBy({ left: step * distance * (language === 'ar' ? -1 : 1), behavior: reducedMotion ? 'instant' : 'smooth' })
  }
  if (!entries.length) return <p className="work-empty">{work.empty}</p>
  return (
    <div className="project-carousel" role="region" aria-label={work.eyebrow}>
      <div ref={track} id="home-projects" className="project-track" tabIndex={nav.overflow ? 0 : undefined}>
        {entries.map(({ facts, copy }) => <ProjectCard key={facts.slug} facts={facts} copy={copy} language={language} statusLabels={work.status} labels={{ visit: work.visit, source: work.source, detail: work.detailLabel }} />)}
      </div>
      {nav.overflow ? <div className="project-carousel-controls">
        <Button variant="outline" size="icon" aria-label={work.previous} aria-controls="home-projects" disabled={!nav.previous} onClick={() => move(-1)}><ArrowLeft className="rtl:-scale-x-100" /></Button>
        <Button variant="outline" size="icon" aria-label={work.next} aria-controls="home-projects" disabled={!nav.next} onClick={() => move(1)}><ArrowRight className="rtl:-scale-x-100" /></Button>
      </div> : null}
    </div>
  )
}
