/**
 * The calendar attachment that rides along with a confirmation.
 *
 * Written by hand rather than pulled from a package: the file is a dozen
 * lines, and the two things that actually break calendar clients — escaping
 * and line folding — are the two things a wrapper would hide.
 */

export type CalendarEvent = {
  reference: string
  startsAt: Date
  endsAt: Date
  summary: string
  description: string
  location: string
  organizerName: string
  organizerEmail: string
  attendeeName: string
  attendeeEmail: string
  cancelled: boolean
}

/** `20260914T080000Z`. Always UTC; a floating time would drift by client. */
const toIcsInstant = (value: Date): string =>
  `${value.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`

/**
 * Backslash, semicolon and comma are separators in the format itself, and a
 * newline has to become the two characters `\n`. Getting this wrong truncates
 * an event at the first comma in the visitor's message.
 */
const escapeText = (value: string): string =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,')
    .replaceAll(/\r\n|\r|\n/g, '\\n')

/**
 * RFC 5545 allows 75 octets per line; longer content lines continue on the
 * next line after a single space. Folded on bytes rather than characters, so
 * a German umlaut or an Arabic word cannot push a line over the limit.
 */
const foldLine = (line: string): string => {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line

  const decoder = new TextDecoder()
  const parts: string[] = []
  let offset = 0

  while (offset < bytes.length) {
    // 75 on the first line, 74 on the rest: the leading space counts.
    const limit = offset === 0 ? 75 : 74
    let take = Math.min(limit, bytes.length - offset)

    // Never split a multi-byte character: continuation bytes are 10xxxxxx.
    while (take > 1 && (bytes[offset + take] & 0b1100_0000) === 0b1000_0000) take -= 1

    parts.push(decoder.decode(bytes.subarray(offset, offset + take)))
    offset += take
  }

  return parts.join('\r\n ')
}

export const buildCalendarEvent = (event: CalendarEvent): string => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Yaman Warda//Booking//EN',
    'CALSCALE:GREGORIAN',
    // REQUEST invites; CANCEL withdraws the event the same UID created.
    `METHOD:${event.cancelled ? 'CANCEL' : 'REQUEST'}`,
    'BEGIN:VEVENT',
    // Stable across reschedules and cancellations, which is what lets a client
    // replace the event it already has instead of adding a second one.
    `UID:${event.reference}@yamanwarda.de`,
    `DTSTAMP:${toIcsInstant(new Date())}`,
    `DTSTART:${toIcsInstant(event.startsAt)}`,
    `DTEND:${toIcsInstant(event.endsAt)}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `LOCATION:${escapeText(event.location)}`,
    `ORGANIZER;CN=${escapeText(event.organizerName)}:mailto:${event.organizerEmail}`,
    `ATTENDEE;CN=${escapeText(event.attendeeName)};RSVP=TRUE:mailto:${event.attendeeEmail}`,
    `STATUS:${event.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    `SEQUENCE:${event.cancelled ? 1 : 0}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  // CRLF, not LF: some clients reject a calendar that uses bare newlines.
  return `${lines.map(foldLine).join('\r\n')}\r\n`
}
