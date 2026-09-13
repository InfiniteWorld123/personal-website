import { Button } from '#/frontend/components/ui/button'
import { useLanguage } from '#/frontend/i18n/language-provider'
import type { BookingSlot } from '#/shared/types/booking.types'
import { getBookingCopy } from './booking-copy'
import { formatDay, formatTime } from './booking-time'

/**
 * The times on one day, in the visitor's own zone. Every pill is an instant
 * formatted at render; none of them carries a wall-clock string of its own.
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
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {slots.map((slot) => (
            <Button
              key={slot.startsAt}
              type="button"
              variant={slot.startsAt === selected ? 'default' : 'outline'}
              aria-pressed={slot.startsAt === selected}
              className="tabular rounded-full"
              onClick={() => onSelect(slot.startsAt)}
            >
              {formatTime(slot.startsAt, timezone, language)}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
