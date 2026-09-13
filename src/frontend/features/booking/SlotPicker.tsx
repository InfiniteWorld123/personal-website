import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import type { BookingSlot } from '#/shared/types/booking.types'
import { getBookingCopy } from './booking-copy'
import { formatDay, formatTime } from './booking-time'

/**
 * The times on one day, in the visitor's own zone. Every pill is an instant
 * formatted at render; none of them carries a wall-clock string of its own.
 *
 * These are choices, not actions, so they are deliberately not the site's
 * `Button`: no lift, no glow, no lean towards the pointer. A value you pick
 * should sit still once picked — the movement on this page belongs to the one
 * button that carries you forward, and sixteen of them competing with it read
 * as sixteen calls to action. They are a radio group for the same reason:
 * arrow keys move through a list of times, which is what this is.
 */
export function SlotPicker({
  day,
  slots,
  timezone,
  selected,
  onSelect,
}: {
  day: string
  slots: BookingSlot[]
  timezone: string
  selected: string | null
  onSelect: (startsAt: string) => void
}) {
  const { language } = useLanguage()
  const copy = getBookingCopy(language)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-foreground text-base font-semibold">{formatDay(day, language)}</p>
        <p className="text-foreground/50 text-xs">
          {copy.timezone.shown} <span dir="ltr">{timezone}</span>
        </p>
      </div>

      {slots.length === 0 ? (
        <p className="text-foreground/55 py-6 text-sm">{copy.calendar.noneThisDay}</p>
      ) : (
        // A full working day is sixteen half-hour times. Growing the card that
        // far pushes the confirm button off the screen on a phone, so the
        // times scroll inside their own box and everything around them stays
        // where the visitor last saw it.
        // On a wide screen the box takes the height the calendar column
        // already has — `basis-0` keeps it out of the row's own measurement,
        // so the times can never be what makes the row tall. Stacked on a
        // phone there is no column to match, so it falls back to a cap.
        <div className="slot-scroll -me-1 max-h-[22rem] overflow-x-hidden overflow-y-auto pe-1 lg:max-h-none lg:min-h-0 lg:flex-1 lg:basis-0">
          {/* One column, the way every booking page a visitor has used before
              lists times: read down, not across. A grid of pills spread over a
              wide card put seven times in a row and left the rest of the card
              empty, which reads as a layout that broke rather than a list. */}
          <div
            role="radiogroup"
            aria-label={formatDay(day, language)}
            className="grid grid-cols-1 gap-2"
          >
            {slots.map((slot) => (
              <button
                key={slot.startsAt}
                type="button"
                role="radio"
                aria-checked={slot.startsAt === selected}
                className={cn('time-chip tabular', slot.startsAt === selected && 'is-selected')}
                onClick={() => onSelect(slot.startsAt)}
              >
                {formatTime(slot.startsAt, timezone, language)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
