import { Link } from '@tanstack/react-router'
import { ArrowRight, CalendarDays } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { getBookingCopy } from './booking-copy'
import { getBookingEntryCopy } from './booking-entry-copy'
import { formatSlotLabel } from './booking-time'
import { useNextSlots } from './use-next-slots'

/**
 * The booking card above the contact details. This is the page a visitor
 * reaches when they have already decided to get in touch, so it is the one
 * place where showing the faster route costs nothing: the form stays right
 * beside it for everyone who would rather write.
 */
export function BookingAside() {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const entry = getBookingEntryCopy(language)
  const { type, timezone, slots } = useNextSlots(1)
  const next = slots[0]

  if (!type) return null

  return (
    <div className="booking-aside flex flex-col gap-4 rounded-[1.4rem] p-5">
      <div className="flex items-center gap-4">
        <span className="brand-mark text-primary">
          <CalendarDays className="size-4" />
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="text-base font-semibold text-foreground">{entry.aside.title}</p>
          <p className="text-sm text-muted-foreground">
            {type.name} · <span className="tabular">{type.durationMinutes}</span> {copy.minutes}
            {type.free ? ` · ${copy.free}` : null}
          </p>
        </div>
      </div>

      <Button asChild className="w-full rounded-full">
        <Link to="/$lang/booking/$slug" params={{ lang: language, slug: type.slug }}>
          {entry.aside.button}
          <ArrowRight className="btn-arrow rtl:-scale-x-100" />
        </Link>
      </Button>

      {next ? (
        <p className="text-center text-xs text-muted-foreground">
          {entry.aside.next}{' '}
          <b className="font-semibold text-foreground">{formatSlotLabel(next, timezone, language)}</b>
        </p>
      ) : null}
    </div>
  )
}
