import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { Container } from '#/frontend/components/layout/public/Container'
import { Eyebrow } from '#/frontend/components/layout/public/Section'
import { Button } from '#/frontend/components/ui/button'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { SplitWords, useReveal } from '#/frontend/motion'
import { getBookingEntryCopy } from './booking-entry-copy'
import { formatSlotLabel } from './booking-time'
import { useNextSlots } from './use-next-slots'

/**
 * The home page's one booking ask, placed after the process section: by then
 * the visitor knows what the work looks like, which is the first moment the
 * question "shall we talk?" is fair.
 *
 * The three times are the real next openings and they carry the choice into
 * the calendar already made, so the shortest path from landing page to a
 * booked call is two clicks. With no free time in the horizon the band still
 * stands, with the plain button — an empty calendar is not a reason to hide
 * the invitation.
 */
export function BookingBand() {
  const { language } = useLanguage()
  const entry = getBookingEntryCopy(language)
  const { type, timezone, slots } = useNextSlots(3)
  // The band is not in the tree until the call type has loaded, so the reveal
  // has to be told when it arrives.
  const ref = useReveal<HTMLElement>(type?.slug)

  if (!type) return null

  return (
    <section ref={ref} data-reveal-scope="" className="py-section lg:py-section-lg">
      <Container>
        <div className="booking-band grid gap-8 rounded-[1.9rem] p-7 sm:p-10 lg:grid-cols-[1.2fr_auto] lg:items-center">
          <div className="flex max-w-xl flex-col">
            <Eyebrow data-reveal>{entry.band.eyebrow}</Eyebrow>
            <h2 className="section-title mt-4 text-display-md text-foreground">
              <SplitWords text={entry.band.title} />
            </h2>
            <p data-reveal className="mt-4 text-base leading-8 text-foreground/58">
              {entry.band.body}
            </p>
          </div>

          <div data-reveal className="flex min-w-[15rem] flex-col gap-2.5">
            {slots.length > 0 ? (
              <>
                {slots.map((slot) => (
                  <Link
                    key={slot}
                    to="/$lang/booking/$slug"
                    params={{ lang: language, slug: type.slug }}
                    search={{ slot }}
                    className="booking-slot-link flex items-center justify-between gap-4 rounded-full px-5 py-2.5 text-sm font-semibold text-foreground"
                  >
                    <span className="tabular">{formatSlotLabel(slot, timezone, language)}</span>
                    <span className="booking-slot-go">
                      <ArrowRight className="size-3.5 rtl:-scale-x-100" />
                    </span>
                  </Link>
                ))}
                <p className="text-center text-xs text-muted-foreground">
                  {entry.band.timezone} {timezone} ·{' '}
                  <Link
                    to="/$lang/booking/$slug"
                    params={{ lang: language, slug: type.slug }}
                    className="font-semibold text-primary"
                  >
                    {entry.band.more}
                  </Link>
                </p>
              </>
            ) : (
              <Button asChild size="lg" className="rounded-full px-7">
                <Link to="/$lang/booking/$slug" params={{ lang: language, slug: type.slug }}>
                  {entry.band.button}
                  <ArrowRight className="btn-arrow rtl:-scale-x-100" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </Container>
    </section>
  )
}
