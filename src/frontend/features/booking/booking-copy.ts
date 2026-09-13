import type { Language } from '#/frontend/i18n/language'

/**
 * Every word the public booking flow shows, in the three languages the site
 * publishes.
 *
 * Kept in the feature rather than in `content/` because the block that moves
 * page copy into the database (B6) has not run yet, and adding a section this
 * size to `ContentCopy` now would mean editing the shared shape twice. It
 * folds into the same store as everything else when B6 lands.
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
  timezone: { label: string; shown: string; change: string }
  form: {
    heading: string
    name: string
    email: string
    phone: string
    phoneHint: string
    company: string
    projectType: string
    budget: string
    timeline: string
    note: string
    noteHint: string
    optional: string
    submit: string
    submitting: string
    back: string
    failed: string
  }
  confirmed: {
    heading: string
    body: string
    when: string
    duration: string
    reference: string
    emailed: string
    cancel: string
  }
  manage: {
    heading: string
    loading: string
    notFound: string
    failed: string
    retry: string
    when: string
    status: string
    cancelHeading: string
    cancelBody: string
    cancelReason: string
    cancelConfirm: string
    cancelling: string
    cancelled: string
    alreadyPast: string
    rescheduleHeading: string
    rescheduleBody: string
    reschedulePick: string
    rescheduling: string
    rescheduled: string
    viewNewBooking: string
    back: string
  }
  status: Record<'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW', string>
  location: Record<'VIDEO' | 'PHONE' | 'IN_PERSON', string>
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
    change: 'Zeitzone ändern',
  },
  form: {
    heading: 'Nur noch ein paar Angaben',
    name: 'Name',
    email: 'E-Mail',
    phone: 'Telefon',
    phoneHint: 'Falls die Verbindung streikt.',
    company: 'Unternehmen',
    projectType: 'Worum geht es',
    budget: 'Budgetrahmen',
    timeline: 'Zeitrahmen',
    note: 'Worüber willst du sprechen?',
    noteHint: 'Zwei Sätze reichen. Je konkreter, desto besser das Gespräch.',
    optional: 'optional',
    submit: 'Termin bestätigen',
    submitting: 'Wird gebucht…',
    back: 'Andere Zeit wählen',
    failed: 'Der Termin konnte nicht gebucht werden.',
  },
  confirmed: {
    heading: 'Der Termin steht',
    body: 'Ich freue mich auf das Gespräch.',
    when: 'Wann',
    duration: 'Dauer',
    reference: 'Referenz',
    emailed: 'Die Bestätigung mit Kalendereintrag ist unterwegs zu dir.',
    cancel: 'Termin ansehen oder absagen',
  },
  manage: {
    heading: 'Dein Termin',
    loading: 'Termin wird geladen…',
    notFound: 'Diesen Termin gibt es nicht, oder der Link ist nicht mehr gültig.',
    failed: 'Der Termin konnte gerade nicht geladen werden.',
    retry: 'Nochmal versuchen',
    when: 'Wann',
    status: 'Status',
    cancelHeading: 'Termin absagen',
    cancelBody: 'Kein Problem. Sag kurz Bescheid, dann wird die Zeit wieder frei.',
    cancelReason: 'Grund',
    cancelConfirm: 'Termin absagen',
    cancelling: 'Wird abgesagt…',
    cancelled: 'Der Termin wurde abgesagt.',
    alreadyPast: 'Dieser Termin liegt in der Vergangenheit.',
    rescheduleHeading: 'Termin verschieben',
    rescheduleBody: 'Wähle einfach eine neue Zeit aus.',
    reschedulePick: 'Neue Zeit bestätigen',
    rescheduling: 'Wird verschoben…',
    rescheduled: 'Dein Termin wurde verschoben.',
    viewNewBooking: 'Neuen Termin ansehen',
    back: 'Zurück zum Termin',
  },
  status: {
    CONFIRMED: 'Bestätigt',
    CANCELLED: 'Abgesagt',
    COMPLETED: 'Stattgefunden',
    NO_SHOW: 'Nicht erschienen',
  },
  location: { VIDEO: 'Videocall', PHONE: 'Telefon', IN_PERSON: 'Vor Ort' },
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
  timezone: { label: 'Timezone', shown: 'All times in', change: 'Change timezone' },
  form: {
    heading: 'Just a few details',
    name: 'Name',
    email: 'Email',
    phone: 'Phone',
    phoneHint: 'In case the connection gives up.',
    company: 'Company',
    projectType: 'What is it about',
    budget: 'Budget range',
    timeline: 'Timeline',
    note: 'What would you like to talk about?',
    noteHint: 'Two sentences is plenty. The more concrete, the better the call.',
    optional: 'optional',
    submit: 'Confirm booking',
    submitting: 'Booking…',
    back: 'Pick another time',
    failed: 'The booking could not be made.',
  },
  confirmed: {
    heading: 'You are booked',
    body: 'Looking forward to it.',
    when: 'When',
    duration: 'Duration',
    reference: 'Reference',
    emailed: 'A confirmation with a calendar invite is on its way to you.',
    cancel: 'View or cancel this booking',
  },
  manage: {
    heading: 'Your booking',
    loading: 'Loading booking…',
    notFound: 'That booking does not exist, or the link is no longer valid.',
    failed: 'The booking could not be loaded right now.',
    retry: 'Try again',
    when: 'When',
    status: 'Status',
    cancelHeading: 'Cancel this booking',
    cancelBody: 'No problem. Let me know and the time goes back on the calendar.',
    cancelReason: 'Reason',
    cancelConfirm: 'Cancel booking',
    cancelling: 'Cancelling…',
    cancelled: 'This booking was cancelled.',
    alreadyPast: 'This booking is in the past.',
    rescheduleHeading: 'Move this booking',
    rescheduleBody: 'Pick a new time that works for you.',
    reschedulePick: 'Confirm new time',
    rescheduling: 'Moving booking…',
    rescheduled: 'Your booking was moved.',
    viewNewBooking: 'View new booking',
    back: 'Back to booking',
  },
  status: {
    CONFIRMED: 'Confirmed',
    CANCELLED: 'Cancelled',
    COMPLETED: 'Held',
    NO_SHOW: 'No show',
  },
  location: { VIDEO: 'Video call', PHONE: 'Phone', IN_PERSON: 'In person' },
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
  timezone: { label: 'المنطقة الزمنية', shown: 'كل الأوقات بتوقيت', change: 'تغيير المنطقة الزمنية' },
  form: {
    heading: 'بقيت بيانات قليلة',
    name: 'الاسم',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف',
    phoneHint: 'في حال تعطّل الاتصال.',
    company: 'الشركة',
    projectType: 'ما موضوع المشروع',
    budget: 'الميزانية التقريبية',
    timeline: 'الإطار الزمني',
    note: 'عن ماذا تريد أن نتحدث؟',
    noteHint: 'جملتان تكفيان. كلما كان الوصف أوضح، كانت المكالمة أفضل.',
    optional: 'اختياري',
    submit: 'تأكيد الموعد',
    submitting: 'جارٍ الحجز…',
    back: 'اختيار وقت آخر',
    failed: 'تعذّر إتمام الحجز.',
  },
  confirmed: {
    heading: 'تم تثبيت الموعد',
    body: 'أتطلع إلى الحديث معك.',
    when: 'الموعد',
    duration: 'المدة',
    reference: 'الرقم المرجعي',
    emailed: 'رسالة التأكيد مع ملف التقويم في طريقها إليك.',
    cancel: 'عرض الموعد أو إلغاؤه',
  },
  manage: {
    heading: 'موعدك',
    loading: 'جارٍ تحميل الموعد…',
    notFound: 'هذا الموعد غير موجود، أو أن الرابط لم يعد صالحاً.',
    failed: 'تعذّر تحميل الموعد الآن.',
    retry: 'حاول مرة أخرى',
    when: 'الموعد',
    status: 'الحالة',
    cancelHeading: 'إلغاء الموعد',
    cancelBody: 'لا مشكلة. أخبرني فقط، ويعود الوقت متاحاً.',
    cancelReason: 'السبب',
    cancelConfirm: 'إلغاء الموعد',
    cancelling: 'جارٍ الإلغاء…',
    cancelled: 'تم إلغاء هذا الموعد.',
    alreadyPast: 'هذا الموعد في الماضي.',
    rescheduleHeading: 'تغيير الموعد',
    rescheduleBody: 'اختر وقتاً جديداً يناسبك.',
    reschedulePick: 'تأكيد الوقت الجديد',
    rescheduling: 'جارٍ تغيير الموعد…',
    rescheduled: 'تم تغيير موعدك.',
    viewNewBooking: 'عرض الموعد الجديد',
    back: 'العودة إلى الموعد',
  },
  status: {
    CONFIRMED: 'مؤكد',
    CANCELLED: 'ملغى',
    COMPLETED: 'تم',
    NO_SHOW: 'لم يحضر',
  },
  location: { VIDEO: 'مكالمة مرئية', PHONE: 'هاتف', IN_PERSON: 'حضورياً' },
}

const COPY: Record<Language, BookingCopy> = { de, en, ar }

export const getBookingCopy = (language: Language): BookingCopy => COPY[language]

/** BCP 47 locale for `Intl`, matching what `localeFor` gives the rest of the site. */
export const LOCALES: Record<Language, string> = { de: 'de-DE', en: 'en-GB', ar: 'ar' }
