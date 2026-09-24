import { Link } from '@tanstack/react-router'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { getBookingCopy } from './booking-copy'
import { getBookingEntryCopy } from './booking-entry-copy'
import { formatShortSlot } from './booking-time'
import { useNextSlots } from './use-next-slots'

/**
 * One quiet line under the hero buttons: how long the call is, that it costs
 * nothing, and the next time that is actually free — read from the same
 * availability the calendar uses.
 *
 * It is information, not a second ask: the date is what tells a visitor the
 * booking page is a real calendar and not another form. Nothing renders until
 * a free time exists, so the line can never promise one that does not.
 */
export function NextSlotLine() {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)
  const entry = getBookingEntryCopy(language)
  const { type, timezone, slots } = useNextSlots(1)
  const next = slots[0]

  if (!type || !next) return null

  return (
    <p className="next-slot-line mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground/60">
      <span className="next-slot-dot" aria-hidden="true" />
      <span>
        <span className="tabular">{type.durationMinutes}</span> {copy.minutes}
        {type.free ? ` · ${copy.free}` : null} · {entry.next.label}{' '}
        <b className="font-semibold text-foreground">{formatShortSlot(next, timezone, language)}</b>
      </span>
      <Link
        to="/$lang/booking/$slug"
        params={{ lang: language, slug: type.slug }}
        search={{ slot: next }}
        className="link-underline-slide font-semibold text-primary"
      >
        {entry.next.book}
      </Link>
    </p>
  )
}
