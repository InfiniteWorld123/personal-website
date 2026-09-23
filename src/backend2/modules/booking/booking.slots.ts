import { OWNER_TIME_ZONE } from '../../contracts/booking.contract'
import { addDays, addMinutes, isoWeekday, localParts, zonedToInstant } from './booking.time'

/**
 * Which start times are free. Pure: everything it needs is passed in, so the
 * daylight-saving and buffer rules can be tested without a database.
 *
 * A start is offered when
 *  - it lies on the type's step inside one of that Berlin date's hour ranges,
 *    and the appointment ends by the range's end (by the wall clock);
 *  - it exists on the wall clock (the spring gap is skipped);
 *  - it is inside the visitor's booking window, when a visitor asks;
 *  - neither it nor its buffer touches the kept time of a confirmed appointment.
 */

export type HourRange = { startMinute: number; endMinute: number }

export type SlotType = { durationMinutes: number; bufferMinutes: number; slotStepMinutes: number }

export type Candidate = { start: Date; end: Date }

export const rangesForDate = (
  date: string,
  weekly: Array<{ weekday: number; startMinute: number; endMinute: number }>,
  exceptions: Map<string, HourRange[]>,
): HourRange[] =>
  exceptions.get(date) ?? weekly.filter((range) => range.weekday === isoWeekday(date))

const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean =>
  a.start < b.end && b.start < a.end

/** Every offered start on these Berlin dates, in order. */
export const computeCandidates = (input: {
  dates: string[]
  type: SlotType
  weekly: Array<{ weekday: number; startMinute: number; endMinute: number }>
  exceptions: Map<string, HourRange[]>
  blocked: Array<{ start: Date; end: Date }>
  earliest: Date | null
  latest: Date | null
}): Candidate[] => {
  const out: Candidate[] = []

  for (const date of input.dates) {
    for (const range of rangesForDate(date, input.weekly, input.exceptions)) {
      for (
        let minute = range.startMinute;
        minute + input.type.durationMinutes <= range.endMinute;
        minute += input.type.slotStepMinutes
      ) {
        const start = zonedToInstant(date, minute, OWNER_TIME_ZONE)

        if (!start) continue
        if (input.earliest && start < input.earliest) continue
        if (input.latest && start > input.latest) continue

        const end = addMinutes(start, input.type.durationMinutes)
        const kept = { start, end: addMinutes(end, input.type.bufferMinutes) }

        if (input.blocked.some((other) => overlaps(kept, other))) continue

        out.push({ start, end })
      }
    }
  }

  return out.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/**
 * Whether an instant falls inside the owner's hours for its whole length.
 * Manual appointments may be outside; they are marked so, with a warning.
 */
export const isWithinHours = (input: {
  start: Date
  durationMinutes: number
  weekly: Array<{ weekday: number; startMinute: number; endMinute: number }>
  exceptions: Map<string, HourRange[]>
}): boolean => {
  const local = localParts(input.start, OWNER_TIME_ZONE)
  const end = localParts(addMinutes(input.start, input.durationMinutes), OWNER_TIME_ZONE)
  const endMinute = end.date === local.date ? end.minute : end.minute === 0 && end.date === addDays(local.date, 1) ? 1440 : -1

  if (endMinute < 0) return false

  return rangesForDate(local.date, input.weekly, input.exceptions).some(
    (range) => local.minute >= range.startMinute && endMinute <= range.endMinute,
  )
}

/** The Berlin dates that cover a window in another zone, one day either side. */
export const berlinDatesCovering = (from: Date, to: Date): string[] => {
  const first = addDays(localParts(from, OWNER_TIME_ZONE).date, -1)
  const last = addDays(localParts(to, OWNER_TIME_ZONE).date, 1)
  const dates: string[] = []

  for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date)

  return dates
}
