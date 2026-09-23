import type { AssistantLanguage } from '../../contracts/assistant.contract'

/**
 * Which language the visitor wrote in.
 *
 * `docs/v2/ai-assistant.md`: "It responds in the language the visitor uses:
 * German, English, or Arabic, even when that differs from the page language."
 *
 * Deliberately small and explainable rather than a statistical detector:
 *
 *  1. Any Arabic letter → Arabic. A visitor who types Arabic script is not
 *     asking for a German answer.
 *  2. Otherwise count German and English marker words (and ä/ö/ü/ß, which
 *     only German uses here). The larger count wins.
 *  3. A tie, or no marker at all ("WordPress?"), falls to the page's language
 *     when the widget sent one, and to English when it did not.
 */

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u

const GERMAN_LETTERS = /[äöüß]/u

const GERMAN_MARKERS = new Set(
  (
    'ich du sie wir ihr und oder nicht kein keine ist sind bin bist war waren wird werden ' +
    'kann koennen können muss müssen soll möchte moechte würde wuerde habe hast hat haben ' +
    'der die das den dem des ein eine einen einem einer eines mit für fuer auf aus bei nach ' +
    'von zu zum zur im am vom was wie wer wo wann warum wieso welche welcher welches wieviel ' +
    'viel kostet kosten preis preise angebot termin erstellen machen gibt es bitte danke hallo ' +
    'guten tag mir mich mein meine dein deine ihnen euch auch noch schon sehr etwa ungefähr ' +
    'webseite leistungen projekt projekte erfahrung dauert lange beratung ja nein'
  ).split(/\s+/u),
)

const ENGLISH_MARKERS = new Set(
  (
    'i you we they he she it and or not no is are am was were will would can could should ' +
    'must do does did have has had the a an of for with from on at by to in into about ' +
    'what how who where when why which much many cost costs price prices pricing offer quote ' +
    'make build create there please thanks thank hello hi hey my your our me us this that ' +
    'these those any some also yet very long take takes services project projects experience ' +
    'consultation appointment book yes'
  ).split(/\s+/u),
)

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)

export const detectLanguage = (
  message: string,
  pageLocale: AssistantLanguage | null = null,
): AssistantLanguage => {
  if (ARABIC_SCRIPT.test(message)) return 'ar'

  let german = GERMAN_LETTERS.test(message.toLowerCase()) ? 2 : 0
  let english = 0

  for (const word of words(message)) {
    // A word both languages use ("in", "was", "also") counts for neither.
    const isGerman = GERMAN_MARKERS.has(word)
    const isEnglish = ENGLISH_MARKERS.has(word)

    if (isGerman && !isEnglish) german += 1
    if (isEnglish && !isGerman) english += 1
  }

  if (german > english) return 'de'
  if (english > german) return 'en'

  // Neither side has evidence. Arabic page + Latin text is still not Arabic.
  if (pageLocale === 'de' || pageLocale === 'en') return pageLocale

  return 'en'
}

/* ------------------------------------------------------------- the words */

/**
 * Everything the assistant itself says, in three languages. The site's own
 * content is quoted in the language it was published in; these are only the
 * frames around it.
 *
 * No owner name is written here: the published content already says who the
 * site belongs to, and a template cannot fall out of date with it.
 */
export const COPY = {
  intro: {
    de: 'Das steht dazu auf der Website:',
    en: 'Here is what the website says:',
    ar: 'هذا ما يذكره الموقع:',
  },
  introGenerated: {
    de: 'Laut den Informationen auf der Website:',
    en: 'According to the website:',
    ar: 'بحسب المعلومات المنشورة على الموقع:',
  },
  fallback: {
    de: 'Dazu habe ich auf der Website leider nichts gefunden, und ich möchte nichts erfinden. Am besten fragst du direkt über das Kontaktformular oder buchst ein kurzes Gespräch.',
    en: "I couldn't find that on the website, and I don't want to guess. The best way is to ask directly through the contact form or to book a short call.",
    ar: 'لم أجد إجابة عن هذا على الموقع، ولا أريد أن أخمّن. الأفضل أن تسأل مباشرة عبر نموذج التواصل أو أن تحجز مكالمة قصيرة.',
  },
  handoff: {
    de: 'Gern! Am einfachsten geht es direkt über das Kontaktformular, oder du buchst ein Gespräch zu einem passenden Termin.',
    en: 'Of course. You can get in touch directly through the contact form, or book a call at a time that suits you.',
    ar: 'بكل سرور. يمكنك التواصل مباشرة عبر نموذج التواصل، أو حجز مكالمة في الوقت الذي يناسبك.',
  },
  smalltalk: {
    de: 'Hallo! Ich beantworte Fragen zu den Leistungen, Preisen, Projekten und Artikeln auf dieser Website. Was möchtest du wissen?',
    en: 'Hello! I answer questions about the services, prices, projects and articles on this website. What would you like to know?',
    ar: 'مرحباً! أجيب عن الأسئلة المتعلقة بالخدمات والأسعار والمشاريع والمقالات على هذا الموقع. ماذا تود أن تعرف؟',
  },
  customQuote: {
    de: 'Für ein individuelles Angebot frag bitte direkt über das Kontaktformular an – ich nenne hier nur die veröffentlichten Preise.',
    en: 'For a custom quote, please ask directly through the contact form – I can only repeat the published prices.',
    ar: 'للحصول على عرض سعر مخصص، يرجى التواصل مباشرة عبر نموذج التواصل – أنا أذكر فقط الأسعار المنشورة.',
  },
  notice: {
    de: 'Hier antwortet ein automatischer Assistent, nur auf Grundlage der veröffentlichten Inhalte dieser Website. Unterhaltungen können gespeichert und vom Website-Inhaber gelesen werden. Bitte gib keine persönlichen Daten ein.',
    en: 'An automated assistant answers here, using only the content published on this website. Conversations may be saved and read by the site owner. Please do not enter personal information.',
    ar: 'يجيب هنا مساعد آلي يعتمد فقط على المحتوى المنشور على هذا الموقع. قد يتم حفظ المحادثات وقراءتها من قبل صاحب الموقع. يرجى عدم إدخال معلومات شخصية.',
  },
  price: {
    quote: { de: 'Preis auf Anfrage', en: 'Price on request', ar: 'السعر عند الطلب' },
    label: { de: 'Preis', en: 'Price', ar: 'السعر' },
    from: { de: 'ab', en: 'from', ar: 'ابتداءً من' },
    offer: { de: 'Angebot', en: 'Offer', ar: 'عرض' },
    period: {
      one_time: { de: 'einmalig', en: 'one-time', ar: 'لمرة واحدة' },
      monthly: { de: 'pro Monat', en: 'per month', ar: 'شهرياً' },
      yearly: { de: 'pro Jahr', en: 'per year', ar: 'سنوياً' },
    },
  },
  links: {
    contact: { de: 'Kontaktformular', en: 'Contact form', ar: 'نموذج التواصل' },
    booking: { de: 'Gespräch buchen', en: 'Book a call', ar: 'حجز مكالمة' },
    privacy: { de: 'Datenschutz', en: 'Privacy policy', ar: 'سياسة الخصوصية' },
  },
} as const

/** The key the widget can use to know which notice wording it displayed. */
export const NOTICE_KEY = 'assistant.notice.v1'

export const pathFor = (language: AssistantLanguage, page: 'contact' | 'booking' | 'privacy'): string =>
  page === 'privacy' ? `/${language}/datenschutz` : `/${language}/${page}`
