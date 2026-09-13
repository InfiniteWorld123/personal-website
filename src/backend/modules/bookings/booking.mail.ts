import { env } from '#/shared/env'
import type { BookingLanguage } from '#/shared/validation/booking.validation'
import { buildCalendarEvent } from './booking.ics'

/**
 * Confirmation, cancellation, and the owner's own notification.
 *
 * Nothing here is allowed to fail a booking. `architecture.md` fixes the
 * order: the record is persisted first and the mail is attempted afterwards,
 * so a Resend outage costs a notification, never a booking that a visitor was
 * told was confirmed.
 */

const RESEND_API_URL = 'https://api.resend.com/emails'

type Copy = {
  confirmedSubject: string
  cancelledSubject: string
  greeting: string
  confirmedIntro: string
  cancelledIntro: string
  when: string
  duration: string
  where: string
  reference: string
  manage: string
  minutes: string
  signOff: string
}

const COPY: Record<BookingLanguage, Copy> = {
  de: {
    confirmedSubject: 'Dein Termin ist bestätigt',
    cancelledSubject: 'Dein Termin wurde abgesagt',
    greeting: 'Hallo',
    confirmedIntro: 'dein Termin steht. Ich freue mich auf das Gespräch.',
    cancelledIntro: 'dein Termin wurde abgesagt.',
    when: 'Wann',
    duration: 'Dauer',
    where: 'Wo',
    reference: 'Referenz',
    manage: 'Termin ansehen oder absagen',
    minutes: 'Minuten',
    signOff: 'Bis bald,\nYaman',
  },
  en: {
    confirmedSubject: 'Your call is confirmed',
    cancelledSubject: 'Your call was cancelled',
    greeting: 'Hi',
    confirmedIntro: 'your call is booked. Looking forward to it.',
    cancelledIntro: 'your call has been cancelled.',
    when: 'When',
    duration: 'Duration',
    where: 'Where',
    reference: 'Reference',
    manage: 'View or cancel this booking',
    minutes: 'minutes',
    signOff: 'See you soon,\nYaman',
  },
  ar: {
    confirmedSubject: 'تم تأكيد موعدك',
    cancelledSubject: 'تم إلغاء موعدك',
    greeting: 'مرحباً',
    confirmedIntro: 'تم تثبيت موعدك، وأتطلع إلى الحديث معك.',
    cancelledIntro: 'تم إلغاء موعدك.',
    when: 'الموعد',
    duration: 'المدة',
    where: 'المكان',
    reference: 'الرقم المرجعي',
    manage: 'عرض الموعد أو إلغاؤه',
    minutes: 'دقيقة',
    signOff: 'إلى اللقاء،\nيمان',
  },
}

const LOCALES: Record<BookingLanguage, string> = { de: 'de-DE', en: 'en-GB', ar: 'ar' }

export type BookingMailInput = {
  reference: string
  startsAt: Date
  endsAt: Date
  durationMinutes: number
  visitorName: string
  visitorEmail: string
  visitorTimezone: string
  visitorNote: string
  language: BookingLanguage
  typeName: string
  locationLabel: string
  /** Only present while the plaintext token is still in memory. */
  manageToken?: string
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

/**
 * The meeting time as the visitor's own clock shows it. They chose the slot in
 * their zone; a confirmation in Berlin time would make them do the arithmetic
 * again, which is exactly where people miss calls.
 */
export const formatForVisitor = (
  instant: Date,
  timeZone: string,
  language: BookingLanguage,
): string =>
  new Intl.DateTimeFormat(LOCALES[language], {
    timeZone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(instant)

export const manageUrl = (reference: string, token: string, language: BookingLanguage): string =>
  `${env.BASE_URL.replace(/\/$/, '')}/${language}/booking/manage/${reference}#token=${encodeURIComponent(token)}`

const send = async (payload: Record<string, unknown>): Promise<void> => {
  const apiKey = env.RESEND_API_KEY

  if (!apiKey || !env.EMAIL_FROM) {
    console.warn('[booking] email is not configured; skipping send')

    return
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, ...payload }),
    })

    if (!response.ok) {
      console.error('[booking] email rejected', { status: response.status })
    }
  } catch (error) {
    // Swallowed on purpose: see the note at the top of this file.
    console.error('[booking] email failed', {
      name: error instanceof Error ? error.name : 'UnknownError',
    })
  }
}

const toBase64 = (value: string): string => {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary)
}

export const sendVisitorBookingMail = async (
  input: BookingMailInput,
  cancelled: boolean,
): Promise<void> => {
  const copy = COPY[input.language]
  const when = formatForVisitor(input.startsAt, input.visitorTimezone, input.language)

  const calendar = buildCalendarEvent({
    reference: input.reference,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    summary: input.typeName,
    description: input.visitorNote,
    location: input.locationLabel,
    organizerName: env.APP_NAME,
    organizerEmail: env.EMAIL_FROM ?? 'noreply@yamanwarda.de',
    attendeeName: input.visitorName,
    attendeeEmail: input.visitorEmail,
    cancelled,
  })

  const manageRow =
    input.manageToken && !cancelled
      ? `<p><a href="${escapeHtml(manageUrl(input.reference, input.manageToken, input.language))}">${escapeHtml(copy.manage)}</a></p>`
      : ''

  await send({
    to: [input.visitorEmail],
    subject: cancelled ? copy.cancelledSubject : copy.confirmedSubject,
    html: `
      <p>${escapeHtml(copy.greeting)} ${escapeHtml(input.visitorName)},</p>
      <p>${escapeHtml(cancelled ? copy.cancelledIntro : copy.confirmedIntro)}</p>
      <p><strong>${escapeHtml(copy.when)}:</strong> ${escapeHtml(when)} (${escapeHtml(input.visitorTimezone)})</p>
      <p><strong>${escapeHtml(copy.duration)}:</strong> ${input.durationMinutes} ${escapeHtml(copy.minutes)}</p>
      <p><strong>${escapeHtml(copy.where)}:</strong> ${escapeHtml(input.locationLabel)}</p>
      <p><strong>${escapeHtml(copy.reference)}:</strong> ${escapeHtml(input.reference)}</p>
      ${manageRow}
      <p>${escapeHtml(copy.signOff).replaceAll('\n', '<br />')}</p>
    `,
    attachments: [
      {
        filename: 'termin.ics',
        content: toBase64(calendar),
        content_type: 'text/calendar',
      },
    ],
  })
}

/** The owner's own notification. Always German, and always to one address. */
export const sendOwnerBookingMail = async (
  input: BookingMailInput,
  cancelled: boolean,
): Promise<void> => {
  const to = env.CONTACT_TO_EMAIL
  if (!to) return

  const berlin = formatForVisitor(input.startsAt, 'Europe/Berlin', 'de')
  const theirs = formatForVisitor(input.startsAt, input.visitorTimezone, 'de')

  await send({
    to: [to],
    reply_to: input.visitorEmail,
    subject: `${cancelled ? 'Absage' : 'Neue Buchung'}: ${input.typeName} — ${input.visitorName}`,
    html: `
      <h2>${cancelled ? 'Termin abgesagt' : 'Neuer Termin'}</h2>
      <p><strong>Wann (Berlin):</strong> ${escapeHtml(berlin)}</p>
      <p><strong>Beim Besucher:</strong> ${escapeHtml(theirs)} (${escapeHtml(input.visitorTimezone)})</p>
      <p><strong>Name:</strong> ${escapeHtml(input.visitorName)}</p>
      <p><strong>E-Mail:</strong> ${escapeHtml(input.visitorEmail)}</p>
      <p><strong>Referenz:</strong> ${escapeHtml(input.reference)}</p>
      ${input.visitorNote ? `<p><strong>Nachricht:</strong><br />${escapeHtml(input.visitorNote).replaceAll('\n', '<br />')}</p>` : ''}
    `,
  })
}
