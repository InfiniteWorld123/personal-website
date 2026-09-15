import { Link } from '@tanstack/react-router'
import { ArrowRight, Mail } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { getSite } from '#/frontend/content'
import { E } from '#/frontend/features/content/E'
import { useResolvedText } from '#/frontend/features/content/content-overlay'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'
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
  keyBase,
}: {
  title: string
  body?: string
  button: string
  alt?: string
  /** `home.cta` on the landing page; leaving it off renders as before. */
  keyBase?: string
}) {
  const { language } = useLanguage()
  const ref = useReveal<HTMLElement>()
  const resolvedTitle = useResolvedText(keyBase ? `${keyBase}.title` : undefined, title)

  return (
    <section ref={ref} data-reveal-scope="" className="contact-light py-section lg:py-section-lg">
      <Container className="closing-cta">
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 className="section-title text-display-md text-foreground">
            <SplitWords text={resolvedTitle} />
          </h2>
          {body ? (
            <p data-reveal className="text-base leading-8 text-foreground/58 sm:text-[1.05rem]">
              {keyBase ? <E k={`${keyBase}.body`}>{body}</E> : body}
            </p>
          ) : null}
        </div>
        <div className="closing-cta-actions" data-reveal>
          <Button
            asChild
            size="lg"
            className="rounded-full bg-primary px-7 text-primary-foreground"
          >
            <Link to="/$lang/contact" params={{ lang: language }}>
              {keyBase ? <E k={`${keyBase}.button`}>{button}</E> : button}
              <ArrowRight className="btn-arrow rtl:-scale-x-100" />
            </Link>
          </Button>
          {alt ? (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-full border-border/60 bg-card px-6 text-foreground hover:border-primary/30 hover:bg-primary/5"
            >
              <a href={`mailto:${getSite().email}`}>
                <Mail />
                {keyBase ? <E k={`${keyBase}.alt`}>{alt}</E> : alt}
              </a>
            </Button>
          ) : null}
        </div>
      </Container>
    </section>
  )
}
