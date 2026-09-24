import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import type { PublicServiceCard } from '#/backend2/contracts/service.contract'
import { Container } from '#/frontend/components/layout/public/Container'
import { Section } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { getContent } from '#/frontend/content'
import { PRICE_WORDS } from '#/frontend/features/services/service-display'
import type { Language } from '#/frontend/i18n/language'
import { SplitWords } from '#/frontend/motion'
import { useMoreBatches } from '#/frontend/features/work/use-more-batches'
import { fetchServicesBatch } from './server/published-services'
import type { ServicesPageData } from './server/services-source'
import { PriceLine } from './ServicePrice'
import { SERVICE_BATCH_SIZE, SERVICE_WORDS } from './service-words'

/**
 * `/services` with Backend2's published services: the approved list (choice
 * 3A) — alternating sections like today's page, shorter, each with "See
 * details" — then "Load more" in batches of six, as `/work` does.
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

  return (
    <>
      {visible.map((service, index) => (
        <ServiceSection
          key={service.slug}
          service={service}
          language={language}
          moreLabel={home.services.more}
          tone={index % 2 === 0 ? 'tint' : 'page'}
        />
      ))}
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

function ServiceSection({
  service,
  language,
  moreLabel,
  tone,
}: {
  service: PublicServiceCard
  language: Language
  moreLabel: string
  tone: 'tint' | 'page'
}) {
  return (
    // The address doubles as the anchor, so `/services#<slug>` still lands here.
    <Section id={service.slug} tone={tone} className="scroll-mt-20">
      <Container className="grid gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <div className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
          <h2 className="section-title text-display-md text-foreground">
            <SplitWords text={service.name} />
          </h2>
          {service.price ? (
            <p data-reveal className="text-primary tabular text-lg font-medium">
              <PriceLine price={service.price} language={language} />
            </p>
          ) : null}
          <p data-reveal className="text-muted-foreground leading-relaxed">
            {service.summary}
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div data-reveal className="flex flex-col gap-3">
            <h3 className="text-base font-medium">{PRICE_WORDS[language].includes}</h3>
            <ul className="hairline-y flex flex-col">
              {service.included.map((item, index) => (
                <li key={index} className="text-foreground/80 py-2.5 text-sm leading-relaxed">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div data-reveal>
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
          </div>
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
