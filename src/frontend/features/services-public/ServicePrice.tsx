import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import type { PublicServicePrice } from '#/backend2/contracts/service.contract'
import { Button } from '#/frontend/components/ui/button'
import { PRICE_WORDS, priceParts } from '#/frontend/features/services/service-display'
import type { Language } from '#/frontend/i18n/language'
import { cn } from '#/frontend/lib/utils'

/**
 * A service's price as a visitor reads it, from the same `priceParts` the
 * Dashboard preview uses — so the page and the preview cannot describe one
 * price differently (`docs/v2/services.md`).
 */

function OfferChip({ children }: { children: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full bg-primary/12 px-2.5 align-middle text-xs font-semibold whitespace-nowrap text-primary">
      {children}
    </span>
  )
}

/**
 * One line, for the `/services` list: "ab 990 €", "49 € / Monat", "Preis auf
 * Anfrage". "einmalig" is left for the service page (choice 4A).
 */
export function PriceLine({ price, language }: { price: PublicServicePrice; language: Language }) {
  const parts = priceParts(price, language)
  const words = PRICE_WORDS[language]

  return (
    <span>
      {parts.lead ? `${parts.lead} ` : null}
      {parts.regular ? (
        <>
          <del className="font-normal text-muted-foreground decoration-[1.5px]">
            <span className="sr-only">{words.regular} </span>
            {parts.regular}
          </del>{' '}
          <span className="sr-only">{words.offer} </span>
        </>
      ) : null}
      {parts.amount}
      {parts.period ? <span className="text-[0.72em] font-medium text-muted-foreground"> {parts.period}</span> : null}
      {parts.label ? (
        <>
          {' '}
          <OfferChip>{parts.label}</OfferChip>
        </>
      ) : null}
    </span>
  )
}

/** The card beside a service page: the price, what kind of price it is, and the way to ask. */
export function PriceCard({ price, language }: { price: PublicServicePrice; language: Language }) {
  const parts = priceParts(price, language)
  const words = PRICE_WORDS[language]

  return (
    <div className="surface-card flex flex-col gap-2.5 rounded-3xl border border-border/50 bg-card p-6">
      <p className="text-[0.8rem] font-semibold tracking-[0.02em] text-muted-foreground rtl:tracking-normal">{words.price}</p>
      {parts.label ? (
        <p>
          <OfferChip>{parts.label}</OfferChip>
        </p>
      ) : null}
      <p
        className={cn(
          'font-heading tabular flex flex-wrap items-baseline gap-x-2.5 gap-y-1 leading-[1.05] text-primary',
          price.mode === 'quote' ? 'text-[1.9rem]' : 'text-[2.3rem] rtl:text-[2rem]',
        )}
      >
        {parts.lead ? (
          <span className="font-sans text-base font-medium tracking-normal text-muted-foreground">{parts.lead}</span>
        ) : null}
        {parts.regular ? (
          <del className="text-[0.6em] text-muted-foreground decoration-[1.5px]">
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
      <Button asChild size="lg" className="mt-2.5 w-full rounded-full bg-primary px-7 text-primary-foreground">
        <Link to="/$lang/contact" params={{ lang: language }}>
          {words.cta}
          <ArrowRight className="btn-arrow rtl:-scale-x-100" />
        </Link>
      </Button>
    </div>
  )
}
