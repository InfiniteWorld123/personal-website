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
  reason: string
  manage: string
  bookAgain: string
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
  /** What the visitor typed when they cancelled, if they typed anything. */
  cancellationReason?: string
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


/* -------------------------------------------------------------------------- */
/* The letter                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One layout for every booking mail, written the way mail clients still need
 * it: tables, inline styles, no external stylesheet, no web font. Georgia
 * stands in for the site's Fraunces headings, because it is the serif every
 * client already has.
 *
 * The colours are the site's own, taken from `styles.css`: this is the first
 * thing a new client sees after the confirmation screen, and it should look
 * like the page they just left.
 */
const BRAND = {
  primary: '#355cff',
  ink: '#10172f',
  muted: '#5d6b8f',
  faint: '#8794b4',
  line: '#e3ebff',
  ground: '#f4f7ff',
  card: '#ffffff',
} as const

const SANS = 'Helvetica,Arial,sans-serif'
const SERIF = "Georgia,'Times New Roman',serif"

type Row = { label: string; value: string }

/** `value` is placed as HTML, so callers escape whatever came from a person. */
const detailRows = (rows: Row[], align: string): string =>
  rows
    .filter((row) => row.value)
    .map(
      (row) => `
        <tr>
          <td style="padding:0 0 16px;text-align:${align}">
            <div style="font:700 11px/1.4 ${SANS};letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.faint}">${escapeHtml(row.label)}</div>
            <div style="font:700 15px/1.6 ${SANS};color:${BRAND.ink};padding-top:3px">${row.value}</div>
          </td>
        </tr>`,
    )
    .join('')

const button = (href: string, label: string, align: string, filled: boolean): string => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:4px 0 0">
    <tr>
      <td bgcolor="${filled ? BRAND.primary : BRAND.card}" style="border-radius:999px;border:1px solid ${filled ? BRAND.primary : BRAND.line}">
        <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font:700 14px/1 ${SANS};color:${filled ? '#ffffff' : BRAND.ink};text-decoration:none;border-radius:999px">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`

const layout = ({
  language,
  heading,
  intro,
  rows,
  actions,
  signOff,
}: {
  language: BookingLanguage
  heading: string
  intro: string
  rows: Row[]
  actions: string
  signOff: string
}): string => {
  const rtl = language === 'ar'
  const align = rtl ? 'right' : 'left'
  const site = env.BASE_URL.replace(/\/$/, '')

  return `<!doctype html>
<html dir="${rtl ? 'rtl' : 'ltr'}" lang="${language}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BRAND.ground}">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.ground};padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;background:${BRAND.card};border:1px solid ${BRAND.line};border-radius:18px;overflow:hidden">
            <tr><td style="height:5px;background:${BRAND.primary};font-size:0;line-height:0">&nbsp;</td></tr>
            <tr>
              <td style="padding:26px 30px 0;text-align:${align}">
                <div style="font:700 12px/1 ${SANS};letter-spacing:2.4px;text-transform:uppercase;color:${BRAND.ink}">${escapeHtml(env.APP_NAME)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 30px 0;text-align:${align}">
                <h1 style="margin:0;font:700 25px/1.25 ${SERIF};color:${BRAND.ink}">${escapeHtml(heading)}</h1>
                <p style="margin:12px 0 0;font:400 15px/1.75 ${SANS};color:${BRAND.muted}">${escapeHtml(intro)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 30px 0">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.ground};border-radius:14px">
                  <tr>
                    <td style="padding:20px 22px 4px">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                        ${detailRows(rows, align)}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            ${actions ? `<tr><td style="padding:22px 30px 0;text-align:${align}">${actions}</td></tr>` : ''}
            ${
              signOff
                ? `<tr>
              <td style="padding:26px 30px 30px;text-align:${align}">
                <p style="margin:0;font:400 15px/1.7 ${SANS};color:${BRAND.muted}">${escapeHtml(signOff).replaceAll('\n', '<br />')}</p>
              </td>
            </tr>`
                : '<tr><td style="height:26px;font-size:0;line-height:0">&nbsp;</td></tr>'
            }
            <tr>
              <td style="padding:16px 30px;border-top:1px solid ${BRAND.line};text-align:${align}">
                <a href="${escapeHtml(site)}" style="font:400 12px/1.6 ${SANS};color:${BRAND.faint};text-decoration:none">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

/** The same letter for a client that refuses HTML, and for spam scoring. */
const plainText = (lines: Array<string | false | null>): string =>
  lines.filter((line): line is string => Boolean(line)).join('\n')

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
  const actions = cancelled
    ? button(`${site}/${input.language}/booking`, copy.bookAgain, align, true)
    : manage
      ? button(manage, copy.manage, align, true)
      : ''

  await send({
    to: [input.visitorEmail],
    subject: cancelled ? copy.cancelledSubject : copy.confirmedSubject,
    html: layout({
      language: input.language,
      heading: cancelled ? copy.cancelledSubject : copy.confirmedSubject,
      intro: `${copy.greeting} ${input.visitorName}, ${cancelled ? copy.cancelledIntro : copy.confirmedIntro}`,
      rows: [
        { label: copy.when, value: `${escapeHtml(when)}<br /><span style="font-weight:400;color:${BRAND.muted}">${escapeHtml(input.visitorTimezone)}</span>` },
        { label: copy.duration, value: `${input.durationMinutes} ${escapeHtml(copy.minutes)}` },
        { label: copy.where, value: escapeHtml(input.locationLabel) },
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
  const sameZone = input.visitorTimezone === 'Europe/Berlin'
  const multiline = (value: string) => escapeHtml(value).replaceAll('\n', '<br />')

  await send({
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
  })
}
