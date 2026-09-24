import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { PublicServiceCard } from '#/backend2/contracts/service.contract'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '#/frontend/components/ui/card'
import type { HomeCopy } from '#/frontend/content/types'
import type { Language } from '#/frontend/i18n/language'
import { cn } from '#/frontend/lib/utils'
import { useTilt } from '#/frontend/motion'
import type { HomeServicesData } from './server/services-source'
import { SERVICE_WORDS, initialOf } from './service-words'

/**
 * Which homepage section to draw: Backend2's starred services, or nothing at
 * all — no starred service is live, or they could not be read. The homepage
 * never shows an empty heading or an error (Design Lab).
 */
export const homeServicesView = (data: HomeServicesData): 'v2' | 'hidden' => (data.items.length ? 'v2' : 'hidden')

/**
 * The homepage services from Backend2: the starred, published services in the
 * owner's order, at most six, with an "All services" link (choice 1A). The
 * grid follows the count — three across as today, two across for two or four,
 * one centred card alone — and each card's tile is the first letter of its
 * name (choice 2A). The caller leaves the section out when nothing is starred.
 */
export function HomeServicesV2({
  copy,
  items,
  language,
}: {
  copy: HomeCopy['services']
  items: PublicServiceCard[]
  language: Language
}) {
  const count = items.length
  const basis =
    count === 1
      ? 'md:basis-[min(100%,26rem)]'
      : count === 2 || count === 4
        ? 'md:basis-[calc((100%-1.25rem)/2)]'
        : 'md:basis-[calc((100%-2.5rem)/3)]'

  return (
    <Section id="leistungen">
      <Container className="flex flex-col gap-10">
        <div className="section-heading-row">
          <SectionHeading
            eyebrow={copy.eyebrow}
            title={copy.title}
            sub={copy.sub}
            eyebrowKey="home.services.eyebrow"
            titleKey="home.services.title"
            subKey="home.services.sub"
          />
          <Link
            data-reveal
            to="/$lang/services"
            params={{ lang: language }}
            className="text-primary hover:text-primary/80 inline-flex w-fit items-center gap-1.5 text-sm font-medium"
          >
            {SERVICE_WORDS[language].all}
            <ArrowRight className="btn-arrow size-4 rtl:-scale-x-100" />
          </Link>
        </div>
        <div className="flex flex-wrap justify-center gap-5" data-count={count}>
          {items.map((service) => (
            <HomeServiceCard
              key={service.slug}
              service={service}
              language={language}
              moreLabel={copy.more}
              className={cn('min-w-0 grow-0 shrink basis-full', basis)}
            />
          ))}
        </div>
      </Container>
    </Section>
  )
}

function HomeServiceCard({
  service,
  language,
  moreLabel,
  className,
}: {
  service: PublicServiceCard
  language: Language
  moreLabel: string
  className?: string
}) {
  const tilt = useTilt<HTMLDivElement>()

  return (
    <Card
      data-reveal
      data-tilt
      ref={tilt}
      className={cn(
        'surface-card surface-card-hover flex min-w-0 flex-col rounded-[1.75rem] border-border/50 bg-card py-0',
        className,
      )}
    >
      <CardHeader className="gap-2 px-7 pt-7 pb-3">
        <CardDescription
          className="service-symbol font-heading text-2xl leading-none tracking-normal rtl:text-[1.3rem]"
          aria-hidden="true"
        >
          {initialOf(service.name, language)}
        </CardDescription>
        <CardTitle className="mt-2 text-[1.45rem] leading-snug text-foreground">{service.name}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 px-7 pb-6">
        <p className="m-0 text-sm leading-7 text-foreground/58">{service.summary}</p>
      </CardContent>
      <CardFooter className="rounded-b-[1.75rem] border-t border-border/30 bg-muted/25 px-7 py-5">
        <Button
          asChild
          variant="outline"
          className="rounded-full border-border/50 bg-card px-4 text-foreground/68 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
        >
          <Link to="/$lang/services/$slug" params={{ lang: language, slug: service.slug }}>
            {moreLabel}
            <ArrowRight className="btn-arrow rtl:-scale-x-100" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
