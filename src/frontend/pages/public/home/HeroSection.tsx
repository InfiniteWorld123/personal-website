import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { useRef } from 'react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { getContent, serviceOrder, servicePrices } from '#/frontend/content'
import type { HomeCopy } from '#/frontend/content/types'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { gsap, useGsap } from '#/frontend/motion'
import { formatEuro } from '#/frontend/lib/format'

export function HeroSection({ copy }: { copy: HomeCopy['hero'] }) {
  const { language } = useLanguage()
  const { services, home } = getContent(language)
  const ref = useRef<HTMLElement>(null)

  useGsap(ref, () => {
    gsap.from('[data-hero]', {
      y: 22,
      opacity: 0,
      duration: 1,
      ease: 'power3.out',
      stagger: 0.09,
      delay: 0.05,
    })
  })

  return (
    <section ref={ref} className="pt-16 pb-14 sm:pt-24 sm:pb-20 lg:pt-28">
      <Container className="flex flex-col gap-10">
        <div className="flex max-w-4xl flex-col gap-6">
          <Eyebrow data-hero>{copy.eyebrow}</Eyebrow>
          <h1 data-hero className="font-heading text-display-xl text-foreground">
            {copy.headline}
          </h1>
          <p data-hero className="text-muted-foreground max-w-xl text-lg leading-relaxed sm:text-xl">
            {copy.sub}
          </p>
          <div data-hero className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild className="h-11 rounded-full px-5 text-[0.95rem]">
              <Link to="/$lang/contact" params={{ lang: language }}>
                {copy.cta}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 rounded-full px-4 text-[0.95rem]">
              <Link to="/$lang/services" params={{ lang: language }}>
                {copy.secondary}
              </Link>
            </Button>
          </div>
        </div>

        {/* The offer at a glance: three lines, three entry prices. */}
        <dl
          data-hero
          className="border-border grid gap-x-8 gap-y-3 border-t pt-6 sm:grid-cols-3"
        >
          {serviceOrder.map((slug) => (
            <div key={slug} className="flex items-baseline justify-between gap-4 sm:flex-col sm:items-start sm:gap-1">
              <dt className="text-foreground text-sm font-medium">{services.items[slug].name}</dt>
              <dd className="text-muted-foreground tabular m-0 text-sm">
                {home.services.from} {formatEuro(servicePrices[slug], language)}
              </dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  )
}
