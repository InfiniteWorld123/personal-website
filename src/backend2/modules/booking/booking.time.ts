/**
 * Local time, done carefully, with nothing but `Intl`.
 *
 * The owner's hours are Europe/Berlin wall-clock minutes; visitors see their
 * own zone. Two days a year the wall clock lies: in spring 02:00–03:00 does not
 * exist, in autumn 02:00–03:00 happens twice. Everything here converts through
 * the zone's real offset at that instant, and a wall-clock time that does not
 * exist is reported as such rather than silently moved.
 */

const formatters = new Map<string, Intl.DateTimeFormat>()

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(timeZone)

  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    })
    formatters.set(timeZone, formatter)
  }

  return formatter
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

export type LocalParts = {
  /** YYYY-MM-DD */
  date: string
  /** Minutes after local midnight. */
  minute: number
  /** ISO weekday, Monday = 1. */
  weekday: number
  /** HH:MM */
  time: string
}

export const localParts = (instant: Date, timeZone: string): LocalParts => {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((part) => [part.type, part.value]))
  const hour = Number(parts.hour) % 24
  const minute = Number(parts.minute)

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: hour * 60 + minute,
    weekday: WEEKDAYS[parts.weekday as string] ?? 1,
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  }
}

/** The zone's offset from UTC at this instant, in minutes (Berlin summer: +120). */
export const offsetMinutes = (instant: Date, timeZone: string): number => {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(instant).map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  )

  return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / 60_000)
}

/**
 * The instant at which the wall clock in `timeZone` shows `date` + `minute`,
 * or null when that wall-clock time does not exist (the spring gap). In the
 * autumn overlap the earlier of the two instants is returned, consistently.
 */
export const zonedToInstant = (date: string, minute: number, timeZone: string): Date | null => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const naive = Date.UTC(year, month - 1, day, 0, minute)
  const candidates = new Set<number>()

  // Try the offsets on either side of the moment; one of them is right unless
  // the wall-clock time falls in a gap.
  for (const probe of [naive - 36 * 3_600_000, naive, naive + 36 * 3_600_000]) {
    candidates.add(naive - offsetMinutes(new Date(probe), timeZone) * 60_000)
  }

  const matches = [...candidates]
    .filter((candidate) => {
      const local = localParts(new Date(candidate), timeZone)

      return local.date === date && local.minute === minute
    })
    .sort((a, b) => a - b)

  return matches.length > 0 ? new Date(matches[0]!) : null
}

export const addDays = (date: string, days: number): string => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

export const isoWeekday = (date: string): number => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()

  return weekday === 0 ? 7 : weekday
}

export const addMinutes = (instant: Date, minutes: number): Date => new Date(instant.getTime() + minutes * 60_000)

/** A readable date and time for an email, in the reader's language and zone. */
export const formatForEmail = (instant: Date, timeZone: string, language: 'de' | 'en' | 'ar'): string => {
  const locale = { de: 'de-DE', en: 'en-GB', ar: 'ar' }[language]
  const text = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    // Arabic digits would differ from the digits in the link and the reference.
    numberingSystem: 'latn',
  }).format(instant)

  return `${text} (${timeZone.replace(/_/gu, ' ')})`
}
