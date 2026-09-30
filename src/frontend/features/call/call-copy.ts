import type { Language } from '#/frontend/i18n/language'

/**
 * Every word the call says, in the three languages the site publishes.
 *
 * A call goes wrong in ways nothing else on this site does — a blocked
 * camera, a microphone another program is holding, a firewall that refuses to
 * let video through — and each of those needs a sentence telling the person
 * what to actually do about it, in their own language. Half of this file is
 * that.
 *
 * Kept in the feature for the reason `booking-copy.ts` is: page copy moves
 * into the database as one shape, and this would mean editing it twice.
 */

export type CallCopy = {
  lobby: {
    title: string
    subtitle: string
    camera: string
    microphone: string
    cameraOff: string
    join: string
    joining: string
    checking: string
    noCamera: string
  }
  status: {
    connecting: string
    waiting: string
    negotiating: string
    connected: string
    ended: string
    failed: string
  }
  /** `{name}` is replaced with whoever is missing. No clock, by his decision. */
  waitingFor: string
  waitingSub: string
  controls: {
    mute: string
    unmute: string
    cameraOn: string
    cameraOff: string
    share: string
    stopSharing: string
    leave: string
    chat: string
    enlarge: string
    shrink: string
    closeChat: string
  }
  chat: {
    title: string
    placeholder: string
    send: string
    empty: string
    /** Said plainly, because it is the promise D33 makes. */
    notice: string
    you: string
  }
  people: { you: string; other: string; sharing: string }
  errors: {
    denied: string
    noDevice: string
    inUse: string
    generic: string
    unreachable: string
    otherTab: string
    lost: string
    blocked: string
    incompleteLink: string
    couldNotOpen: string
  }
  /** The planned end has passed; the call is never cut off for it. `{name}` is the host. */
  overtime: { guest: string; host: string }
  /** The browser holds back sound until the person presses something once. */
  sound: { blocked: string; enable: string }
  left: string
  leave: string
  rejoin: string
  /** Shown on the booking's own page while the room is open. */
  ready: { heading: string; body: string }
}

const de: CallCopy = {
  lobby: {
    title: 'Bereit für das Gespräch?',
    subtitle: 'Prüf kurz Kamera und Mikrofon. Erst dann trittst du bei.',
    camera: 'Kamera',
    microphone: 'Mikrofon',
    cameraOff: 'Kamera aus',
    join: 'Gespräch beitreten',
    joining: 'Wird geöffnet…',
    checking: 'Kamera und Mikrofon werden geprüft…',
    noCamera: 'Kein Kamerabild',
  },
  status: {
    connecting: 'Verbindung wird aufgebaut…',
    waiting: 'Warten auf die andere Person…',
    negotiating: 'Verbinden…',
    connected: 'Verbunden',
    ended: 'Das Gespräch ist beendet.',
    failed: 'Das Gespräch konnte nicht verbunden werden.',
  },
  waitingFor: 'Warten auf {name}…',
  waitingSub: 'Du siehst dich selbst, bis die andere Seite beitritt.',
  controls: {
    mute: 'Stummschalten',
    unmute: 'Stummschaltung aufheben',
    cameraOn: 'Kamera einschalten',
    cameraOff: 'Kamera ausschalten',
    share: 'Bildschirm teilen',
    stopSharing: 'Teilen beenden',
    leave: 'Verlassen',
    chat: 'Nachrichten',
    enlarge: 'Vergrößern',
    shrink: 'Verkleinern',
    closeChat: 'Nachrichten schließen',
  },
  chat: {
    title: 'Nachrichten',
    placeholder: 'Nachricht schreiben…',
    send: 'Senden',
    empty: 'Noch keine Nachrichten.',
    notice: 'Nachrichten bleiben nur in diesem Gespräch und werden nicht gespeichert.',
    you: 'Du',
  },
  people: { you: 'Du', other: 'Die andere Person', sharing: 'teilt den Bildschirm' },
  errors: {
    denied:
      'Dein Browser blockiert Kamera und Mikrofon. Erlaube beides für diese Seite — über das Schloss in der Adresszeile — und lade neu.',
    noDevice: 'Es wurde keine Kamera und kein Mikrofon gefunden. Schließ eines an, oder nimm am Handy teil.',
    inUse: 'Ein anderes Programm benutzt die Kamera bereits. Schließ es und lade neu.',
    generic: 'Kamera und Mikrofon konnten nicht gestartet werden.',
    unreachable: 'Der Gesprächsdienst war nicht erreichbar.',
    otherTab: 'Dieses Gespräch wurde in einem anderen Tab oder Fenster geöffnet.',
    lost: 'Die Verbindung zum Gespräch ist abgebrochen.',
    blocked:
      'Das Gespräch kam nicht durch — meist liegt das an einer Firewall. Versuch ein anderes Netz, oder ein Handy im Mobilfunk.',
    incompleteLink: 'Dieser Link ist unvollständig. Öffne den Link aus deiner Bestätigungs-E-Mail.',
    couldNotOpen: 'Das Gespräch konnte nicht geöffnet werden.',
  },
  overtime: {
    guest: 'Die geplante Zeit ist vorbei. Das Gespräch bleibt offen, bis {name} es beendet.',
    host: 'Die geplante Zeit ist vorbei. Das Gespräch bleibt offen, bis du es beendest.',
  },
  sound: { blocked: 'Dein Browser hält den Ton noch zurück.', enable: 'Ton einschalten' },
  left: 'Du hast das Gespräch verlassen.',
  leave: 'Schließen',
  rejoin: 'Erneut beitreten',
  ready: {
    heading: 'Dein Gespräch ist bereit',
    body: 'Der Raum ist offen. Du brauchst nichts zu installieren — es läuft im Browser.',
  },
}

const en: CallCopy = {
  lobby: {
    title: 'Ready for the call?',
    subtitle: 'Check your camera and microphone. You join only when you press the button.',
    camera: 'Camera',
    microphone: 'Microphone',
    cameraOff: 'Camera off',
    join: 'Join the call',
    joining: 'Opening…',
    checking: 'Checking your camera and microphone…',
    noCamera: 'No camera picture',
  },
  status: {
    connecting: 'Opening the room…',
    waiting: 'Waiting for the other person…',
    negotiating: 'Connecting…',
    connected: 'Connected',
    ended: 'The call has ended.',
    failed: 'The call could not be connected.',
  },
  waitingFor: 'Waiting for {name}…',
  waitingSub: 'You are seeing yourself until the other side joins.',
  controls: {
    mute: 'Mute',
    unmute: 'Unmute',
    cameraOn: 'Turn camera on',
    cameraOff: 'Turn camera off',
    share: 'Share screen',
    stopSharing: 'Stop sharing',
    leave: 'Leave',
    chat: 'Messages',
    enlarge: 'Enlarge',
    shrink: 'Shrink',
    closeChat: 'Close messages',
  },
  chat: {
    title: 'Messages',
    placeholder: 'Write a message…',
    send: 'Send',
    empty: 'No messages yet.',
    notice: 'Messages stay inside this call and are not saved.',
    you: 'You',
  },
  people: { you: 'You', other: 'The other person', sharing: 'is sharing their screen' },
  errors: {
    denied:
      'Your browser blocked the camera and microphone. Allow them for this site — the padlock in the address bar — and reload.',
    noDevice: 'No camera or microphone was found. Plug one in, or join from a phone.',
    inUse: 'Another program is already using the camera. Close it and reload.',
    generic: 'The camera and microphone could not be started.',
    unreachable: 'The call service could not be reached.',
    otherTab: 'This call was opened in another tab or window.',
    lost: 'The connection to the call was lost.',
    blocked:
      'The call could not get through — this usually means a firewall. Try a different network, or a phone on mobile data.',
    incompleteLink: 'This link is incomplete. Open the one in your confirmation email.',
    couldNotOpen: 'The call could not be opened.',
  },
  overtime: {
    guest: 'The planned time is over. The call stays open until {name} ends it.',
    host: 'The planned time is over. The call stays open until you end it.',
  },
  sound: { blocked: 'Your browser is holding back the sound.', enable: 'Turn on sound' },
  left: 'You left the call.',
  leave: 'Close',
  rejoin: 'Join again',
  ready: {
    heading: 'Your call is ready',
    body: 'The room is open. There is nothing to install — it runs in the browser.',
  },
}

const ar: CallCopy = {
  lobby: {
    title: 'جاهز للمكالمة؟',
    subtitle: 'تحقّق من الكاميرا والميكروفون. لن تدخل إلا حين تضغط الزر.',
    camera: 'الكاميرا',
    microphone: 'الميكروفون',
    cameraOff: 'الكاميرا مغلقة',
    join: 'ادخل المكالمة',
    joining: 'جارٍ الفتح…',
    checking: 'جارٍ فحص الكاميرا والميكروفون…',
    noCamera: 'لا توجد صورة',
  },
  status: {
    connecting: 'جارٍ فتح الغرفة…',
    waiting: 'في انتظار الطرف الآخر…',
    negotiating: 'جارٍ الاتصال…',
    connected: 'متصل',
    ended: 'انتهت المكالمة.',
    failed: 'تعذّر إجراء المكالمة.',
  },
  waitingFor: 'في انتظار {name}…',
  waitingSub: 'ترى نفسك حتى يدخل الطرف الآخر.',
  controls: {
    mute: 'كتم الصوت',
    unmute: 'إلغاء الكتم',
    cameraOn: 'تشغيل الكاميرا',
    cameraOff: 'إيقاف الكاميرا',
    share: 'مشاركة الشاشة',
    stopSharing: 'إيقاف المشاركة',
    leave: 'مغادرة',
    chat: 'الرسائل',
    enlarge: 'تكبير',
    shrink: 'تصغير',
    closeChat: 'إغلاق الرسائل',
  },
  chat: {
    title: 'الرسائل',
    placeholder: 'اكتب رسالة…',
    send: 'إرسال',
    empty: 'لا رسائل بعد.',
    notice: 'الرسائل تبقى داخل هذه المكالمة ولا تُحفظ.',
    you: 'أنت',
  },
  people: { you: 'أنت', other: 'الطرف الآخر', sharing: 'يشارك شاشته' },
  errors: {
    denied:
      'متصفحك منع الكاميرا والميكروفون. اسمح بهما لهذا الموقع — من القفل في شريط العنوان — ثم أعد تحميل الصفحة.',
    noDevice: 'لم يُعثر على كاميرا أو ميكروفون. وصّل واحداً، أو ادخل من الهاتف.',
    inUse: 'برنامج آخر يستخدم الكاميرا. أغلقه ثم أعد تحميل الصفحة.',
    generic: 'تعذّر تشغيل الكاميرا والميكروفون.',
    unreachable: 'تعذّر الوصول إلى خدمة المكالمات.',
    otherTab: 'فُتحت هذه المكالمة في تبويب أو نافذة أخرى.',
    lost: 'انقطع الاتصال بالمكالمة.',
    blocked:
      'لم تنجح المكالمة في المرور — غالباً بسبب جدار حماية. جرّب شبكة أخرى، أو هاتفاً على بيانات الجوال.',
    incompleteLink: 'هذا الرابط ناقص. افتح الرابط الموجود في بريد التأكيد.',
    couldNotOpen: 'تعذّر فتح المكالمة.',
  },
  overtime: {
    guest: 'انتهى الوقت المخطط. تبقى المكالمة مفتوحة حتى ينهيها {name}.',
    host: 'انتهى الوقت المخطط. تبقى المكالمة مفتوحة حتى تنهيها أنت.',
  },
  sound: { blocked: 'متصفحك يوقف الصوت مؤقتاً.', enable: 'تشغيل الصوت' },
  left: 'غادرت المكالمة.',
  leave: 'إغلاق',
  rejoin: 'ادخل من جديد',
  ready: {
    heading: 'مكالمتك جاهزة',
    body: 'الغرفة مفتوحة. لا تحتاج تثبيت أي برنامج — تعمل داخل المتصفح.',
  },
}

export const callCopy: Record<Language, CallCopy> = { de, en, ar }
