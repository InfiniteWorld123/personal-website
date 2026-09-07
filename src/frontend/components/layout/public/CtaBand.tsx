import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
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
    <section ref={ref} className="py-section">
      <Container>
        <div className="bg-primary text-primary-foreground rounded-2xl px-6 py-12 sm:px-12 sm:py-16">
          <div className="flex max-w-2xl flex-col gap-5">
            <h2 data-reveal className="font-heading text-display-md">
              {title}
            </h2>
            {body ? (
              <p data-reveal className="text-primary-foreground/80 text-base leading-relaxed sm:text-lg">
                {body}
              </p>
            ) : null}
            <div data-reveal className="flex flex-wrap items-center gap-4 pt-2">
              <Button
                asChild
                className="bg-primary-foreground text-primary hover:bg-primary-foreground/90 h-11 rounded-full px-5 text-[0.95rem]"
              >
                <Link to="/$lang/contact" params={{ lang: language }}>
                  {button}
                  <ArrowRight className="size-4 rtl:-scale-x-100" />
                </Link>
              </Button>
              {alt ? (
                <a
                  href={`mailto:${site.email}`}
                  className="text-primary-foreground/80 hover:text-primary-foreground text-sm underline underline-offset-4"
                >
                  {alt}
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}
