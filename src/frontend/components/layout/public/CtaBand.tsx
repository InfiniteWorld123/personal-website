import { Link } from '@tanstack/react-router'
import { ArrowRight, Mail } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { site } from '#/frontend/content/site'
import { useLanguage } from '#/frontend/i18n/language-provider'
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

  return (
    <section className="contact-light py-section lg:py-section-lg">
      <Container className="closing-cta">
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 className="section-title text-display-md text-foreground">
            {title}
          </h2>
          {body ? (
            <p className="text-base leading-8 text-foreground/58 sm:text-[1.05rem]">
              {body}
            </p>
          ) : null}
        </div>
        <div className="closing-cta-actions">
          <Button
            asChild
            size="lg"
            className="rounded-full bg-primary px-7 text-primary-foreground"
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
              className="rounded-full border-border/60 bg-card px-6 text-foreground hover:border-primary/30 hover:bg-primary/5"
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
