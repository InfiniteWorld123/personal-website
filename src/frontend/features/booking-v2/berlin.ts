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

const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/u
const TIME_TEXT = /^(\d{2}):(\d{2})$/u

/** A complete `YYYY-MM-DD` — what a filled date input holds. */
export const isDateText = (text: string): boolean => DATE_TEXT.test(text)

/**
 * `14:30` → 870; null for anything that is not a complete `HH:MM` on the
 * clock. An empty or half-typed time input is never read as midnight.
 */
export const textMinute = (text: string): number | null => {
  const match = TIME_TEXT.exec(text)

  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])

  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null
}

/**
 * `2026-10-07` + `14:30` in Berlin → an ISO instant; null in the spring gap
 * and for a date or time that is not complete, so nothing is ever guessed.
 */
export const berlinInstant = (date: string, time: string): string | null => {
  const minute = textMinute(time)

  if (!isDateText(date) || minute === null) return null

  const instant = zonedToInstant(date, minute, OWNER_TIME_ZONE)

  return instant ? instant.toISOString() : null
}

export const minuteText = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

export const dayHeading = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

export const berlinDateTime = (instant: string): string => {
  const parts = berlin(instant)

  return `${dayHeading(parts.date)} ${new Date(`${parts.date}T12:00:00Z`).getUTCFullYear()}, ${parts.time}`
}
