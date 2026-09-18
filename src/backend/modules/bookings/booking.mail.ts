import {
  BRAND,
  button,
  escapeHtml,
  layout,
  plainText,
  sendMail,
  toBase64,
} from '#/backend/shared/mail'
import { isCallConfigured } from '#/backend/modules/calls/call.ticket'
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
  reason: string
  manage: string
  bookAgain: string
  /** Only for a video call held on the site. */
  callHere: string
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
    reason: 'Grund',
    manage: 'Termin ansehen oder absagen',
    bookAgain: 'Neuen Termin buchen',
    callHere:
      'Das Gespräch findet direkt auf dieser Seite statt — nichts zu installieren. Der Raum öffnet 15 Minuten vorher; den Link finden Sie über den Button unten.',
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
    reason: 'Reason',
    manage: 'View or cancel this booking',
    bookAgain: 'Book a new time',
    callHere:
      'The call happens right on this website — nothing to install. The room opens 15 minutes beforehand; the button below takes you to it.',
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
    reason: 'السبب',
    manage: 'عرض الموعد أو إلغاؤه',
    bookAgain: 'احجز موعداً جديداً',
    callHere:
      'المكالمة تجري داخل هذا الموقع مباشرة — بلا تثبيت أي برنامج. تفتح الغرفة قبل الموعد بربع ساعة، والزر بالأسفل يوصلك إليها.',
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
  /** A video call is the only kind this site can host itself. */
  locationKind?: string
  /** Only present while the plaintext token is still in memory. */
  manageToken?: string
  /** What the visitor typed when they cancelled, if they typed anything. */
  cancellationReason?: string
}

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



export const sendVisitorBookingMail = async (
  input: BookingMailInput,
  cancelled: boolean,
): Promise<void> => {
  const copy = COPY[input.language]
  const when = formatForVisitor(input.startsAt, input.visitorTimezone, input.language)
  const site = env.BASE_URL.replace(/\/$/, '')
  const align = input.language === 'ar' ? 'right' : 'left'

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

  // Cancelled: the way back in, rather than a link to a booking that is gone.
  const manage =
    input.manageToken && !cancelled ? manageUrl(input.reference, input.manageToken, input.language) : null

  // Said once, under "Where", because that is the line someone reads when they
  // are wondering what they are supposed to click on the day. Not a second
  // link: the room lives behind the button that is already in this letter, and
  // a link that does nothing for six days is a link people learn to ignore.
  const callHere = !cancelled && input.locationKind === 'VIDEO' && isCallConfigured()
  const actions = cancelled
    ? button(`${site}/${input.language}/booking`, copy.bookAgain, align, true)
    : manage
      ? button(manage, copy.manage, align, true)
      : ''

  await sendMail({
    to: [input.visitorEmail],
    subject: cancelled ? copy.cancelledSubject : copy.confirmedSubject,
    html: layout({
      language: input.language,
      heading: cancelled ? copy.cancelledSubject : copy.confirmedSubject,
      intro: `${copy.greeting} ${input.visitorName}, ${cancelled ? copy.cancelledIntro : copy.confirmedIntro}`,
      rows: [
        { label: copy.when, value: `${escapeHtml(when)}<br /><span style="font-weight:400;color:${BRAND.muted}">${escapeHtml(input.visitorTimezone)}</span>` },
        { label: copy.duration, value: `${input.durationMinutes} ${escapeHtml(copy.minutes)}` },
        {
          label: copy.where,
          value: callHere
            ? `${escapeHtml(input.locationLabel)}<br /><span style="font-weight:400;color:${BRAND.muted}">${escapeHtml(copy.callHere)}</span>`
            : escapeHtml(input.locationLabel),
        },
        { label: copy.reference, value: escapeHtml(input.reference) },
        {
          label: copy.reason,
          value:
            cancelled && input.cancellationReason
              ? escapeHtml(input.cancellationReason).replaceAll('\n', '<br />')
              : '',
        },
      ],
      actions,
      signOff: copy.signOff,
    }),
    text: plainText([
      `${copy.greeting} ${input.visitorName},`,
      '',
      cancelled ? copy.cancelledIntro : copy.confirmedIntro,
      '',
      `${copy.when}: ${when} (${input.visitorTimezone})`,
      `${copy.duration}: ${input.durationMinutes} ${copy.minutes}`,
      `${copy.where}: ${input.locationLabel}`,
      callHere ? copy.callHere : '',
      `${copy.reference}: ${input.reference}`,
      cancelled && input.cancellationReason ? `${copy.reason}: ${input.cancellationReason}` : '',
      '',
      cancelled ? `${copy.bookAgain}: ${site}/${input.language}/booking` : manage && `${copy.manage}: ${manage}`,
      '',
      copy.signOff,
    ]),
    attachments: [
      {
        filename: 'termin.ics',
        content: toBase64(calendar),
        content_type: 'text/calendar',
      },
    ],
  }, 'booking')
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
  const sameZone = input.visitorTimezone === 'Europe/Berlin'
  const multiline = (value: string) => escapeHtml(value).replaceAll('\n', '<br />')

  await sendMail({
    to: [to],
    reply_to: input.visitorEmail,
    subject: `${cancelled ? 'Absage' : 'Neue Buchung'}: ${input.typeName} — ${input.visitorName}`,
    html: layout({
      language: 'de',
      heading: cancelled ? 'Termin abgesagt' : 'Neuer Termin',
      intro: cancelled
        ? `${input.visitorName} hat den Termin abgesagt. Die Zeit ist wieder frei.`
        : `${input.visitorName} hat gebucht.`,
      rows: [
        { label: 'Wann (Berlin)', value: escapeHtml(berlin) },
        {
          label: 'Beim Besucher',
          value: sameZone ? '' : `${escapeHtml(theirs)}<br /><span style="font-weight:400;color:${BRAND.muted}">${escapeHtml(input.visitorTimezone)}</span>`,
        },
        { label: 'Name', value: escapeHtml(input.visitorName) },
        { label: 'E-Mail', value: `<a href="mailto:${escapeHtml(input.visitorEmail)}" style="color:${BRAND.primary};text-decoration:none">${escapeHtml(input.visitorEmail)}</a>` },
        { label: 'Referenz', value: escapeHtml(input.reference) },
        { label: 'Nachricht', value: input.visitorNote ? multiline(input.visitorNote) : '' },
        // The reason the visitor typed when cancelling. It was written into
        // the record and never sent anywhere, which made the one mail that
        // needed it the one mail without it.
        { label: 'Grund der Absage', value: input.cancellationReason ? multiline(input.cancellationReason) : '' },
      ],
      actions: '',
      signOff: '',
    }),
    text: plainText([
      cancelled ? 'Termin abgesagt' : 'Neuer Termin',
      '',
      `Wann (Berlin): ${berlin}`,
      !sameZone && `Beim Besucher: ${theirs} (${input.visitorTimezone})`,
      `Name: ${input.visitorName}`,
      `E-Mail: ${input.visitorEmail}`,
      `Referenz: ${input.reference}`,
      Boolean(input.visitorNote) && `Nachricht: ${input.visitorNote}`,
      Boolean(input.cancellationReason) && `Grund der Absage: ${input.cancellationReason}`,
    ]),
  }, 'booking')
}
