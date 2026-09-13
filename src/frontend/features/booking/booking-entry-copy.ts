import type { Language } from '#/frontend/i18n/language'

/**
 * The words that point at the booking system from the rest of the site: the
 * line under the hero buttons, the band on the home page, the card on the
 * contact page, the footer column, and the two links that let a visitor cross
 * between writing and booking.
 *
 * Separate from `booking-copy.ts` because that file is the flow's own text —
 * calendar, form, confirmation — while this is the invitation to it, and the
 * two get edited for different reasons. Both fold into the same store when B6
 * moves page copy into the database.
 */

export type BookingEntryCopy = {
  /** Primary button, in the header, the hero, and the mobile menu. */
  cta: string
  /** The quieter second door, everywhere the two sit together. */
  write: string
  /** "30 Min. · kostenlos · nächster Termin Do. 14:00 · direkt buchen" */
  next: { label: string; book: string }
  /** Why this call is not a sales call. */
  reassure: string
  band: {
    eyebrow: string
    title: string
    body: string
    button: string
    more: string
    timezone: string
  }
  /** The card above the contact form. */
  aside: { title: string; meta: string; button: string; next: string }
  /** Booking page → contact form, so neither page is a dead end. */
  toContact: { question: string; link: string }
  /** Contact form → booking page, in place of the old "call me" option. */
  toBooking: { question: string; link: string }
  footer: { title: string; book: string; write: string }
}

const de: BookingEntryCopy = {
  cta: 'Termin buchen',
  write: 'Nachricht schreiben',
  next: { label: 'nächster Termin', book: 'direkt buchen' },
  reassure:
    'Kein Verkaufsgespräch. Wenn ich nicht der Richtige für dein Vorhaben bin, sage ich es dir im Gespräch.',
  band: {
    eyebrow: 'Termin',
    title: 'Lieber gleich sprechen?',
    body: 'Dreißig Minuten, kostenlos und unverbindlich. Danach weißt du, woran du bist — auch wenn wir nicht zusammenarbeiten.',
    button: 'Zeit aussuchen',
    more: 'mehr Zeiten',
    timezone: 'Alle Zeiten in',
  },
  aside: {
    title: 'Lieber direkt sprechen?',
    meta: 'Erstgespräch · kostenlos',
    button: 'Zeit aussuchen',
    next: 'Nächster freier Termin:',
  },
  toContact: { question: 'Lieber schreiben?', link: 'Zum Kontaktformular' },
  toBooking: { question: 'Lieber telefonieren?', link: 'Such dir direkt eine Zeit aus' },
  footer: { title: 'Loslegen', book: 'Termin buchen', write: 'Nachricht schreiben' },
}

const en: BookingEntryCopy = {
  cta: 'Book a call',
  write: 'Write a message',
  next: { label: 'next opening', book: 'book it' },
  reassure:
    'Not a sales call. If I am not the right person for what you are building, I will say so on the call.',
  band: {
    eyebrow: 'Booking',
    title: 'Rather talk it through?',
    body: 'Thirty minutes, free and without obligation. Afterwards you know where you stand — even if we do not end up working together.',
    button: 'Pick a time',
    more: 'more times',
    timezone: 'All times in',
  },
  aside: {
    title: 'Rather talk directly?',
    meta: 'Intro call · free',
    button: 'Pick a time',
    next: 'Next free time:',
  },
  toContact: { question: 'Rather write?', link: 'Go to the contact form' },
  toBooking: { question: 'Rather talk?', link: 'Pick a time that suits you' },
  footer: { title: 'Get started', book: 'Book a call', write: 'Write a message' },
}

const ar: BookingEntryCopy = {
  cta: 'احجز موعداً',
  write: 'أرسل رسالة',
  next: { label: 'أقرب موعد', book: 'احجزه مباشرة' },
  reassure:
    'ليست مكالمة بيع. إن لم أكن الشخص المناسب لمشروعك، سأقول لك ذلك في المكالمة نفسها.',
  band: {
    eyebrow: 'موعد',
    title: 'تفضّل الحديث مباشرة؟',
    body: 'ثلاثون دقيقة، مجاناً وبلا التزام. بعدها تعرف أين تقف — حتى لو لم نعمل معاً.',
    button: 'اختر وقتاً',
    more: 'مواعيد أخرى',
    timezone: 'كل المواعيد بتوقيت',
  },
  aside: {
    title: 'تفضّل الحديث مباشرة؟',
    meta: 'مكالمة تعارف · مجانية',
    button: 'اختر وقتاً',
    next: 'أقرب موعد متاح:',
  },
  toContact: { question: 'تفضّل الكتابة؟', link: 'إلى نموذج التواصل' },
  toBooking: { question: 'تفضّل المكالمة؟', link: 'اختر وقتاً يناسبك مباشرة' },
  footer: { title: 'ابدأ', book: 'احجز موعداً', write: 'أرسل رسالة' },
}

const COPY: Record<Language, BookingEntryCopy> = { de, en, ar }

export const getBookingEntryCopy = (language: Language): BookingEntryCopy => COPY[language]
