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
    <div className="flex flex-col gap-4">
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
        <div className="slot-scroll -me-1 max-h-64 overflow-x-hidden overflow-y-auto pe-1">
          {/* The column count follows the card, not the window. A breakpoint
              grid put three Arabic times — "09:00 ص" is wider than "09:00" —
              into a narrow card on a wide screen, and they spilled over its
              edge. */}
          <div
            role="radiogroup"
            aria-label={formatDay(day, language)}
            className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-2"
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
