import type { InboxLanguage } from '#/shared/validation/inbox.validation'

/** Every time in the admin is read on the owner's own clock. */
const BERLIN = 'Europe/Berlin'

/**
 * How long ago, in words — the owner's choice over an exact date.
 *
 * A column of "14:02" tells you nothing about which letter is new; a column of
 * "2 min · 3 h · yesterday" tells you at a glance, which is the list's whole
 * job. Past two days it becomes a date, because "9 days" stops helping.
 */
export const timeAgo = (instant: string): string => {
  const then = new Date(instant)
  const minutes = Math.round((Date.now() - then.getTime()) / 60_000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes} min`

  const hours = Math.round(minutes / 60)

  if (hours < 24) return `${hours} h`
  if (hours < 48) return 'yesterday'

  return new Intl.DateTimeFormat('en-GB', { timeZone: BERLIN, day: '2-digit', month: 'short' })
    .format(then)
}

export const formatDateTime = (instant: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: BERLIN,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant))

/** Initials for the tile. Works for "Tobias Lange" and for "سارة منصور". */
export const initialsOf = (name: string): string => {
  const words = name.trim().split(/\s+/).filter(Boolean)

  if (words.length === 0) return '?'

  return words
    .slice(0, 2)
    .map((word) => [...word][0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * A stable colour per person, so the same face keeps the same tile everywhere.
 * Hue only — saturation and lightness are fixed, so no tile ever fights the
 * page in either theme.
 */
export const avatarHue = (seed: string): number => {
  let hash = 0

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 360
  }

  return hash
}

/**
 * Only the message and the reply flip to Arabic direction — never the page.
 * He settled this after reading a German and an Arabic conversation side by
 * side: a whole panel mirroring itself for one letter is disorienting.
 */
export const directionFor = (language: InboxLanguage): 'rtl' | 'ltr' =>
  language === 'ar' ? 'rtl' : 'ltr'

export const alignFor = (language: InboxLanguage): 'right' | 'left' =>
  language === 'ar' ? 'right' : 'left'

export const LANGUAGE_LABEL: Record<InboxLanguage, string> = {
  de: 'Deutsch',
  en: 'English',
  ar: 'العربية',
}

export const SOURCE_LABEL: Record<string, string> = {
  CONTACT_FORM: 'Contact form',
  BOOKING: 'Booking',
  MANUAL: 'Added by hand',
  MAIL: 'Email',
}

export const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
