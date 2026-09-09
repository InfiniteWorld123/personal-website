import { ArrowUpRight, CalendarDays, Check, CheckCheck, Circle, LayoutDashboard, MessageSquare, MousePointer2 } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { SplitWords, useReveal } from '#/frontend/motion'
import type { HomeCopy } from '#/frontend/content/types'

function StoryVisual({ step, copy }: { step: number; copy: HomeCopy['story']['demo'] }) {
  return <div className={'build-visual visual-step-' + step} aria-hidden="true">
    {step === 0 ? <div className="idea-canvas">
      <span className="idea-pencil"><MessageSquare size={30} strokeWidth={1.3} /></span>
      {copy.notes.map((note, i) => <div key={note} className={'idea-note note-' + i}><span className="note-pin" /><span>{note}</span><ArrowUpRight size={22} /></div>)}
      <span className="idea-cursor"><MousePointer2 size={25} fill="currentColor" /></span>
    </div> : <div className={'product-window ' + (step === 1 ? 'wireframe-window' : '')}>
      <div className="window-bar"><span /><span /><span /><p>{copy.project}</p></div>
      <div className="product-layout">
        <div className="product-nav"><LayoutDashboard size={22} />{copy.navigation.map((name, i) => <span className={i === 1 ? 'active' : ''} key={name}>{name}</span>)}</div>
        <div className="product-content">
          <div className="product-title"><span>{copy.navigation[1]}</span><span className="product-add">+</span></div>
          <div className="product-request"><span className="request-symbol"><MessageSquare size={22} /></span><div><strong>{copy.request}</strong><span className="demo-rule" /><span className="demo-rule short" /></div><ArrowUpRight size={20} /></div>
          <div className="product-appointment"><CalendarDays size={20} /><span>{copy.appointment}</span><div className="calendar-grid">{Array.from({ length: 14 }, (_, i) => <span key={i} className={i === 9 ? 'selected' : ''}>{i === 9 ? <Check size={12} /> : <Circle size={3} fill="currentColor" />}</span>)}</div></div>
          <div className="product-confirmation"><CheckCheck size={18} />{copy.confirmed}</div>
        </div>
      </div>
    </div>}
  </div>
}

export function StorySection({ copy }: { copy: HomeCopy['story'] }) {
  const ref = useReveal<HTMLElement>()
  return <section ref={ref} data-reveal-scope="" className="build-story contact-light" id="system">
    <Container>
      <header className="build-story-header">
        <div className="flex flex-col"><Eyebrow data-reveal>{copy.eyebrow}</Eyebrow><h2 className="section-title mt-5 text-display-md text-foreground"><SplitWords text={copy.title} /></h2></div>
        <p data-reveal>{copy.sub}</p>
      </header>
      <div className="build-panels">
        {copy.steps.map((step, i) => <article className="build-panel" data-reveal key={step.label}>
          <div className="build-panel-copy">
            <div className="build-progress" aria-hidden="true">{copy.steps.map((_, j) => <span key={j} className={j === i ? 'active' : ''} />)}</div>
            <p className="build-step-label">{'0' + (i + 1)} / {step.label}</p>
            <h3>{step.title}</h3><p>{step.body}</p>
          </div>
          <StoryVisual step={i} copy={copy.demo} />
        </article>)}
      </div>
      <p className="build-disclaimer">{copy.demo.caption}</p>
    </Container>
  </section>
}
