import type { Language } from '#/frontend/i18n/language'

/**
 * Every word the public booking flow shows, in the three languages the site
 * publishes.
 *
 * Kept in the feature rather than in `content/`, so none of it is among the
 * fields the Dashboard's Content editor can change. The words only the
 * Backend2 booking pages use live beside them, in `v2/booking-v2-copy.ts`.
 */

export type BookingCopy = {
  meta: { title: string; description: string }
  eyebrow: string
  title: string
  intro: string
  chooseCall: string
  minutes: string
  free: string
  pick: string
  steps: { time: string; details: string; done: string }
  calendar: {
    today: string
    previousMonth: string
    nextMonth: string
    weekdays: string[]
    noneThisMonth: string
    noneThisDay: string
    loading: string
    failed: string
    retry: string
    pickDay: string
  }
  timezone: { label: string; shown: string }
  form: {
    heading: string
    name: string
    email: string
    phone: string
    company: string
    projectType: string
    budget: string
    note: string
    noteHint: string
    optional: string
    submit: string
    submitting: string
    back: string
  }
  manage: {
    heading: string
    loading: string
    notFound: string
    failed: string
    retry: string
    when: string
    status: string
    bookAgain: string
    cancelled: string
    alreadyPast: string
    rescheduling: string
    back: string
  }
}

const de: BookingCopy = {
  meta: {
    title: 'Termin buchen',
    description: 'Such dir eine Zeit aus, die dir passt. Kostenlos und unverbindlich.',
  },
  eyebrow: 'Termin',
  title: 'Lass uns reden',
  intro:
    'Such dir eine Zeit aus, die dir passt. Wir gehen dein Vorhaben durch, und danach weißt du, woran du bist — auch wenn wir nicht zusammenarbeiten.',
  chooseCall: 'Worum soll es gehen?',
  minutes: 'Minuten',
  free: 'Kostenlos',
  pick: 'Zeit aussuchen',
  steps: { time: 'Zeit', details: 'Details', done: 'Fertig' },
  calendar: {
    today: 'Heute',
    previousMonth: 'Voriger Monat',
    nextMonth: 'Nächster Monat',
    weekdays: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'],
    noneThisMonth: 'In diesem Monat ist nichts mehr frei.',
    noneThisDay: 'An diesem Tag ist nichts frei.',
    loading: 'Zeiten werden geladen…',
    failed: 'Die Zeiten konnten nicht geladen werden.',
    retry: 'Nochmal versuchen',
    pickDay: 'Wähle einen Tag',
  },
  timezone: {
    label: 'Zeitzone',
    shown: 'Alle Zeiten in',
  },
  form: {
    heading: 'Nur noch ein paar Angaben',
    name: 'Name',
    email: 'E-Mail',
    phone: 'Telefon',
    company: 'Unternehmen',
    projectType: 'Worum geht es',
    budget: 'Budgetrahmen',
    note: 'Worüber willst du sprechen?',
    noteHint: 'Zwei Sätze reichen. Je konkreter, desto besser das Gespräch.',
    optional: 'optional',
    submit: 'Termin bestätigen',
    submitting: 'Wird gebucht…',
    back: 'Andere Zeit wählen',
  },
  manage: {
    heading: 'Dein Termin',
    loading: 'Termin wird geladen…',
    notFound: 'Diesen Termin gibt es nicht, oder der Link ist nicht mehr gültig.',
    failed: 'Der Termin konnte gerade nicht geladen werden.',
    retry: 'Nochmal versuchen',
    when: 'Wann',
    status: 'Status',
    bookAgain: 'Neuen Termin buchen',
    cancelled: 'Der Termin wurde abgesagt.',
    alreadyPast: 'Dieser Termin liegt in der Vergangenheit.',
    rescheduling: 'Wird verschoben…',
    back: 'Zurück zum Termin',
  },
}

const en: BookingCopy = {
  meta: {
    title: 'Book a call',
    description: 'Pick a time that suits you. Free, no strings attached.',
  },
  eyebrow: 'Booking',
  title: 'Let us talk',
  intro:
    'Pick a time that suits you. We go through what you are building, and you leave knowing where you stand — even if we do not end up working together.',
  chooseCall: 'What should we talk about?',
  minutes: 'minutes',
  free: 'Free',
  pick: 'Pick a time',
  steps: { time: 'Time', details: 'Details', done: 'Done' },
  calendar: {
    today: 'Today',
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    noneThisMonth: 'Nothing is free this month.',
    noneThisDay: 'Nothing is free on this day.',
    loading: 'Loading times…',
    failed: 'The times could not be loaded.',
    retry: 'Try again',
    pickDay: 'Pick a day',
  },
  timezone: { label: 'Timezone', shown: 'All times in' },
  form: {
    heading: 'Just a few details',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    company: 'Company',
    projectType: 'What is it about',
    budget: 'Budget range',
    note: 'What would you like to talk about?',
    noteHint: 'Two sentences is plenty. The more concrete, the better the call.',
    optional: 'optional',
    submit: 'Confirm booking',
    submitting: 'Booking…',
    back: 'Pick another time',
  },
  manage: {
    heading: 'Your booking',
    loading: 'Loading booking…',
    notFound: 'That booking does not exist, or the link is no longer valid.',
    failed: 'The booking could not be loaded right now.',
    retry: 'Try again',
    when: 'When',
    status: 'Status',
    bookAgain: 'Book a new time',
    cancelled: 'This booking was cancelled.',
    alreadyPast: 'This booking is in the past.',
    rescheduling: 'Moving booking…',
    back: 'Back to booking',
  },
}

const ar: BookingCopy = {
  meta: {
    title: 'احجز موعداً',
    description: 'اختر الوقت الذي يناسبك. مجاناً وبلا التزام.',
  },
  eyebrow: 'موعد',
  title: 'خلينا نحكي',
  intro:
    'اختر الوقت الذي يناسبك. نمر على مشروعك معاً، وتخرج من المكالمة وأنت تعرف أين تقف — حتى لو لم نعمل سوياً في النهاية.',
  chooseCall: 'عن ماذا نتحدث؟',
  minutes: 'دقيقة',
  free: 'مجاناً',
  pick: 'اختر وقتاً',
  steps: { time: 'الوقت', details: 'البيانات', done: 'تم' },
  calendar: {
    today: 'اليوم',
    previousMonth: 'الشهر السابق',
    nextMonth: 'الشهر التالي',
    weekdays: ['إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت', 'أحد'],
    noneThisMonth: 'لا يوجد وقت متاح في هذا الشهر.',
    noneThisDay: 'لا يوجد وقت متاح في هذا اليوم.',
    loading: 'جارٍ تحميل الأوقات…',
    failed: 'تعذّر تحميل الأوقات.',
    retry: 'حاول مرة أخرى',
    pickDay: 'اختر يوماً',
  },
  timezone: { label: 'المنطقة الزمنية', shown: 'كل الأوقات بتوقيت' },
  form: {
    heading: 'بقيت بيانات قليلة',
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف',
    company: 'الشركة',
    projectType: 'ما موضوع المشروع',
    budget: 'الميزانية التقريبية',
    note: 'عن ماذا تريد أن نتحدث؟',
    noteHint: 'جملتان تكفيان. كلما كان الوصف أوضح، كانت المكالمة أفضل.',
    optional: 'اختياري',
    submit: 'تأكيد الموعد',
    submitting: 'جارٍ الحجز…',
    back: 'اختيار وقت آخر',
  },
  manage: {
    heading: 'موعدك',
    loading: 'جارٍ تحميل الموعد…',
    notFound: 'هذا الموعد غير موجود، أو أن الرابط لم يعد صالحاً.',
    failed: 'تعذّر تحميل الموعد الآن.',
    retry: 'حاول مرة أخرى',
    when: 'الموعد',
    status: 'الحالة',
    bookAgain: 'احجز موعداً جديداً',
    cancelled: 'تم إلغاء هذا الموعد.',
    alreadyPast: 'هذا الموعد في الماضي.',
    rescheduling: 'جارٍ تغيير الموعد…',
    back: 'العودة إلى الموعد',
  },
}

const COPY: Record<Language, BookingCopy> = { de, en, ar }

export const getBookingCopy = (language: Language): BookingCopy => COPY[language]

/** BCP 47 locale for `Intl`, matching what `localeFor` gives the rest of the site. */
export const LOCALES: Record<Language, string> = { de: 'de-DE', en: 'en-GB', ar: 'ar' }
