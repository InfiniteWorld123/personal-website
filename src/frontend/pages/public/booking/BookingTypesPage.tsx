import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Clock, Video } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { getBookingCopy } from '#/frontend/features/booking/booking-copy'
import { bookingTypesQuery } from '#/frontend/features/booking/booking-queries'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal, useTilt } from '#/frontend/motion'
import type { PublicBookingType } from '#/shared/types/booking.types'

export function BookingTypesPage() {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const types = useQuery(bookingTypesQuery(language))
  const ref = useReveal<HTMLElement>()

  return (
    <section ref={ref} data-reveal-scope="" className="py-section lg:py-section-lg">
      <Container className="flex flex-col gap-10">
        <div className="flex max-w-2xl flex-col">
          <Eyebrow data-reveal>{copy.eyebrow}</Eyebrow>
          <h1 className="section-title text-display-lg text-foreground mt-5">
            <SplitWords text={copy.title} />
          </h1>
          <p data-reveal className="text-foreground/58 mt-5 text-base leading-8 sm:text-[1.05rem]">
            {copy.intro}
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <p className="text-foreground text-base font-semibold">{copy.chooseCall}</p>

          {types.isPending ? (
            <p className="text-foreground/55 py-12 text-sm">{copy.calendar.loading}</p>
          ) : types.isError ? (
            <div className="border-destructive/40 bg-destructive/5 flex flex-col items-start gap-3 rounded-[1.4rem] border p-6">
              <p className="text-destructive text-sm">{copy.calendar.failed}</p>
              <Button type="button" variant="outline" onClick={() => void types.refetch()}>
                {copy.calendar.retry}
              </Button>
            </div>
          ) : types.data.length === 0 ? (
            <p className="text-foreground/55 py-12 text-sm">{copy.calendar.noneThisMonth}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {types.data.map((type) => (
                <BookingTypeCard key={type.slug} type={type} />
              ))}
            </div>
          )}
        </div>
      </Container>
    </section>
  )
}

function BookingTypeCard({ type }: { type: PublicBookingType }) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const tilt = useTilt<HTMLDivElement>()

  return (
    <div
      data-tilt
      ref={tilt}
      className="surface-card surface-card-hover flex flex-col gap-4 rounded-[1.75rem] p-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="brand-mark text-primary">
          <Video aria-hidden="true" className="size-4" />
        </span>
        <span className="text-foreground/55 inline-flex items-center gap-1.5 text-xs font-semibold">
          <Clock aria-hidden="true" className="size-3.5" />
          <span className="tabular">{type.durationMinutes}</span> {copy.minutes}
        </span>
        {type.priceCents === 0 ? (
          <span className="text-primary text-xs font-semibold">{copy.free}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="font-heading text-foreground text-xl font-semibold">{type.name}</p>
        <p className="text-foreground/58 text-sm leading-7">{type.description}</p>
      </div>

      <Button asChild className="mt-auto w-fit rounded-full">
        <Link to="/$lang/booking/$slug" params={{ lang: language, slug: type.slug }}>
          {copy.pick}
          <ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" />
        </Link>
      </Button>
    </div>
  )
}
