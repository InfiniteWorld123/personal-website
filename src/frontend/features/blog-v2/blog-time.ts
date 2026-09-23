import {
  BLOG_TIME_ZONE,
  berlinWallTimeToInstant,
  instantToBerlinWallTime,
} from '#/backend2/contracts/blog.contract'

/**
 * Dates as the Dashboard says them — in English, and for a schedule, on the
 * clock in Berlin, because that is the clock the owner chose the time on.
 * The arithmetic is the contract's, so the editor and the server read a time
 * the same way whatever zone the laptop is set to.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "23 Sep 2026". */
export const dashDate = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

/** "5 minutes ago", "yesterday" — and a plain date after a month. */
export const dashAgo = (iso: string, now: number = Date.now()): string => {
  const diff = now - new Date(iso).getTime()
  const words = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return words.format(-Math.round(diff / MINUTE), 'minute')
  if (diff < DAY) return words.format(-Math.round(diff / HOUR), 'hour')
  if (diff < 30 * DAY) return words.format(-Math.round(diff / DAY), 'day')

  return dashDate(iso)
}

/** "Tue 29 Sep, 09:00" in Berlin. */
export const berlinShort = (instant: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: BLOG_TIME_ZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)

/** "Tuesday 29 September 2026 at 09:00" in Berlin. */
export const berlinLong = (instant: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: BLOG_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)

/** The next given weekday (0 = Sunday) on the Berlin calendar, as `YYYY-MM-DD`. */
export const nextBerlinWeekday = (weekday: number, from: Date = new Date()): string => {
  for (let add = 1; add <= 8; add += 1) {
    const { date } = instantToBerlinWallTime(new Date(from.getTime() + add * DAY))
    const noon = berlinWallTimeToInstant(date, '12:00')

    if (noon && noon.getUTCDay() === weekday) return date
  }

  return instantToBerlinWallTime(new Date(from.getTime() + DAY)).date
}

/** Tomorrow on the Berlin calendar. */
export const berlinTomorrow = (from: Date = new Date()): string =>
  instantToBerlinWallTime(new Date(from.getTime() + DAY)).date

/**
 * The same moment where the owner is, when that is not Berlin — "Tue 08:00" —
 * so a schedule chosen while travelling is not an hour off by surprise.
 */
export const localTimeIfNotBerlin = (instant: Date): string | null => {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone

  if (zone === BLOG_TIME_ZONE) return null

  const here = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

  return here.format(instant) === berlinShortTime(instant) ? null : here.format(instant)
}

const berlinShortTime = (instant: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: BLOG_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant)
