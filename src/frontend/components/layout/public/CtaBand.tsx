import { Link } from '@tanstack/react-router'
import { ArrowRight, Mail } from 'lucide-react'
import { useRef } from 'react'
import { Button } from '#/frontend/components/ui/button'
import { site } from '#/frontend/content/site'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { useReveal } from '#/frontend/motion'
import { Container } from './Container'

/**
 * Closing call to action shared by the public pages. Booking arrives in B5;
 * until then the primary action leads to the qualifying contact form.
 */
export function CtaBand({
  title,
  body,
  button,
  alt,
}: {
  title: string
  body?: string
  button: string
  alt?: string
}) {
  const { language } = useLanguage()
  const ref = useRef<HTMLElement>(null)
  useReveal(ref)

  return (
    <section ref={ref} className="contact-light py-section lg:py-section-lg">
      <Container className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 data-reveal className="section-title text-display-md text-foreground">
            {title}
          </h2>
          {body ? (
            <p data-reveal className="text-base leading-8 text-foreground/58 sm:text-[1.05rem]">
              {body}
            </p>
          ) : null}
        </div>
        <div data-reveal className="flex flex-wrap items-center gap-3">
          <Button
            asChild
            size="lg"
            className="btn-glow-primary rounded-full bg-primary px-7 text-primary-foreground shadow-[0_12px_32px_rgba(53,92,255,0.28)] hover:bg-primary/90"
          >
            <Link to="/$lang/contact" params={{ lang: language }}>
              {button}
              <ArrowRight className="rtl:-scale-x-100" />
            </Link>
          </Button>
          {alt ? (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="btn-glow-outline rounded-full border-border/60 bg-card px-6 text-foreground hover:border-primary/30 hover:bg-primary/5"
            >
              <a href={`mailto:${site.email}`}>
                <Mail />
                {alt}
              </a>
            </Button>
          ) : null}
        </div>
      </Container>
    </section>
  )
}
