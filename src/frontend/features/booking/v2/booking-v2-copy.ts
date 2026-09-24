import type { AppointmentStatus, BookingMethod, CancelReason } from '#/backend2/contracts/booking.contract'
import type { Language } from '#/frontend/i18n/language'

/**
 * The words the Backend2 booking pages add to `booking-copy.ts`: choosing how
 * to meet, the phone number only for a phone call, a success page per way of
 * meeting, the private page with its deadline and cancellation reasons, and
 * the video waiting room. The wording is the approved Booking Design Lab's
 * (`docs/v2/booking.md`, choices 1A–7A); everything the legacy pages already
 * say is still read from `booking-copy.ts`, so the two modes cannot drift.
 */

/** Mirrors `CANCEL_REASONS` in the contract, in its order; a test keeps them equal. */
export const CANCEL_REASON_KEYS = ['time_conflict', 'no_longer_needed', 'found_other', 'booked_by_mistake', 'other'] as const

export type BookingV2Copy = {
  how: string
  methods: Record<BookingMethod, string>
  methodNotes: Record<BookingMethod, string>
  zoneShown: string
  taken: string
  tooSoon: string
  nextFree: string
  typeMissing: string
  form: {
    phoneHint: string
    choose: string
    privacy: string
    privacyLink: string
    errName: string
    errEmail: string
    errPhone: string
    errPhoneFormat: string
    errTooLong: string
    failed: string
    rateLimited: string
    verification: string
  }
  success: {
    heading: string
    body: string
    noEmail: string
    when: string
    duration: string
    way: string
    reference: string
    roomTitle: string
    roomBody: string
    openRoom: string
    inPerson: string
    phoneCall: (phone: string) => string
    manageLink: string
    keepLink: string
    copy: string
    copied: string
    open: string
  }
  manage: {
    way: string
    deadline: (when: string) => string
    deadlinePassed: (hours: number) => string
    move: string
    cantMake: string
    cancelTitle: string
    cancelBody: string
    reasons: Record<CancelReason, string>
    reasonLegend: string
    otherLabel: string
    errReason: string
    errOther: string
    rescheduleInstead: string
    cancelConfirm: string
    cancelling: string
    keep: string
    cancelledNow: string
    moved: string
    newTime: string
    confirmMove: string
    typeGone: string
    videoTitle: string
    videoBody: string
    openRoom: string
    failed: string
  }
  status: Record<AppointmentStatus, string>
  room: {
    early: string
    startsAt: string
    countdown: string
    autoEnter: string
    checking: string
    camOk: string
    micOk: string
    camBlocked: string
    micBlocked: string
    invalid: string
    bookAgain: string
    permTitle: string
    permBody: string
    entering: string
    unavailableTitle: string
    unavailableBody: string
    ended: string
    endedBody: string
    closed: string
    closedBody: string
    cancelled: string
    notVideo: string
    toBooking: string
    emailMe: string
    callMe: string
    failed: string
    retry: string
  }
}

const en: BookingV2Copy = {
  how: 'How would you like to meet?',
  methods: { video: 'Video call', in_person: 'In person', phone: 'Phone call' },
  methodNotes: {
    video: 'Right here on the website, nothing to install.',
    in_person: 'We agree on the place by email.',
    phone: 'I call you on the number you give.',
  },
  zoneShown: 'All times in',
  taken: 'Someone took this time a moment ago. Please pick another — the list is up to date again.',
  tooSoon: 'That time can no longer be booked. Please pick another — the list is up to date again.',
  nextFree: 'Next free day',
  typeMissing: 'This kind of appointment is not offered at the moment.',
  form: {
    phoneHint: 'I will call you on this number.',
    choose: 'Choose…',
    privacy: 'I use your details only to prepare and hold this appointment.',
    privacyLink: 'Privacy policy',
    errName: 'Enter your name.',
    errEmail: 'Enter a valid email address.',
    errPhone: 'Enter a phone number for a phone call.',
    errPhoneFormat: 'Enter a valid phone number.',
    errTooLong: 'That is too long.',
    failed: 'The booking could not be made. Please try again.',
    rateLimited: 'Too many bookings from here in a short time. Please try again later or write to me.',
    verification: 'The security check did not pass. Please try again.',
  },
  success: {
    heading: 'You are booked',
    body: 'Looking forward to it. A confirmation is on its way to your inbox.',
    noEmail: 'The confirmation email could not be sent just now. Your booking is safe — save the link below.',
    when: 'When',
    duration: 'Duration',
    way: 'How',
    reference: 'Reference',
    roomTitle: 'Your video call',
    roomBody: 'Open the call from this link. You can open it early to test your camera and microphone.',
    openRoom: 'Open the call page',
    inPerson: 'We agree on the meeting place by email. Just reply to the confirmation.',
    phoneCall: (phone) => `I will call you at the scheduled time on ${phone}.`,
    manageLink: 'Your private link to change or cancel',
    keepLink: 'Keep this link private. It is also in your email.',
    copy: 'Copy',
    copied: 'Copied',
    open: 'Open',
  },
  manage: {
    way: 'How',
    deadline: (when) => `You can change or cancel online until ${when}.`,
    deadlinePassed: (hours) =>
      `This appointment starts in less than ${hours} hours, so it can no longer be changed here. Just reply to your confirmation email.`,
    move: 'Move to another time',
    cantMake: 'I cannot make it',
    cancelTitle: 'Cancel this booking',
    cancelBody: 'No problem. Let me know why, and the time goes back on the calendar.',
    reasons: {
      time_conflict: 'The time no longer works for me',
      no_longer_needed: 'I no longer need the appointment',
      found_other: 'I found another solution',
      booked_by_mistake: 'I booked by mistake',
      other: 'Other',
    },
    reasonLegend: 'Why are you cancelling?',
    otherLabel: 'Tell me briefly why',
    errReason: 'Choose a reason.',
    errOther: 'Tell me briefly why.',
    rescheduleInstead: 'You do not have to cancel — you can move it instead.',
    cancelConfirm: 'Cancel booking',
    cancelling: 'Cancelling…',
    keep: 'Keep the booking',
    cancelledNow: 'Your booking is cancelled. A confirmation is in your inbox.',
    moved: 'Your booking was moved. The new time is in your inbox.',
    newTime: 'Pick a new time',
    confirmMove: 'Confirm new time',
    typeGone: 'This kind of appointment is not offered online at the moment. Reply to your confirmation email and we will find a new time.',
    videoTitle: 'Your video call',
    videoBody: 'Open the call page from here. You can open it early to test your camera and microphone.',
    openRoom: 'Open the call page',
    failed: 'That did not work. Please try again.',
  },
  status: { confirmed: 'Confirmed', completed: 'Held', cancelled: 'Cancelled', no_show: 'No show' },
  room: {
    early: 'You are early',
    startsAt: 'Your call starts at',
    countdown: 'Starts in',
    autoEnter: 'The call opens by itself at the start. You can test your camera and microphone meanwhile.',
    checking: 'Checking your camera and microphone…',
    camOk: 'Camera works',
    micOk: 'Microphone works',
    camBlocked: 'Camera',
    micBlocked: 'Microphone',
    invalid: 'This link is not valid.',
    bookAgain: 'Book a new time',
    permTitle: 'Your camera or microphone is blocked',
    permBody:
      'Allow access in your browser settings and reload. If it still does not work, reply to your confirmation email or call me — we will find another way.',
    entering: 'Entering the call…',
    unavailableTitle: 'The video call cannot open on this website yet',
    unavailableBody:
      'The video service for these calls is not switched on yet. Your appointment is still on — reply to your confirmation email or get in touch below, and we will hold it another way.',
    ended: 'The call has ended',
    endedBody: 'Thank you for your time. You can reply to the confirmation email at any time.',
    closed: 'This call is over',
    closedBody: 'The time for this call has passed. You can reply to the confirmation email at any time.',
    cancelled: 'This appointment was cancelled.',
    notVideo: 'This appointment is not a video call. Its details are on your booking page.',
    toBooking: 'Open your booking',
    emailMe: 'Write an email',
    callMe: 'Call',
    failed: 'The call page could not be loaded right now.',
    retry: 'Try again',
  },
}

const de: BookingV2Copy = {
  how: 'Wie möchtest du dich treffen?',
  methods: { video: 'Videocall', in_person: 'Persönlich', phone: 'Telefonat' },
  methodNotes: {
    video: 'Direkt hier auf der Website, nichts zu installieren.',
    in_person: 'Den Ort stimmen wir per E-Mail ab.',
    phone: 'Ich rufe dich unter deiner Nummer an.',
  },
  zoneShown: 'Alle Zeiten in',
  taken: 'Diese Zeit wurde gerade vergeben. Bitte wähle eine andere — die Liste ist wieder aktuell.',
  tooSoon: 'Diese Zeit kann nicht mehr gebucht werden. Bitte wähle eine andere — die Liste ist wieder aktuell.',
  nextFree: 'Nächster freier Tag',
  typeMissing: 'Diese Art Termin wird gerade nicht angeboten.',
  form: {
    phoneHint: 'Unter dieser Nummer rufe ich dich an.',
    choose: 'Bitte wählen…',
    privacy: 'Ich nutze deine Angaben nur, um diesen Termin vorzubereiten und durchzuführen.',
    privacyLink: 'Datenschutzerklärung',
    errName: 'Gib deinen Namen ein.',
    errEmail: 'Gib eine gültige E-Mail-Adresse ein.',
    errPhone: 'Für ein Telefonat brauche ich deine Nummer.',
    errPhoneFormat: 'Gib eine gültige Telefonnummer ein.',
    errTooLong: 'Das ist zu lang.',
    failed: 'Der Termin konnte nicht gebucht werden. Bitte versuch es noch einmal.',
    rateLimited: 'Zu viele Buchungen in kurzer Zeit. Bitte versuch es später noch einmal oder schreib mir.',
    verification: 'Die Sicherheitsprüfung hat nicht geklappt. Bitte versuch es noch einmal.',
  },
  success: {
    heading: 'Du bist gebucht',
    body: 'Ich freue mich darauf. Eine Bestätigung ist auf dem Weg in dein Postfach.',
    noEmail: 'Die Bestätigung konnte gerade nicht verschickt werden. Deine Buchung ist sicher — speichere den Link unten.',
    when: 'Wann',
    duration: 'Dauer',
    way: 'Art',
    reference: 'Referenz',
    roomTitle: 'Dein Videocall',
    roomBody: 'Öffne das Gespräch über diesen Link. Du kannst ihn vorher öffnen, um Kamera und Mikrofon zu testen.',
    openRoom: 'Gesprächsseite öffnen',
    inPerson: 'Den Treffpunkt stimmen wir per E-Mail ab. Antworte einfach auf die Bestätigung.',
    phoneCall: (phone) => `Ich rufe dich zur vereinbarten Zeit unter ${phone} an.`,
    manageLink: 'Dein privater Link zum Ändern oder Absagen',
    keepLink: 'Behalte diesen Link für dich. Er steht auch in deiner E-Mail.',
    copy: 'Kopieren',
    copied: 'Kopiert',
    open: 'Öffnen',
  },
  manage: {
    way: 'Art',
    deadline: (when) => `Online ändern oder absagen kannst du bis ${when}.`,
    deadlinePassed: (hours) =>
      `Der Termin beginnt in weniger als ${hours} Stunden und kann hier nicht mehr geändert werden. Antworte einfach auf deine Bestätigungs-E-Mail.`,
    move: 'Auf eine andere Zeit verschieben',
    cantMake: 'Ich kann nicht',
    cancelTitle: 'Termin absagen',
    cancelBody: 'Kein Problem. Sag mir kurz, warum — dann ist die Zeit wieder frei.',
    reasons: {
      time_conflict: 'Die Zeit passt mir nicht mehr',
      no_longer_needed: 'Ich brauche den Termin nicht mehr',
      found_other: 'Ich habe eine andere Lösung gefunden',
      booked_by_mistake: 'Ich habe mich verbucht',
      other: 'Anderes',
    },
    reasonLegend: 'Warum sagst du ab?',
    otherLabel: 'Sag mir kurz, warum',
    errReason: 'Wähle einen Grund.',
    errOther: 'Sag mir kurz, warum.',
    rescheduleInstead: 'Du musst nicht absagen — du kannst den Termin auch verschieben.',
    cancelConfirm: 'Termin absagen',
    cancelling: 'Wird abgesagt…',
    keep: 'Termin behalten',
    cancelledNow: 'Dein Termin ist abgesagt. Eine Bestätigung ist in deinem Postfach.',
    moved: 'Dein Termin wurde verschoben. Die neue Zeit ist in deinem Postfach.',
    newTime: 'Neue Zeit wählen',
    confirmMove: 'Neue Zeit bestätigen',
    typeGone: 'Diese Art Termin wird gerade nicht online angeboten. Antworte auf deine Bestätigung, dann finden wir eine neue Zeit.',
    videoTitle: 'Dein Videocall',
    videoBody: 'Öffne die Gesprächsseite von hier. Du kannst sie vorher öffnen, um Kamera und Mikrofon zu testen.',
    openRoom: 'Gesprächsseite öffnen',
    failed: 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
  },
  status: { confirmed: 'Bestätigt', completed: 'Stattgefunden', cancelled: 'Abgesagt', no_show: 'Nicht erschienen' },
  room: {
    early: 'Du bist früh dran',
    startsAt: 'Dein Gespräch beginnt um',
    countdown: 'Beginnt in',
    autoEnter: 'Zum Start öffnet sich das Gespräch von selbst. Bis dahin kannst du Kamera und Mikrofon testen.',
    checking: 'Kamera und Mikrofon werden geprüft…',
    camOk: 'Kamera funktioniert',
    micOk: 'Mikrofon funktioniert',
    camBlocked: 'Kamera',
    micBlocked: 'Mikrofon',
    invalid: 'Dieser Link ist nicht gültig.',
    bookAgain: 'Neuen Termin buchen',
    permTitle: 'Kamera oder Mikrofon sind blockiert',
    permBody:
      'Erlaube den Zugriff in den Browser-Einstellungen und lade neu. Wenn es dann nicht klappt, antworte auf deine Bestätigung oder ruf mich an — wir finden einen anderen Weg.',
    entering: 'Gespräch wird geöffnet…',
    unavailableTitle: 'Der Videocall kann auf dieser Website noch nicht starten',
    unavailableBody:
      'Der Videodienst für diese Gespräche ist noch nicht eingeschaltet. Dein Termin bleibt bestehen — antworte auf deine Bestätigung oder melde dich unten, dann führen wir ihn auf anderem Weg.',
    ended: 'Das Gespräch ist beendet',
    endedBody: 'Danke für deine Zeit. Du kannst jederzeit auf die Bestätigung antworten.',
    closed: 'Dieses Gespräch ist vorbei',
    closedBody: 'Die Zeit für dieses Gespräch ist vorbei. Du kannst jederzeit auf die Bestätigung antworten.',
    cancelled: 'Dieser Termin wurde abgesagt.',
    notVideo: 'Dieser Termin ist kein Videocall. Die Details stehen auf deiner Terminseite.',
    toBooking: 'Termin öffnen',
    emailMe: 'E-Mail schreiben',
    callMe: 'Anrufen',
    failed: 'Die Gesprächsseite konnte gerade nicht geladen werden.',
    retry: 'Nochmal versuchen',
  },
}

const ar: BookingV2Copy = {
  how: 'كيف تفضّل أن نلتقي؟',
  methods: { video: 'مكالمة فيديو', in_person: 'لقاء شخصي', phone: 'مكالمة هاتفية' },
  methodNotes: {
    video: 'هنا على الموقع مباشرة، دون تثبيت أي شيء.',
    in_person: 'نتفق على المكان عبر البريد الإلكتروني.',
    phone: 'أتصل بك على الرقم الذي تكتبه.',
  },
  zoneShown: 'كل الأوقات بتوقيت',
  taken: 'حجز أحدهم هذا الوقت للتو. اختر وقتاً آخر من فضلك — القائمة محدّثة الآن.',
  tooSoon: 'لم يعد حجز هذا الوقت ممكناً. اختر وقتاً آخر من فضلك — القائمة محدّثة الآن.',
  nextFree: 'أقرب يوم متاح',
  typeMissing: 'هذا النوع من المواعيد غير متاح حالياً.',
  form: {
    phoneHint: 'سأتصل بك على هذا الرقم.',
    choose: 'اختر…',
    privacy: 'أستخدم بياناتك فقط لتحضير هذا الموعد وإجرائه.',
    privacyLink: 'سياسة الخصوصية',
    errName: 'اكتب اسمك.',
    errEmail: 'اكتب بريداً إلكترونياً صحيحاً.',
    errPhone: 'أحتاج رقم هاتفك للمكالمة الهاتفية.',
    errPhoneFormat: 'اكتب رقم هاتف صحيحاً.',
    errTooLong: 'النص طويل جداً.',
    failed: 'تعذّر إتمام الحجز. حاول مرة أخرى من فضلك.',
    rateLimited: 'حجوزات كثيرة في وقت قصير. حاول لاحقاً أو راسلني مباشرة.',
    verification: 'لم ينجح فحص الأمان. حاول مرة أخرى من فضلك.',
  },
  success: {
    heading: 'تم حجز موعدك',
    body: 'أتطلع إلى الحديث معك. تأكيد الحجز في طريقه إلى بريدك.',
    noEmail: 'تعذّر إرسال رسالة التأكيد الآن. حجزك محفوظ — احفظ الرابط أدناه.',
    when: 'الموعد',
    duration: 'المدة',
    way: 'الطريقة',
    reference: 'الرقم المرجعي',
    roomTitle: 'مكالمة الفيديو',
    roomBody: 'افتح المكالمة من هذا الرابط. يمكنك فتحه مبكراً لتجربة الكاميرا والميكروفون.',
    openRoom: 'افتح صفحة المكالمة',
    inPerson: 'نتفق على مكان اللقاء عبر البريد الإلكتروني. فقط رُدّ على رسالة التأكيد.',
    phoneCall: (phone) => `سأتصل بك في الموعد على الرقم ${phone}.`,
    manageLink: 'رابطك الخاص لتغيير الموعد أو إلغائه',
    keepLink: 'احتفظ بهذا الرابط لنفسك. ستجده أيضاً في بريدك.',
    copy: 'نسخ',
    copied: 'تم النسخ',
    open: 'فتح',
  },
  manage: {
    way: 'الطريقة',
    deadline: (when) => `يمكنك التغيير أو الإلغاء عبر الإنترنت حتى ${when}.`,
    deadlinePassed: (hours) =>
      `يبدأ الموعد بعد أقل من ${hours} ساعة، لذا لم يعد تغييره ممكناً هنا. فقط رُدّ على رسالة التأكيد.`,
    move: 'نقل الموعد إلى وقت آخر',
    cantMake: 'لا أستطيع الحضور',
    cancelTitle: 'إلغاء الحجز',
    cancelBody: 'لا مشكلة. أخبرني بالسبب، ويعود الوقت متاحاً.',
    reasons: {
      time_conflict: 'الوقت لم يعد يناسبني',
      no_longer_needed: 'لم أعد بحاجة إلى الموعد',
      found_other: 'وجدت حلاً آخر',
      booked_by_mistake: 'حجزت بالخطأ',
      other: 'سبب آخر',
    },
    reasonLegend: 'لماذا تلغي الموعد؟',
    otherLabel: 'أخبرني باختصار عن السبب',
    errReason: 'اختر سبباً.',
    errOther: 'أخبرني باختصار عن السبب.',
    rescheduleInstead: 'لا داعي للإلغاء — يمكنك نقل الموعد بدلاً من ذلك.',
    cancelConfirm: 'إلغاء الحجز',
    cancelling: 'جارٍ الإلغاء…',
    keep: 'الإبقاء على الحجز',
    cancelledNow: 'تم إلغاء حجزك. ستجد التأكيد في بريدك.',
    moved: 'تم نقل موعدك. الوقت الجديد في بريدك.',
    newTime: 'اختر وقتاً جديداً',
    confirmMove: 'تأكيد الوقت الجديد',
    typeGone: 'هذا النوع من المواعيد غير متاح عبر الإنترنت حالياً. رُدّ على رسالة التأكيد وسنجد وقتاً جديداً.',
    videoTitle: 'مكالمة الفيديو',
    videoBody: 'افتح صفحة المكالمة من هنا. يمكنك فتحها مبكراً لتجربة الكاميرا والميكروفون.',
    openRoom: 'افتح صفحة المكالمة',
    failed: 'لم ينجح ذلك. حاول مرة أخرى من فضلك.',
  },
  status: { confirmed: 'مؤكّد', completed: 'تم', cancelled: 'ملغى', no_show: 'لم يحضر' },
  room: {
    early: 'وصلت مبكراً',
    startsAt: 'تبدأ مكالمتك الساعة',
    countdown: 'تبدأ بعد',
    autoEnter: 'تُفتح المكالمة تلقائياً عند بدايتها. يمكنك تجربة الكاميرا والميكروفون حتى ذلك الحين.',
    checking: 'جارٍ فحص الكاميرا والميكروفون…',
    camOk: 'الكاميرا تعمل',
    micOk: 'الميكروفون يعمل',
    camBlocked: 'الكاميرا',
    micBlocked: 'الميكروفون',
    invalid: 'هذا الرابط غير صالح.',
    bookAgain: 'احجز وقتاً جديداً',
    permTitle: 'الكاميرا أو الميكروفون محظوران',
    permBody:
      'اسمح بالوصول من إعدادات المتصفح ثم أعد تحميل الصفحة. وإن لم ينجح ذلك، رُدّ على رسالة التأكيد أو اتصل بي — سنجد طريقة أخرى.',
    entering: 'جارٍ فتح المكالمة…',
    unavailableTitle: 'لا يمكن فتح مكالمة الفيديو على هذا الموقع بعد',
    unavailableBody:
      'خدمة الفيديو لهذه المكالمات لم تُفعَّل بعد. موعدك ما زال قائماً — رُدّ على رسالة التأكيد أو تواصل معي أدناه، وسنجريه بطريقة أخرى.',
    ended: 'انتهت المكالمة',
    endedBody: 'شكراً على وقتك. يمكنك الرد على رسالة التأكيد في أي وقت.',
    closed: 'انتهى وقت هذه المكالمة',
    closedBody: 'مضى وقت هذه المكالمة. يمكنك الرد على رسالة التأكيد في أي وقت.',
    cancelled: 'تم إلغاء هذا الموعد.',
    notVideo: 'هذا الموعد ليس مكالمة فيديو. تفاصيله في صفحة حجزك.',
    toBooking: 'افتح حجزك',
    emailMe: 'أرسل بريداً',
    callMe: 'اتصل',
    failed: 'تعذّر تحميل صفحة المكالمة الآن.',
    retry: 'حاول مرة أخرى',
  },
}

const COPY: Record<Language, BookingV2Copy> = { de, en, ar }

export const getBookingV2Copy = (language: Language): BookingV2Copy => COPY[language]
