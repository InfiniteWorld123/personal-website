import type { BookingLanguage, BookingMethod } from '../../contracts/booking.contract'
import { formatForEmail } from './booking.time'

/**
 * The visitor's emails, in the language they booked in — or, for a manual
 * appointment, the language the owner chose. Plain text: they go out through
 * the Inbox, which renders them and threads the answers back.
 *
 * Every email names the time in the visitor's own zone, says how the meeting
 * happens, and carries the private link. Nothing is translated on the fly;
 * this file is the whole vocabulary.
 */

export type MailKind = 'confirmation' | 'invitation' | 'rescheduled' | 'cancelled' | 'reminder'

export type MailInput = {
  kind: MailKind
  language: BookingLanguage
  visitorName: string
  typeName: string
  method: BookingMethod
  startsAt: Date
  timeZone: string
  reference: string
  manageUrl: string
  roomUrl: string
  phone: string | null
  cancelledBy?: 'visitor' | 'owner'
  reason?: string | null
}

const COPY = {
  de: {
    subject: {
      confirmation: 'Termin bestätigt',
      invitation: 'Einladung zu einem Termin',
      rescheduled: 'Termin verschoben',
      cancelled: 'Termin abgesagt',
      reminder: 'Erinnerung an deinen Termin',
    },
    hello: (name: string) => `Hallo ${name},`,
    intro: {
      confirmation: 'dein Termin steht. Ich freue mich auf das Gespräch.',
      invitation: 'ich habe einen Termin mit dir eingetragen.',
      rescheduled: 'dein Termin hat eine neue Zeit.',
      cancelled: 'dein Termin wurde abgesagt.',
      reminder: 'eine kurze Erinnerung an unseren Termin.',
    },
    what: 'Termin',
    when: 'Zeit',
    how: 'Art',
    ref: 'Referenz',
    methods: { video: 'Videocall', in_person: 'Persönliches Treffen', phone: 'Telefonat' },
    video: (url: string) => `Zum Videocall: ${url}\nDu kannst den Link vorher öffnen, um Kamera und Mikrofon zu testen.`,
    inPerson: 'Den Treffpunkt stimmen wir per E-Mail ab — antworte einfach auf diese Nachricht.',
    phone: (phone: string | null) => `Ich rufe dich unter ${phone ?? 'deiner Nummer'} an.`,
    manage: (url: string) => `Termin ändern oder absagen (bis 12 Stunden vorher): ${url}`,
    reason: 'Grund',
    byOwner: 'Ich musste den Termin leider absagen.',
    rebook: 'Du kannst jederzeit einen neuen Termin buchen: https://yamanwarda.de/de/booking',
    reply: 'Bei Fragen antworte einfach auf diese E-Mail.',
    bye: 'Bis bald,\nYaman',
  },
  en: {
    subject: {
      confirmation: 'Appointment confirmed',
      invitation: 'Invitation to an appointment',
      rescheduled: 'Appointment rescheduled',
      cancelled: 'Appointment cancelled',
      reminder: 'Reminder of your appointment',
    },
    hello: (name: string) => `Hello ${name},`,
    intro: {
      confirmation: 'your appointment is confirmed. Looking forward to it.',
      invitation: 'I have set up an appointment with you.',
      rescheduled: 'your appointment has a new time.',
      cancelled: 'your appointment has been cancelled.',
      reminder: 'a short reminder of our appointment.',
    },
    what: 'Appointment',
    when: 'Time',
    how: 'How',
    ref: 'Reference',
    methods: { video: 'Video call', in_person: 'In person', phone: 'Phone call' },
    video: (url: string) => `Join the video call: ${url}\nYou can open the link early to test your camera and microphone.`,
    inPerson: 'We agree on the place by email — just reply to this message.',
    phone: (phone: string | null) => `I will call you on ${phone ?? 'your number'}.`,
    manage: (url: string) => `Change or cancel (until 12 hours before): ${url}`,
    reason: 'Reason',
    byOwner: 'Unfortunately I had to cancel it.',
    rebook: 'You can book a new time whenever you like: https://yamanwarda.de/en/booking',
    reply: 'If you have questions, just reply to this email.',
    bye: 'See you soon,\nYaman',
  },
  ar: {
    subject: {
      confirmation: 'تم تأكيد الموعد',
      invitation: 'دعوة إلى موعد',
      rescheduled: 'تم تغيير موعدك',
      cancelled: 'تم إلغاء الموعد',
      reminder: 'تذكير بموعدك',
    },
    hello: (name: string) => `مرحبًا ${name}،`,
    intro: {
      confirmation: 'تم تأكيد موعدك.',
      invitation: 'حدّدتُ موعدًا معك.',
      rescheduled: 'لموعدك وقت جديد.',
      cancelled: 'تم إلغاء موعدك.',
      reminder: 'تذكير قصير بموعدك.',
    },
    what: 'الموعد',
    when: 'الوقت',
    how: 'الطريقة',
    ref: 'الرقم المرجعي',
    methods: { video: 'مكالمة فيديو', in_person: 'لقاء شخصي', phone: 'مكالمة هاتفية' },
    video: (url: string) => `للانضمام إلى مكالمة الفيديو: ${url}\nيمكنك فتح الرابط مبكرًا لتجربة الكاميرا والميكروفون.`,
    inPerson: 'نتفق على مكان اللقاء عبر البريد الإلكتروني — فقط رُدّ على هذه الرسالة.',
    phone: (phone: string | null) => `سأتصل بك على الرقم ${phone ?? 'الذي أدخلته'}.`,
    manage: (url: string) => `لتغيير الموعد أو إلغائه (حتى 12 ساعة قبله): ${url}`,
    reason: 'السبب',
    byOwner: 'اضطررتُ للأسف إلى إلغاء الموعد.',
    rebook: 'يمكنك حجز موعد جديد في أي وقت: https://yamanwarda.de/ar/booking',
    reply: 'إذا كان لديك سؤال، فقط رد على هذه الرسالة.',
    bye: 'إلى اللقاء،\nيمان',
  },
} as const

export const bookingMail = (input: MailInput & { changeLimitHours?: number }): { subject: string; text: string } => {
  const copy = COPY[input.language]
  const when = formatForEmail(input.startsAt, input.timeZone, input.language)
  const cancelled = input.kind === 'cancelled'
  const manage = copy.manage(input.manageUrl).replace('12', String(input.changeLimitHours ?? 12))

  const how =
    input.method === 'video' ? copy.video(input.roomUrl) : input.method === 'in_person' ? copy.inPerson : copy.phone(input.phone)

  const lines = [
    `${copy.hello(input.visitorName)}`,
    '',
    input.language === 'ar' ? copy.intro[input.kind] : copy.intro[input.kind].charAt(0).toUpperCase() + copy.intro[input.kind].slice(1),
    cancelled && input.cancelledBy === 'owner' ? copy.byOwner : '',
    '',
    `${copy.what}: ${input.typeName}`,
    `${copy.when}: ${when}`,
    `${copy.how}: ${copy.methods[input.method]}`,
    `${copy.ref}: ${input.reference}`,
    cancelled && input.reason ? `${copy.reason}: ${input.reason}` : '',
    '',
    cancelled ? copy.rebook : how,
    cancelled ? '' : '',
    cancelled ? '' : manage,
    '',
    copy.reply,
    '',
    copy.bye,
  ]

  return {
    subject: `${copy.subject[input.kind]}: ${input.typeName} · ${when}`,
    text: lines
      .join('\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim(),
  }
}
