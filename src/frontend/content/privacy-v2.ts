import type { Language } from '#/frontend/i18n/language'
import type { LegalCopy } from './types'

/**
 * The privacy page once V2 serves the public site (`docs/v2/privacy-v2.md`,
 * approved by the owner on 24 Sep 2026).
 *
 * Applied on top of the current copy — after any owner edits — on every
 * render since the cutover (24 Sep 2026), so the page describes what the site
 * actually does. The existing sections keep
 * their place; the contact and cookie sections are replaced, and the new ones
 * (where data is stored, booking, the assistant, comments) are inserted where
 * a reader looks for them.
 */

type Section = LegalCopy['sections'][number]

type V2Words = {
  storage: Section
  contact: Section
  booking: Section
  assistant: Section
  comments: Section
  cookies: Section
  /** Shown only while Cloudflare Web Analytics is switched on (`CF_WEB_ANALYTICS_TOKEN`). */
  webAnalytics: Section
  /**
   * While the statistics run, the page's opening and "what does not happen"
   * may no longer say there are none (owner decision, 24 Sep 2026).
   */
  withStatistics: { intro: string; notHappening: string }
  updated: string
}

const WORDS: Record<Language, V2Words> = {
  de: {
    storage: {
      title: 'Speicherort',
      body: 'Anfragen, Buchungen, Kommentare und Gespräche mit dem Website-Assistenten speichere ich in einer Datenbank des Anbieters Neon (Rechenzentrum Frankfurt am Main, EU). Dateien, die du mir schickst, liegen verschlüsselt im Speicher Cloudflare R2. Beide Anbieter verarbeiten die Daten nur in meinem Auftrag.',
    },
    contact: {
      title: 'Kontaktformular und E-Mail',
      body: 'Wenn du das Kontaktformular nutzt, werden Name, E-Mail-Adresse, optional Firma und Telefonnummer, dein Text sowie optional eine Datei (PDF, Bild, Video oder Word/Excel/PowerPoint, bis 10 MB) verarbeitet. Deine Nachricht landet in meinem eigenen Postfachsystem, wo nur ich sie lese und beantworte; E-Mails versende ich über den Dienst Resend. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO für die Anbahnung eines Vertrags, sonst Art. 6 Abs. 1 lit. f DSGVO. Ich lösche deine Anfrage, wenn sie nicht mehr gebraucht wird und keine gesetzliche Aufbewahrungspflicht besteht, oder früher auf deinen Wunsch.',
    },
    booking: {
      title: 'Terminbuchung und Videogespräche',
      body: 'Wenn du einen Termin buchst, speichere ich Name, E-Mail-Adresse, bei einem Telefonat deine Telefonnummer, optional Firma, Thema, Budgetrahmen und Notiz, die gewählte Zeit, Gesprächsart und deine Zeitzone. Du bekommst eine Bestätigung und eine Erinnerung per E-Mail (über Resend) mit einem privaten Link, über den du den Termin ändern oder absagen kannst. Videogespräche laufen direkt auf dieser Website über Cloudflare Realtime; sie werden nicht aufgezeichnet, und der Chat im Gespräch wird nicht gespeichert. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.',
    },
    assistant: {
      title: 'Website-Assistent',
      body: 'Der Assistent beantwortet Fragen automatisch und nur mit dem, was auf dieser Website veröffentlicht ist; es wird dafür kein externer KI-Dienst genutzt. Deine Fragen und die Antworten werden gespeichert, und ich lese sie, um die Website zu verbessern. Deine IP-Adresse wird dabei nicht gespeichert; zum Schutz vor Missbrauch wird nur kurzzeitig ein nicht rückrechenbarer Schlüssel daraus gebildet. Bitte gib im Chat keine persönlichen Daten ein. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: mein berechtigtes Interesse, Fragen schnell zu beantworten und die Website zu verbessern. Du kannst jederzeit verlangen, dass ich dein Gespräch lösche.',
    },
    comments: {
      title: 'Kommentare und „Gefällt mir" im Blog',
      body: 'Wenn du einen Kommentar schreibst, werden der angegebene Name, dein Text und der Zeitpunkt gespeichert und sofort unter dem Artikel veröffentlicht. Zum Schutz vor Missbrauch wird kurzzeitig ein nicht rückrechenbarer Schlüssel aus deiner IP-Adresse gebildet. „Gefällt mir" wird anonym gezählt; dein Browser merkt sich lokal, welche Artikel du markiert hast. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Auf Wunsch lösche ich deinen Kommentar.',
    },
    cookies: {
      title: 'Cookies und Speicher im Browser',
      body: 'Die öffentliche Website setzt nur technisch notwendige Einstellungen, etwa für Sprache und Farbschema. Zusätzlich speichert dein Browser lokal, für diesen Tab, die Kennung deines Gesprächs mit dem Assistenten und, dauerhaft, welche Artikel du mit „Gefällt mir" markiert hast. Im nicht öffentlichen Verwaltungsbereich werden notwendige Sitzungs-Cookies für die Anmeldung verwendet. Nichts davon dient Werbung oder seitenübergreifendem Tracking. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG sowie Art. 6 Abs. 1 lit. f DSGVO.',
    },
    withStatistics: {
      intro:
        'Diese Website erhebt so wenig wie möglich. Es gibt eine cookielose Besuchsstatistik (Cloudflare Web Analytics, unten beschrieben), aber keine Werbenetzwerke und kein Tracking über Seiten hinweg. Was tatsächlich verarbeitet wird, steht hier vollständig. Diese Fassung ist ein technischer Entwurf und keine Rechtsberatung oder rechtliche Garantie.',
      notHappening:
        'Außer der oben beschriebenen cookielosen Besuchsstatistik gibt es keine Webanalyse, keine Werbe- oder Retargeting-Pixel, keine eingebetteten Schriften von fremden Servern und keine Social-Media-Plugins. Es werden keine Profile gebildet und es findet keine automatisierte Entscheidungsfindung statt.',
    },
    webAnalytics: {
      title: 'Website-Statistik (Cloudflare Web Analytics)',
      body: 'Um zu verstehen, wie die öffentlichen Seiten genutzt werden, verwende ich Cloudflare Web Analytics. Es setzt keine Cookies und speichert nichts in deinem Browser. Gezählt werden Seitenaufrufe und Besuche, welche Seite du aufrufst, von welcher Website du kommst, ungefähres Land, Browser, Gerätetyp und Ladezeiten. Cloudflare erhält dafür deine IP-Adresse technisch bedingt, nutzt sie aber nicht, um dich wiederzuerkennen oder über Websites hinweg zu verfolgen. Im nicht öffentlichen Verwaltungsbereich läuft es nie. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO: mein berechtigtes Interesse, die Website zu verbessern.',
    },
    updated: 'Stand: 24. September 2026',
  },
  en: {
    storage: {
      title: 'Where data is stored',
      body: 'Enquiries, bookings, comments and conversations with the website assistant are stored in a database run by Neon (data centre in Frankfurt, EU). Files you send me are stored encrypted in Cloudflare R2. Both providers process the data only on my behalf.',
    },
    contact: {
      title: 'Contact form and email',
      body: 'When you use the contact form, your name, email address, optionally company and phone number, your message and optionally one file (PDF, image, video or Word/Excel/PowerPoint, up to 10 MB) are processed. Your message arrives in my own mailbox system, where only I read and answer it; I send emails through Resend. Legal basis: Art. 6(1)(b) GDPR for steps before a contract, otherwise Art. 6(1)(f) GDPR. I delete your enquiry when it is no longer needed and no legal retention duty applies, or earlier if you ask.',
    },
    booking: {
      title: 'Booking and video calls',
      body: 'When you book, I store your name, email address, your phone number for a phone call, optionally company, topic, budget range and note, the chosen time, the way of meeting and your time zone. You receive a confirmation and a reminder by email (via Resend) with a private link to change or cancel. Video calls run on this website through Cloudflare Realtime; they are not recorded and the in-call chat is not stored. Legal basis: Art. 6(1)(b) GDPR.',
    },
    assistant: {
      title: 'Website assistant',
      body: 'The assistant answers automatically and only from what is published on this website; no external AI service is used. Your questions and its answers are saved, and I read them to improve the website. Your IP address is not stored; to prevent abuse, a one-way key derived from it is kept briefly. Please do not enter personal information in the chat. Legal basis: Art. 6(1)(f) GDPR, my legitimate interest in answering questions quickly and improving the website. You can ask me to delete your conversation at any time.',
    },
    comments: {
      title: 'Blog comments and likes',
      body: 'When you comment, the name you give, your text and the time are stored and published under the article at once. To prevent abuse, a one-way key derived from your IP address is kept briefly. Likes are counted anonymously; your browser remembers locally which articles you liked. Legal basis: Art. 6(1)(f) GDPR. I delete your comment on request.',
    },
    cookies: {
      title: 'Cookies and browser storage',
      body: 'The public website stores only technically necessary settings such as language and colour scheme. Your browser also keeps, for this tab, the handle of your conversation with the assistant, and permanently which articles you liked. The non-public admin area uses necessary session cookies for signing in. None of this is used for advertising or cross-site tracking. Legal basis: § 25(2) no. 2 TDDDG and Art. 6(1)(f) GDPR.',
    },
    withStatistics: {
      intro:
        'This site collects as little as it can. There is a cookieless visit count (Cloudflare Web Analytics, described below), but no advertising networks and no cross-site tracking. What is actually processed is listed here in full. The German version is the binding one. This version is a technical draft, not legal advice or a legal guarantee.',
      notHappening:
        'Apart from the cookieless visit count described above, there is no web analytics, no advertising or retargeting pixels, no fonts embedded from third-party servers, and no social media plugins. No profiles are built and no automated decision-making takes place.',
    },
    webAnalytics: {
      title: 'Website statistics (Cloudflare Web Analytics)',
      body: 'To understand how the public pages are used, I use Cloudflare Web Analytics. It sets no cookies and stores nothing in your browser. It counts page views and visits, which page you open, which website you came from, your approximate country, browser, device type and page load times. Cloudflare receives your IP address because that is how the connection works, but does not use it to recognise you or follow you across websites. It never runs in the non-public admin area. Legal basis: Art. 6(1)(f) GDPR, my legitimate interest in improving the website.',
    },
    updated: 'Last updated: 24 September 2026',
  },
  ar: {
    storage: {
      title: 'مكان حفظ البيانات',
      body: 'أحفظ الطلبات والحجوزات والتعليقات والمحادثات مع مساعد الموقع في قاعدة بيانات لدى شركة Neon (مركز بيانات في فرانكفورت، داخل الاتحاد الأوروبي). والملفات التي ترسلها لي تُحفظ مشفّرة في خدمة Cloudflare R2. تعالج الشركتان البيانات نيابةً عني فقط.',
    },
    contact: {
      title: 'نموذج التواصل والبريد',
      body: 'عند استخدام نموذج التواصل تُعالَج بيانات الاسم والبريد الإلكتروني، واختيارياً الشركة ورقم الهاتف، ونص رسالتك، واختيارياً ملف واحد (PDF أو صورة أو فيديو أو Word/Excel/PowerPoint حتى 10 ميغابايت). تصل رسالتك إلى نظام البريد الخاص بي، حيث أقرؤها وأرد عليها بنفسي، وأرسل الرسائل عبر خدمة Resend. الأساس القانوني: المادة 6 (1) (ب) من اللائحة العامة لحماية البيانات للتمهيد لعقد، وإلا المادة 6 (1) (و). أحذف طلبك عندما لا يعود ضرورياً ولا يوجد التزام قانوني بحفظه، أو قبل ذلك إن طلبت.',
    },
    booking: {
      title: 'حجز المواعيد ومكالمات الفيديو',
      body: 'عند الحجز أحفظ الاسم والبريد الإلكتروني، ورقم الهاتف في حال المكالمة الهاتفية، واختيارياً الشركة والموضوع ونطاق الميزانية والملاحظة، إضافة إلى الوقت المختار وطريقة اللقاء ومنطقتك الزمنية. يصلك تأكيد وتذكير بالبريد (عبر Resend) مع رابط خاص لتغيير الموعد أو إلغائه. تجري مكالمات الفيديو على هذا الموقع مباشرة عبر Cloudflare Realtime، ولا تُسجَّل، ولا تُحفظ الدردشة أثناء المكالمة. الأساس القانوني: المادة 6 (1) (ب).',
    },
    assistant: {
      title: 'مساعد الموقع',
      body: 'يجيب المساعد تلقائياً وفقط مما هو منشور على هذا الموقع، دون استخدام أي خدمة ذكاء اصطناعي خارجية. تُحفظ أسئلتك والأجوبة، وأقرؤها لتحسين الموقع. لا يُحفظ عنوان IP الخاص بك، وللحماية من الإساءة يُحتفظ لفترة قصيرة بمفتاح لا يمكن إرجاعه إلى العنوان. يُرجى عدم كتابة معلومات شخصية في المحادثة. الأساس القانوني: المادة 6 (1) (و)، أي مصلحتي المشروعة في الإجابة السريعة وتحسين الموقع. يمكنك أن تطلب حذف محادثتك في أي وقت.',
    },
    comments: {
      title: 'التعليقات والإعجابات في المدونة',
      body: 'عند كتابة تعليق يُحفظ الاسم الذي تكتبه ونص التعليق ووقته، ويُنشر تحت المقال فوراً. وللحماية من الإساءة يُحتفظ لفترة قصيرة بمفتاح لا يمكن إرجاعه إلى عنوان IP. تُعدّ الإعجابات دون معرفة هويتك، ويتذكر متصفحك محلياً المقالات التي أعجبتك. الأساس القانوني: المادة 6 (1) (و). أحذف تعليقك إن طلبت.',
    },
    cookies: {
      title: 'ملفات الارتباط والتخزين في المتصفح',
      body: 'يحفظ الموقع العام الإعدادات الضرورية تقنياً فقط، مثل اللغة ونمط الألوان. ويحفظ متصفحك أيضاً، لهذا التبويب فقط، رمز محادثتك مع المساعد، وبشكل دائم المقالات التي أعجبتك. وتُستخدم في منطقة الإدارة غير العامة ملفات ارتباط ضرورية لتسجيل الدخول. لا يُستخدم شيء من ذلك للإعلانات أو للتتبع بين المواقع. الأساس القانوني: الفقرة 25 (2) رقم 2 من قانون TDDDG والمادة 6 (1) (و).',
    },
    withStatistics: {
      intro:
        'يجمع هذا الموقع أقل ما يمكن. توجد إحصاءات زيارات بلا ملفات ارتباط (Cloudflare Web Analytics، موصوفة أدناه)، لكن لا شبكات إعلانية ولا تتبّع عبر المواقع. وما يُعالَج فعلاً مذكور هنا كاملاً. والنسخة الألمانية هي الملزِمة. هذه الصياغة مسودة تقنية وليست استشارة قانونية أو ضماناً قانونياً.',
      notHappening:
        'باستثناء إحصاءات الزيارات بلا ملفات ارتباط الموصوفة أعلاه، لا تحليلات ويب أخرى، ولا بكسلات إعلانية أو إعادة استهداف، ولا خطوط مضمّنة من خوادم خارجية، ولا إضافات تواصل اجتماعي. ولا تُبنى أي ملفات تعريف، ولا يجري أي اتخاذ قرار آلي.',
    },
    webAnalytics: {
      title: 'إحصاءات الموقع (Cloudflare Web Analytics)',
      body: 'لأفهم كيف تُستخدم الصفحات العامة، أستخدم خدمة Cloudflare Web Analytics. لا تضع أي ملفات ارتباط (Cookies) ولا تحفظ شيئاً في متصفحك. تَعُدّ مرات فتح الصفحات والزيارات، وأي صفحة تفتحها، ومن أي موقع جئت، وبلدك التقريبي، ونوع المتصفح والجهاز، وسرعة تحميل الصفحة. تصل عنوانَ IP الخاص بك إلى Cloudflare لأن الاتصال يتطلب ذلك، لكنها لا تستخدمه للتعرّف عليك أو لتتبعك بين المواقع. ولا تعمل أبداً في منطقة الإدارة غير العامة. الأساس القانوني: المادة 6 (1) (و)، أي مصلحتي المشروعة في تحسين الموقع.',
    },
    updated: 'آخر تحديث: 24 سبتمبر 2026',
  },
}

/**
 * Today's sections, by position: controller, hosting, Turnstile, contact,
 * cookies, what does not happen, rights, authority, changes. The V2 page keeps
 * that order, replaces contact and cookies, and slots the new ones in.
 */
const AFTER_COOKIES = 5

export const applyPrivacyV2 = (
  copy: LegalCopy,
  language: Language,
  options: { webAnalytics?: boolean } = {},
): LegalCopy => {
  const words = WORDS[language]
  const sections = copy.sections

  if (sections.length < 9) return copy

  const stats = options.webAnalytics ? words.withStatistics : null
  // Today's "what does not happen", reworded while the statistics run.
  const notHappening = stats ? { ...sections[AFTER_COOKIES]!, body: stats.notHappening } : sections[AFTER_COOKIES]!

  return {
    ...copy,
    ...(stats ? { intro: stats.intro } : {}),
    sections: [
      sections[0]!,
      words.storage,
      sections[1]!,
      sections[2]!,
      words.contact,
      words.booking,
      words.assistant,
      words.comments,
      words.cookies,
      // Only while the public site really carries the beacon.
      ...(options.webAnalytics ? [words.webAnalytics] : []),
      notHappening,
      ...sections.slice(AFTER_COOKIES + 1),
    ],
    updated: words.updated,
  }
}

