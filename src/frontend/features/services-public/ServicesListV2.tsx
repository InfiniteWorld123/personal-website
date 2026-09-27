import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowRight, Check } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { PublicServiceCard } from '#/backend2/contracts/service.contract'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section, SectionHeading } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { getContent } from '#/frontend/content'
import { PRICE_WORDS, priceParts } from '#/frontend/features/services/service-display'
import { cn } from '#/frontend/lib/utils'
import type { Language } from '#/frontend/i18n/language'
import { useMoreBatches } from '#/frontend/features/work/use-more-batches'
import { fetchServicesBatch } from './server/published-services'
import type { ServicesPageData } from './server/services-source'
import { PriceLine } from './ServicePrice'
import { SERVICE_BATCH_SIZE, SERVICE_WORDS } from './service-words'

/**
 * `/services` with Backend2's published services: the fixed-price website
 * packages as cards first, then every other service under "Not what you
 * need?" (owner's request, 27 Sep 2026, replacing choice 3A's alternating
 * sections), then "Load more" in batches of six, as `/work` does.
 *
 * The header above and the shared rules and call to action below stay the
 * page's own; only this middle part reads Backend2.
 */
export function ServicesListV2({
  data,
  page,
  language,
}: {
  data: Extract<ServicesPageData, { source: 'v2' }>
  page: number
  language: Language
}) {
  if (data.status === 'error') return <LoadFailure language={language} />

  return <ServiceList items={data.items} total={data.total} page={page} language={language} />
}

function ServiceList({
  items,
  total,
  page,
  language,
}: {
  items: PublicServiceCard[]
  total: number
  page: number
  language: Language
}) {
  const { services, home } = getContent(language)
  const words = SERVICE_WORDS[language]
  // The route loads every batch up to `?page=`; "Load more" fetches the next one.
  const more = useMoreBatches({
    items,
    total,
    wanted: page * SERVICE_BATCH_SIZE,
    loadMore: (offset, limit) => fetchServicesBatch({ data: { language, offset, limit } }),
  })

  if (more.items.length === 0) {
    return (
      <Notice text={words.empty}>
        <Button asChild className="rounded-full bg-primary px-6 text-primary-foreground">
          <Link to="/$lang/contact" params={{ lang: language }}>
            {services.cta.button}
            <ArrowRight className="btn-arrow rtl:-scale-x-100" />
          </Link>
        </Button>
      </Notice>
    )
  }

  const visible = more.items.slice(0, page * SERVICE_BATCH_SIZE)
  const { packages, others } = splitServices(visible)

  return (
    <>
      {packages.length ? (
        <PackagesSection items={packages} anchor={packagesAnchor(visible)} language={language} />
      ) : null}
      {others.length ? (
        <OthersSection items={others} withHeading={packages.length > 0} language={language} moreLabel={home.services.more} />
      ) : null}
      {visible.length < more.total ? (
        <LoadMore
          page={Math.ceil(visible.length / SERVICE_BATCH_SIZE)}
          language={language}
          label={words.loadMore}
          busy={more.loading}
          onRetry={more.failed ? more.retry : undefined}
        />
      ) : null}
    </>
  )
}

/**
 * A fixed price makes a service a package: a card at the top, with its price,
 * what it contains and a way to ask. "Starting from" and "on request" services
 * follow under "Not what you need?". Both keep the owner's one manual order.
 */
export const splitServices = (items: PublicServiceCard[]) => ({
  packages: items.filter((service) => service.price?.mode === 'fixed'),
  others: items.filter((service) => service.price?.mode !== 'fixed'),
})

/**
 * `/services#websites` is where the site's links for websites land. The
 * packages are that section, unless a service on screen already owns the
 * address as its own anchor.
 */
const packagesAnchor = (items: PublicServiceCard[]) =>
  items.some((service) => service.slug === 'websites') ? 'website-pakete' : 'websites'

function PackagesSection({
  items,
  anchor,
  language,
}: {
  items: PublicServiceCard[]
  anchor: string
  language: Language
}) {
  const copy = getContent(language).services.packages
  const count = items.length
  const columns =
    count === 1 ? 'max-w-md' : count === 2 || count === 4 ? 'max-w-xl lg:max-w-none lg:grid-cols-2' : 'max-w-xl lg:max-w-none lg:grid-cols-3'

  return (
    <Section id={anchor} className="scroll-mt-20 pt-8 sm:pt-10 lg:pt-12">
      <Container className="flex flex-col gap-10">
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} sub={copy.sub} />
        <div className={cn('mx-auto grid w-full gap-5', columns)}>
          {items.map((service) => (
            <PackageCard key={service.slug} service={service} language={language} />
          ))}
        </div>
        <p data-reveal className="max-w-2xl text-sm leading-7 text-foreground/58">
          {copy.note}
        </p>
      </Container>
    </Section>
  )
}

function PackageCard({ service, language }: { service: PublicServiceCard; language: Language }) {
  const copy = getContent(language).services.packages
  const words = PRICE_WORDS[language]
  const parts = service.price ? priceParts(service.price, language) : null

  return (
    <article
      id={service.slug}
      data-reveal
      // Four rows shared with the neighbouring cards (subgrid), so the prices
      // and the lists start at one height however long each description is.
      className="surface-card row-span-4 grid min-w-0 scroll-mt-24 grid-rows-subgrid gap-0 rounded-[1.75rem] border border-border/50 bg-card"
    >
      <div className="flex flex-col gap-2 px-7 pt-7">
        <h3 className="font-heading text-[1.45rem] leading-snug text-foreground">{service.name}</h3>
        <p className="text-sm leading-7 text-foreground/58">{service.summary}</p>
      </div>

      <div className="flex flex-col justify-end gap-1.5 px-7 pt-5 pb-6">
        {parts ? (
          <>
          {parts.label ? (
            <p>
              <span className="inline-flex h-6 items-center rounded-full bg-primary/12 px-2.5 text-xs font-semibold text-primary">
                {parts.label}
              </span>
            </p>
          ) : null}
          <p className="font-heading tabular flex flex-wrap items-baseline gap-x-2.5 text-[2.4rem] leading-[1.05] text-primary rtl:text-[2.1rem]">
            {parts.regular ? (
              <del className="text-[0.55em] text-muted-foreground decoration-[1.5px]">
                <span className="sr-only">{words.regular} </span>
                {parts.regular}
              </del>
            ) : null}
            <span>
              {parts.regular ? <span className="sr-only">{words.offer} </span> : null}
              {parts.amount}
            </span>
            {parts.period ? (
              <span className="font-sans text-base font-medium tracking-normal text-muted-foreground">{parts.period}</span>
            ) : null}
          </p>
          {parts.caption ? <p className="text-[0.8rem] font-medium text-muted-foreground">{parts.caption}</p> : null}
          </>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 border-t border-border/40 px-7 pt-5 pb-7">
        <h4 className="text-[0.8rem] font-semibold text-muted-foreground">{words.included}</h4>
        <ul className="flex flex-col gap-2.5">
          {service.included.map((item, index) => (
            <li key={index} className="flex gap-2.5 text-sm leading-6 text-foreground/82">
              <Check aria-hidden="true" className="mt-[0.2rem] size-4 shrink-0 text-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-b-[1.75rem] border-t border-border/30 bg-muted/25 px-7 py-5">
        <Button asChild className="rounded-full bg-primary px-5 text-primary-foreground">
          <Link to="/$lang/contact" params={{ lang: language }}>
            {copy.cta}
            <ArrowRight className="btn-arrow rtl:-scale-x-100" />
          </Link>
        </Button>
        <Link
          to="/$lang/services/$slug"
          params={{ lang: language, slug: service.slug }}
          className="text-sm font-medium text-foreground/68 underline-offset-4 hover:text-primary hover:underline"
        >
          {copy.details}
          <span className="sr-only">: {service.name}</span>
        </Link>
      </div>
    </article>
  )
}

function OthersSection({
  items,
  withHeading,
  language,
  moreLabel,
}: {
  items: PublicServiceCard[]
  /** Only under packages: "Not what you need?" means nothing on its own. */
  withHeading: boolean
  language: Language
  moreLabel: string
}) {
  const copy = getContent(language).services.others

  return (
    <Section tone={withHeading ? 'tint' : 'page'} className={withHeading ? undefined : 'pt-8 sm:pt-10 lg:pt-12'}>
      <Container className="flex flex-col gap-10">
        {withHeading ? <SectionHeading title={copy.title} sub={copy.sub} /> : null}
        <div className="grid gap-5 md:grid-cols-2">
          {items.map((service) => (
            <article
              key={service.slug}
              // The address doubles as the anchor, so `/services#<slug>` still lands here.
              id={service.slug}
              data-reveal
              className="surface-card flex min-w-0 scroll-mt-24 flex-col gap-4 rounded-[1.75rem] border border-border/50 bg-card p-7"
            >
              <div className="flex flex-col gap-1.5">
                <h3 className="font-heading text-[1.45rem] leading-snug text-foreground">{service.name}</h3>
                {service.price ? (
                  <p className="text-primary tabular text-lg font-medium">
                    <PriceLine price={service.price} language={language} />
                  </p>
                ) : null}
              </div>
              <p className="flex-1 text-sm leading-7 text-foreground/58">{service.summary}</p>
              <div>
                <Button
                  asChild
                  variant="outline"
                  className="rounded-full border-border/50 bg-card px-4 text-foreground/68 hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
                >
                  <Link to="/$lang/services/$slug" params={{ lang: language, slug: service.slug }}>
                    {moreLabel}
                    <span className="sr-only">: {service.name}</span>
                    <ArrowRight className="btn-arrow rtl:-scale-x-100" />
                  </Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Container>
    </Section>
  )
}

function LoadMore({
  page,
  language,
  label,
  busy,
  onRetry,
}: {
  /** The page on screen now; the button asks for the one after it. */
  page: number
  language: Language
  label: string
  busy: boolean
  /** Set when the last batch could not be read: the button tries it again. */
  onRetry?: () => void
}) {
  const navigate = useNavigate()

  return (
    <Container className="flex justify-center pt-4 pb-10">
      <Button
        variant="outline"
        size="lg"
        className="rounded-full px-6"
        aria-busy={busy || undefined}
        onClick={() =>
          onRetry ? onRetry() : void navigate({
            to: '/$lang/services',
            params: { lang: language },
            search: { page: page + 1 },
            resetScroll: false,
          })
        }
      >
        {label}
      </Button>
    </Container>
  )
}

function Notice({ text, role, children }: { text: string; role?: 'alert'; children: ReactNode }) {
  return (
    <Container className="pt-8 pb-12">
      <div
        role={role}
        className="surface-card flex flex-col items-start gap-4 rounded-3xl border border-border/50 bg-card p-7"
      >
        <p className="text-[1.05rem] leading-[1.8]">{text}</p>
        {children}
      </div>
    </Container>
  )
}

/** The list could not be read: the error sentence and a retry, never an empty page (Design Lab). */
function LoadFailure({ language }: { language: Language }) {
  const router = useRouter()
  const [retrying, setRetrying] = useState(false)
  const words = SERVICE_WORDS[language]

  return (
    <Notice text={words.error} role="alert">
      <Button
        variant="outline"
        className="rounded-full px-6"
        disabled={retrying}
        onClick={() => {
          setRetrying(true)
          void router.invalidate().finally(() => setRetrying(false))
        }}
      >
        {words.retry}
      </Button>
    </Notice>
  )
}
