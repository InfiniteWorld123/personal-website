import { Link } from '@tanstack/react-router'
import { ArrowRight, Github, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { PortraitBlob } from '#/frontend/components/layout/public/PortraitBlob'
import { Badge } from '#/frontend/components/ui/badge'
import { Button } from '#/frontend/components/ui/button'
import { getContent, serviceOrder, site } from '#/frontend/content'
import type { HomeCopy } from '#/frontend/content/types'
import { usePrefersReducedMotion } from '#/frontend/hooks/use-prefers-reduced-motion'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'

/**
 * The hero keeps the site's original character: a greeting, a huge uppercase
 * display line where the first word types itself in and out, and the
 * portrait in front of the morphing blue blob. The typed words name the
 * offer; the bold sentence under them is the positioning headline.
 *
 * The entrance is one sequence, not eight separate fades: the small lines
 * arrive first, the display line rises from behind its own edge, the portrait
 * settles last. Order comes from `--hero-i`; the CSS owns the timing.
 */
export function HeroSection({ copy }: { copy: HomeCopy['hero'] }) {
  const { language, isRtl } = useLanguage()
  const { services, shell } = getContent(language)

  const item = (index: number) => ({ 'data-hero-item': '', style: { '--hero-i': index } as CSSProperties })

  return (
    <section className="hero-section">
      <Container>
        <div className="hero-layout">
          <div className="hero-content">
            <Badge {...item(0)} className="hero-chip rounded-full px-3 py-1 text-[0.76rem]">
              <MapPin className="size-3.5" />
              {shell.footer.location}
            </Badge>

            <p {...item(1)} className="mt-7 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {copy.greeting}
            </p>

            <p
              {...item(2)}
              className="mt-4 text-[0.72rem] font-bold uppercase tracking-[0.36em] text-primary/70 rtl:tracking-normal"
            >
              {copy.prefix}
            </p>

            <h1
              className={cn(
                'hero-display mt-3 text-display-xl font-black uppercase text-foreground',
                isRtl && 'hero-display-ar',
              )}
            >
              {isRtl ? (
                <span className="hero-title-arabic">
                  <HeroLine index={0}>
                    <span className="hero-arabic-static">{copy.staticLine}</span>
                  </HeroLine>
                  <HeroLine index={1}>
                    <span className="hero-arabic-role">
                      <TypingText key={language} words={copy.typed} />
                    </span>
                  </HeroLine>
                </span>
              ) : (
                <>
                  <HeroLine index={0}>
                    <TypingText key={language} words={copy.typed} />
                  </HeroLine>
                  <HeroLine index={1}>
                    <span className="hero-static-line">{copy.staticLine}</span>
                  </HeroLine>
                </>
              )}
            </h1>

            <p {...item(7)} className="mt-6 max-w-xl text-lg font-semibold leading-8 text-foreground sm:text-xl">
              {copy.headline}
            </p>
            <p {...item(8)} className="hero-copy mt-3 max-w-xl text-base leading-8 sm:text-[1.05rem]">
              {copy.sub}
            </p>

            <div {...item(9)} className="mt-9 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full px-7">
                <Link to="/$lang/contact" params={{ lang: language }}>
                  {copy.cta}
                  <ArrowRight className="btn-arrow rtl:-scale-x-100" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full px-7">
                <Link to="/$lang/work" params={{ lang: language }}>
                  {copy.secondary}
                  <ArrowRight className="btn-arrow rtl:-scale-x-100" />
                </Link>
              </Button>
            </div>

            <div {...item(10)} className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="btn-glow-icon rounded-full border border-border/60 bg-card text-foreground/70 hover:text-primary"
              >
                <a href={site.github} target="_blank" rel="noreferrer" aria-label="GitHub">
                  <Github />
                </a>
              </Button>
              <a
                href={`mailto:${site.email}`}
                dir="ltr"
                className="link-underline-slide text-sm font-medium text-foreground/48 hover:text-primary"
              >
                {site.email}
              </a>
            </div>

            {/* The three service lines as pills, each a shortcut into its detail. */}
            <div {...item(11)} className="mt-7 flex flex-wrap gap-2">
              {serviceOrder.map((slug) => (
                <Link
                  key={slug}
                  to="/$lang/services"
                  params={{ lang: language }}
                  hash={slug}
                  className="skill-pill inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-[0.76rem] font-semibold text-foreground/62 hover:border-primary/30 hover:text-primary"
                >
                  <span className="size-1.5 rounded-full bg-primary/70" aria-hidden="true" />
                  {services.items[slug].name}
                </Link>
              ))}
            </div>
          </div>

          <div className="hero-portrait-stage">
            <div className="hero-portrait-frame">
              <PortraitBlob alt={site.name} />
              {/* Only ever rendered while the sentence is true; the copy is a
                  content key so it can be emptied without a deploy. */}
              {copy.availability ? (
                <span className="hero-availability">
                  <span className="status-dot is-live" aria-hidden="true" />
                  {copy.availability}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}

/** One display line, masked so it can rise from behind its own edge. */
function HeroLine({ index, children }: { index: number; children: ReactNode }) {
  return (
    <span className="hero-line" style={{ '--line-i': index } as CSSProperties}>
      <span className="hero-line-inner">{children}</span>
    </span>
  )
}

/**
 * Types each word in, holds it, deletes it, moves to the next. Under
 * reduced motion the first word is shown complete and nothing moves.
 */
function TypingText({ words }: { words: string[] }) {
  const reducedMotion = usePrefersReducedMotion()
  const [wordIndex, setWordIndex] = useState(0)
  const [displayed, setDisplayed] = useState(words[0] ?? '')
  const [phase, setPhase] = useState<'typing' | 'pausing' | 'deleting'>('pausing')

  useEffect(() => {
    if (reducedMotion) return

    const word = words[wordIndex] ?? ''
    let timeout: ReturnType<typeof setTimeout>

    if (phase === 'typing') {
      if (displayed.length < word.length) {
        timeout = setTimeout(() => setDisplayed(word.slice(0, displayed.length + 1)), 85)
      } else {
        timeout = setTimeout(() => setPhase('pausing'), 0)
      }
    } else if (phase === 'pausing') {
      timeout = setTimeout(() => setPhase('deleting'), 2200)
    } else if (displayed.length > 0) {
      timeout = setTimeout(() => setDisplayed(displayed.slice(0, -1)), 45)
    } else {
      timeout = setTimeout(() => {
        setWordIndex((index) => (index + 1) % words.length)
        setPhase('typing')
      }, 250)
    }

    return () => clearTimeout(timeout)
  }, [displayed, phase, reducedMotion, wordIndex, words])

  const longest = words.reduce((max, word) => Math.max(max, word.length), 0)

  return (
    <span
      className="hero-typed-word"
      style={{ '--hero-word-ch': `${longest + 1}ch` } as CSSProperties}
      aria-label={words.join(', ')}
    >
      <span className="hero-accent">{displayed}</span>
      {reducedMotion ? null : (
        <span className="hero-cursor" aria-hidden="true">
          |
        </span>
      )}
    </span>
  )
}
