import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '#/frontend/components/ui/button'
import { useLanguage } from '#/frontend/i18n/language-provider'
import { cn } from '#/frontend/lib/utils'
import { getBookingCopy } from './booking-copy'
import { addMonths, formatMonth, monthGrid, startOfMonth } from './booking-time'

/**
 * A month grid, built rather than borrowed. It has to mirror in Arabic, know
 * which days have slots, and carry the site's own card and button treatment —
 * three things that are harder to bend a calendar library into than to write.
 *
 * Weeks start on Monday, which is what a German calendar does.
 */
export function BookingCalendar({
  month,
  today,
  lastBookableDate,
  availableDays,
  selectedDay,
  onMonthChange,
  onSelectDay,
}: {
  month: string
  today: string
  lastBookableDate: string
  availableDays: Set<string>
  selectedDay: string | null
  onMonthChange: (month: string) => void
  onSelectDay: (day: string) => void
}) {
  const { language, isRtl } = useLanguage()
  const copy = getBookingCopy(language).calendar

  const cells = monthGrid(month)
  const canGoBack = month > startOfMonth(today)
  const canGoForward = month < startOfMonth(lastBookableDate)

  // The chevrons point the way the reader travels, not the way the box sits.
  const Previous = isRtl ? ChevronRight : ChevronLeft
  const Next = isRtl ? ChevronLeft : ChevronRight

  return (
    <div className="surface-card flex flex-col gap-4 rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-full"
          aria-label={copy.previousMonth}
          disabled={!canGoBack}
          onClick={() => onMonthChange(addMonths(month, -1))}
        >
          <Previous aria-hidden="true" className="size-4" />
        </Button>

        <p className="text-foreground text-base font-semibold">{formatMonth(month, language)}</p>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-full"
          aria-label={copy.nextMonth}
          disabled={!canGoForward}
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <Next aria-hidden="true" className="size-4" />
        </Button>
      </div>

      <div role="grid" className="grid grid-cols-7 gap-1.5">
        {copy.weekdays.map((weekday) => (
          <div
            key={weekday}
            role="columnheader"
            className="text-foreground/45 pb-1 text-center text-[0.7rem] font-semibold"
          >
            {weekday}
          </div>
        ))}

        {cells.map((day, index) => {
          if (day === null) return <div key={`empty-${index}`} aria-hidden="true" />

          const isAvailable = availableDays.has(day)
          const isSelected = day === selectedDay
          const isToday = day === today

          return (
            <button
              key={day}
              type="button"
              role="gridcell"
              disabled={!isAvailable}
              aria-pressed={isSelected}
              aria-label={day}
              onClick={() => onSelectDay(day)}
              className={cn(
                'tabular relative flex aspect-square items-center justify-center rounded-full',
                'text-sm transition-[transform,background-color,color] duration-200',
                'focus-visible:ring-primary/50 focus-visible:ring-2 focus-visible:outline-none',
                isAvailable
                  ? 'text-foreground hover:bg-secondary cursor-pointer font-semibold hover:-translate-y-0.5'
                  : 'text-foreground/25 cursor-not-allowed',
                // The selected day carries the same blue the primary buttons do.
                isSelected && 'booking-day-selected text-white hover:-translate-y-0',
              )}
            >
              {Number(day.slice(8, 10))}
              {isAvailable && !isSelected ? (
                <span
                  aria-hidden="true"
                  className="bg-primary absolute bottom-1.5 size-1 rounded-full"
                />
              ) : null}
              {isToday ? <span className="sr-only"> ({copy.today})</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
