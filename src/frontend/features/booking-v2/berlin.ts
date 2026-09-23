import { OWNER_TIME_ZONE } from '#/backend2/contracts/booking.contract'
import {
  addDays,
  isoWeekday,
  localParts,
  zonedToInstant,
} from '#/backend2/modules/booking/booking.time'

/**
 * Berlin wall-clock time in the browser, with the same conversion the server
 * uses — imported rather than rewritten, so the Dashboard and Backend2 can
 * never disagree about where 09:00 falls on the day the clocks change. The
 * module is pure `Intl`; nothing server-only comes with it.
 */

export { addDays, isoWeekday }

export const berlin = (instant: Date | string) => localParts(new Date(instant), OWNER_TIME_ZONE)

export const berlinToday = (): string => berlin(new Date()).date

/** The Monday of the week that holds this Berlin date. */
export const mondayOf = (date: string): string => addDays(date, 1 - isoWeekday(date))

/** `2026-10-07` + `14:30` in Berlin → an ISO instant, or null in the spring gap. */
export const berlinInstant = (date: string, time: string): string | null => {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  const instant = zonedToInstant(date, hours * 60 + minutes, OWNER_TIME_ZONE)

  return instant ? instant.toISOString() : null
}

export const minuteText = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

export const textMinute = (text: string): number => {
  const [hours = 0, minutes = 0] = text.split(':').map(Number)

  return hours * 60 + minutes
}

export const dayHeading = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export const berlinDateTime = (instant: string): string => {
  const parts = berlin(instant)

  return `${dayHeading(parts.date)} ${new Date(`${parts.date}T12:00:00Z`).getUTCFullYear()}, ${parts.time}`
}
