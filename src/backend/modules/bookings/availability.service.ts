import { MINUTES_PER_DAY } from '#/shared/validation/booking.validation'

/**
 * Slot generation. Deliberately pure: no database, no network, no clock of its
 * own — `now` is an argument. Every hard part of a booking system lives in
 * this file, which is exactly why it has to be testable without a server.
 *
 * The rule it exists to honour: a weekly schedule is written on a wall clock,
 * not on a timeline. "Every Monday at 09:00" means 07:00 UTC in winter and
 * 08:00 UTC in summer, and a naive implementation moves the owner's whole
 * working day by an hour twice a year without anyone noticing until a visitor
 * turns up at the wrong time.
 */

/** One minute-of-day window, `[start, end)`, on the owner's wall clock. */
type Window = { start: number; end: number }

export type ScheduleRule = { weekday: number; startsAtMinute: number; endsAtMinute: number }

export type ScheduleException = {
  onDate: string
  kind: 'BLOCK' | 'OPEN'
  startsAtMinute: number | null
  endsAtMinute: number | null
}

/** An existing confirmed booking, as epoch milliseconds. */
export type ExistingBooking = {
  startsAt: number
  blockedStartsAt: number
  blockedEndsAt: number
}

export type SlotGenerationInput = {
  rules: ScheduleRule[]
  exceptions: ScheduleException[]
  existing: ExistingBooking[]
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  slotIntervalMinutes: number
  minimumNoticeMinutes: number
  maxPerDay: number | null
  ownerTimezone: string
  /** Inclusive range of owner-local days to scan, `YYYY-MM-DD`. */
  fromDate: string
  toDate: string
  /** The last instant that may be offered at all: the booking window's end. */
  latestStart: number
  now: number
}

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

/* -------------------------------------------------------------------------- */
/* Zone arithmetic                                                            */
/* -------------------------------------------------------------------------- */

const formatters = new Map<string, Intl.DateTimeFormat>()

/**
 * `hourCycle: 'h23'` rather than `hour12: false`: the latter is specified to
 * produce hour 24 for midnight in some locales, and reading that back as a
 * number silently shifts a day.
 */
const partsFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = formatters.get(timeZone)
  if (cached) return cached

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

  formatters.set(timeZone, formatter)

  return formatter
}

type WallTime = { year: number; month: number; day: number; hour: number; minute: number }

/** What the clock on the wall in `timeZone` reads at this instant. */
export const wallTimeAt = (instant: number, timeZone: string): WallTime => {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  }
}

/** `YYYY-MM-DD` as that instant reads in the given zone. */
export const dayInZone = (instant: number, timeZone: string): string => {
  const wall = wallTimeAt(instant, timeZone)

  return `${String(wall.year).padStart(4, '0')}-${String(wall.month).padStart(2, '0')}-${String(wall.day).padStart(2, '0')}`
}

/** The zone's offset from UTC at this instant, in milliseconds. */
const zoneOffsetMs = (instant: number, timeZone: string): number => {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant))
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')

  return (
    Date.UTC(read('year'), read('month') - 1, read('day'), read('hour'), read('minute'), read('second')) -
    Math.floor(instant / 1000) * 1000
  )
}

/**
 * The instant at which the clock in `timeZone` reads `day` at `minuteOfDay`.
 *
 * Returns `null` when that reading never happens. On the spring-forward night
 * the clock jumps from 02:00 to 03:00, so 02:30 does not exist and the only
 * honest answer is that there is no such instant — offering it as a slot would
 * confirm a meeting at a time that is not on the calendar.
 *
 * On the autumn night the same reading happens twice; the later one (after the
 * clocks go back) is chosen, deterministically.
 */
export const instantForWallTime = (
  day: string,
  minuteOfDay: number,
  timeZone: string,
): number | null => {
  const [year, month, date] = day.split('-').map(Number)
  if (!year || !month || !date) return null

  // Minute 1440 is midnight at the end of the day; `Date.UTC` rolls it over.
  const asIfUtc = Date.UTC(year, month - 1, date, Math.floor(minuteOfDay / 60), minuteOfDay % 60)

  // One guess with the offset in force at the naive instant, then one
  // correction with the offset actually in force where that guess landed. Two
  // passes settle every real zone: no zone shifts twice within an hour.
  const guess = asIfUtc - zoneOffsetMs(asIfUtc, timeZone)
  const instant = asIfUtc - zoneOffsetMs(guess, timeZone)

  // The round trip is what detects a reading that never happens.
  const wanted = new Date(asIfUtc)
  const actual = wallTimeAt(instant, timeZone)

  const matches =
    actual.year === wanted.getUTCFullYear() &&
    actual.month === wanted.getUTCMonth() + 1 &&
    actual.day === wanted.getUTCDate() &&
    actual.hour === wanted.getUTCHours() &&
    actual.minute === wanted.getUTCMinutes()

  return matches ? instant : null
}

/** Every `YYYY-MM-DD` from `from` to `to`, inclusive. */
export const eachDay = (from: string, to: string): string[] => {
  const start = Date.parse(`${from}T00:00:00.000Z`)
  const end = Date.parse(`${to}T00:00:00.000Z`)

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return []

  const days: string[] = []

  // Capped so a hand-edited range cannot ask the server to walk a century.
  for (let cursor = start; cursor <= end && days.length < 400; cursor += MS_PER_DAY) {
    days.push(new Date(cursor).toISOString().slice(0, 10))
  }

  return days
}

/** Shift a plain date by whole days, without touching a zone. */
export const shiftDay = (day: string, amount: number): string =>
  new Date(Date.parse(`${day}T00:00:00.000Z`) + amount * MS_PER_DAY).toISOString().slice(0, 10)

/** 0 = Sunday, matching `EXTRACT(DOW)` and `Date#getUTCDay`. */
const weekdayOf = (day: string): number => new Date(`${day}T00:00:00.000Z`).getUTCDay()

/* -------------------------------------------------------------------------- */
/* Interval arithmetic                                                        */
/* -------------------------------------------------------------------------- */

/** Sorts and joins touching or overlapping windows into the fewest possible. */
const mergeWindows = (windows: Window[]): Window[] => {
  const sorted = [...windows].sort((a, b) => a.start - b.start)
  const merged: Window[] = []

  for (const window of sorted) {
    const last = merged[merged.length - 1]

    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end)
    else merged.push({ ...window })
  }

  return merged
}

/** Removes `cut` from every window, splitting one in two where it lands inside. */
const subtractWindow = (windows: Window[], cut: Window): Window[] => {
  const result: Window[] = []

  for (const window of windows) {
    if (cut.end <= window.start || cut.start >= window.end) {
      result.push(window)
      continue
    }

    if (cut.start > window.start) result.push({ start: window.start, end: cut.start })
    if (cut.end < window.end) result.push({ start: cut.end, end: window.end })
  }

  return result
}

/**
 * The bookable windows on one day, as minutes on the owner's wall clock.
 *
 * Order matters and is fixed: the weekly rules first, then every opening adds
 * its window, then every block removes its own. A block applied last is a
 * block that always wins — a day marked off cannot be quietly reopened by a
 * rule someone forgot about.
 */
export const windowsForDay = (
  day: string,
  rules: ScheduleRule[],
  exceptions: ScheduleException[],
): Window[] => {
  const weekday = weekdayOf(day)
  const onThisDay = exceptions.filter((exception) => exception.onDate === day)

  const base: Window[] = rules
    .filter((rule) => rule.weekday === weekday)
    .map((rule) => ({ start: rule.startsAtMinute, end: rule.endsAtMinute }))

  for (const exception of onThisDay) {
    if (exception.kind !== 'OPEN') continue
    if (exception.startsAtMinute === null || exception.endsAtMinute === null) continue

    base.push({ start: exception.startsAtMinute, end: exception.endsAtMinute })
  }

  let windows = mergeWindows(base)

  for (const exception of onThisDay) {
    if (exception.kind !== 'BLOCK') continue

    // A block with no window is the whole day off.
    const cut: Window =
      exception.startsAtMinute === null || exception.endsAtMinute === null
        ? { start: 0, end: MINUTES_PER_DAY }
        : { start: exception.startsAtMinute, end: exception.endsAtMinute }

    windows = subtractWindow(windows, cut)
  }

  return windows
}

/* -------------------------------------------------------------------------- */
/* Generation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every instant that may still be booked, ascending. The caller decides how to
 * present them; this returns instants, never formatted times.
 */
export const generateSlots = (input: SlotGenerationInput): number[] => {
  const {
    rules,
    exceptions,
    existing,
    durationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    slotIntervalMinutes,
    minimumNoticeMinutes,
    maxPerDay,
    ownerTimezone,
    latestStart,
    now,
  } = input

  const earliestStart = now + minimumNoticeMinutes * MS_PER_MINUTE
  const durationMs = durationMinutes * MS_PER_MINUTE
  const bufferBeforeMs = bufferBeforeMinutes * MS_PER_MINUTE
  const bufferAfterMs = bufferAfterMinutes * MS_PER_MINUTE

  // How many confirmed bookings each of the owner's days already holds, for
  // the daily cap. Counted on the owner's calendar, not the visitor's: it is
  // the owner's day that fills up.
  const perDay = new Map<string, number>()

  if (maxPerDay !== null) {
    for (const booking of existing) {
      const day = dayInZone(booking.startsAt, ownerTimezone)

      perDay.set(day, (perDay.get(day) ?? 0) + 1)
    }
  }

  const slots: number[] = []
  // A slot must also be compatible with the other slots offered in this very
  // response. Otherwise a 30-minute grid with a 15-minute buffer would show
  // both 09:00 and 09:30 even though accepting one makes the other impossible.
  // Existing bookings are still the source of truth; these virtual holds only
  // make the chooser honest before the next request refreshes it.
  const offeredBlocks: ExistingBooking[] = [...existing]

  for (const day of eachDay(input.fromDate, input.toDate)) {
    if (maxPerDay !== null && (perDay.get(day) ?? 0) >= maxPerDay) continue

    for (const window of windowsForDay(day, rules, exceptions)) {
      for (
        let minute = window.start;
        minute + durationMinutes <= window.end;
        minute += slotIntervalMinutes
      ) {
        const startsAt = instantForWallTime(day, minute, ownerTimezone)

        // The hour the clocks skipped. There is no such time to offer.
        if (startsAt === null) continue
        if (startsAt < earliestStart || startsAt > latestStart) continue

        const blockedStart = startsAt - bufferBeforeMs
        const blockedEnd = startsAt + durationMs + bufferAfterMs

        const taken = offeredBlocks.some(
          (booking) => blockedStart < booking.blockedEndsAt && booking.blockedStartsAt < blockedEnd,
        )

        if (!taken) {
          slots.push(startsAt)
          offeredBlocks.push({ startsAt, blockedStartsAt: blockedStart, blockedEndsAt: blockedEnd })
        }
      }
    }
  }

  // A day may contribute out of order once an opening reaches back before the
  // weekly window, and two days can interleave across a zone change.
  return [...new Set(slots)].sort((a, b) => a - b)
}

/**
 * Whether one instant is a slot this schedule would offer. The submit path
 * asks this before inserting, so a request that skipped the calendar — or one
 * sent an hour after the calendar was drawn — is refused on the same rules the
 * calendar was drawn from.
 */
export const isOfferedSlot = (input: SlotGenerationInput, candidate: number): boolean =>
  generateSlots(input).includes(candidate)

/** Groups instants by the day they fall on where the visitor is. */
export const groupByVisitorDay = (
  slots: number[],
  durationMinutes: number,
  visitorTimezone: string,
): Array<{ date: string; slots: Array<{ startsAt: string; endsAt: string }> }> => {
  const days = new Map<string, Array<{ startsAt: string; endsAt: string }>>()

  for (const instant of slots) {
    const date = dayInZone(instant, visitorTimezone)
    const entry = days.get(date) ?? []

    entry.push({
      startsAt: new Date(instant).toISOString(),
      endsAt: new Date(instant + durationMinutes * MS_PER_MINUTE).toISOString(),
    })

    days.set(date, entry)
  }

  return [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries]) => ({ date, slots: entries }))
}
