import { content } from '#/frontend/content/base'
import { servicePrices } from '#/frontend/content/site'
import type { ChatLanguage } from '#/shared/validation/chat.validation'

/**
 * The book the assistant is allowed to answer from (D34).
 *
 * The owner chose this shape himself over reading the whole site or the
 * services PDFs: a question-and-answer file he writes, so he can see exactly
 * what his assistant is able to say by reading one file.
 *
 * The eight entries the site already publishes are **referenced, not copied**.
 * Duplicating them would mean editing an answer in two places and discovering
 * the second one months later, in a sentence a stranger read.
 */

export type KnowledgeEntry = {
  /** Stable across languages. Stored on the answer, so "what do people ask?" groups. */
  key: string
  question: string
  answer: string
  /**
   * Words that should reach this entry but do not appear in its text. The FAQ
   * asks *why* prices say "ab"; a visitor asks *what it costs*.
   */
  cues: string[]
  /** Answers about money take the price guard's path instead of being returned as written. */
  money?: boolean
}

/**
 * Which published FAQ item becomes which entry.
 *
 * Addressed by position because the FAQ items carry no ids of their own. A
 * reorder therefore renames a key: nothing breaks, but the history of "which
 * entry answered this" splits at that release. Worth knowing before reordering
 * the FAQ page; not worth a migration to prevent.
 */
const PUBLISHED: Array<{ key: string; group: number; item: number; money?: boolean }> = [
  { key: 'faq.start', group: 0, item: 0 },
  { key: 'faq.which-service', group: 0, item: 1 },
  { key: 'faq.materials', group: 0, item: 2 },
  { key: 'faq.abroad', group: 0, item: 3 },
  { key: 'faq.price-from', group: 1, item: 0, money: true },
  { key: 'faq.accounts-and-costs', group: 1, item: 1, money: true },
  { key: 'faq.delivery', group: 2, item: 0 },
  { key: 'faq.marketing', group: 2, item: 1 },
]

/**
 * The words a visitor actually types, which the published answers do not
 * contain. Kept beside the keys rather than inside the content files, because
 * they are retrieval machinery and not copy anyone reads.
 */
const CUES: Record<string, Record<ChatLanguage, string>> = {
  'faq.start': {
    de: 'anfangen loslegen erstes gespraech kennenlernen beauftragen auftrag',
    en: 'begin get started first call kick off hire commission',
    ar: 'ابدأ نبدأ اتفاق تعاقد اول خطوة تواصل',
  },
  'faq.which-service': {
    de: 'unterschied vergleich empfehlung passt homepage laden webshop app',
    en: 'difference compare recommend suits homepage store app',
    ar: 'فرق مقارنة انصح يناسب صفحة متجر تطبيق',
  },
  /**
   * `logo` was here and was taken out by a test.
   *
   * This entry answers "must I already *have* a logo?". A visitor asking "do
   * you *design* logos?" is asking something else entirely, and the cue made
   * the assistant answer them with "no, it helps to know what you already
   * have" — confident, fluent, and about a different question. That is the
   * exact failure the retrieval threshold exists to prevent, so the cue lost.
   */
  'faq.materials': {
    de: 'bilder fotos inhalte texte vorbereiten mitbringen material',
    en: 'pictures photos content texts prepare bring material',
    ar: 'صور محتوى نصوص تجهيز مواد',
  },
  'faq.abroad': {
    de: 'wo sitzt erfurt entfernung vor ort treffen sprache arabisch',
    en: 'where based erfurt distance on site meet language arabic',
    ar: 'اين مقر ارفورت مسافة لقاء لغة عربية',
  },
  'faq.price-from': {
    de: 'kostet kosten preis preise teuer guenstig budget euro angebot rabatt raten',
    en: 'cost costs price prices expensive cheap budget euro quote discount instalment',
    ar: 'كم سعر اسعار تكلفة يكلف ثمن غالي رخيص ميزانية عرض خصم تقسيط',
  },
  'faq.accounts-and-costs': {
    de: 'hosting domain laufende monatlich abo wartung betrieb gehoert mir',
    en: 'hosting domain running monthly subscription maintenance operation own',
    ar: 'استضافة نطاق شهري اشتراك صيانة تشغيل ملكية',
  },
  'faq.delivery': {
    de: 'dauer wie lange zeit termin fertig uebergabe danach aenderungen',
    en: 'duration how long time deadline finished handover after changes',
    ar: 'مدة كم يستغرق وقت موعد تسليم بعد تعديلات',
  },
  'faq.marketing': {
    de: 'seo google werbung ranking sichtbarkeit ads social media newsletter',
    en: 'seo google ads ranking visibility advertising social media newsletter',
    ar: 'سيو جوجل اعلانات ترتيب ظهور تسويق سوشال نشرة',
  },
}

/**
 * Entries the owner adds himself, beyond what the site publishes.
 *
 * Empty on purpose. `AGENTS.md` forbids inventing product behaviour, service
 * descriptions, prices or legal text, and every sentence here is one the
 * assistant will say to a stranger in his name — so this list is his to write,
 * not mine to guess. The shape is below; the eight above are the working
 * example.
 *
 * ```ts
 * { key: 'own.hosting-move', cues: ['umziehen', 'wechseln'],
 *   question: 'Kann ich meine bestehende Seite mitnehmen?',
 *   answer: '…' }
 * ```
 */
const OWN: Record<ChatLanguage, KnowledgeEntry[]> = { de: [], en: [], ar: [] }

const published = (language: ChatLanguage): KnowledgeEntry[] =>
  PUBLISHED.flatMap(({ key, group, item, money }) => {
    const source = content[language].faq.groups[group]?.items[item]

    // A FAQ page trimmed to fewer questions should cost the assistant that
    // entry, not the whole request.
    if (!source) return []

    return [
      {
        key,
        question: source.question,
        answer: source.answer,
        cues: (CUES[key]?.[language] ?? '').split(' ').filter(Boolean),
        money,
      },
    ]
  })

const books = new Map<ChatLanguage, KnowledgeEntry[]>()

/** The whole book in one language: what the site publishes, then what he added. */
export const getKnowledge = (language: ChatLanguage): KnowledgeEntry[] => {
  const cached = books.get(language)
  if (cached) return cached

  const book = [...published(language), ...OWN[language]]
  books.set(language, book)

  return book
}

/**
 * Every figure the assistant is permitted to say out loud.
 *
 * Read from `servicePrices` — the same numbers the services page renders — so
 * the assistant cannot contradict the site even when the site is mid-change.
 * Written here as a set rather than as sentences because the price guard needs
 * to *test* an answer against it, not print it.
 */
export const allowedAmounts = (): number[] => Object.values(servicePrices)

/**
 * The only thing it may say about money, in each language.
 *
 * Built from the real starting prices and the site's own "ab" convention. The
 * owner chose ranges over exact figures, and this is where that choice becomes
 * a sentence rather than an intention.
 */
export const priceSentence = (language: ChatLanguage): string => {
  const websites = servicePrices.websites

  if (language === 'de') {
    return `Websites beginnen ab ${websites} €; Online-Shops und individuelle Software liegen höher. Eine genaue Zahl steht erst im schriftlichen Angebot, weil sie vom vereinbarten Umfang abhängt.`
  }

  if (language === 'en') {
    return `Websites start from €${websites}; online stores and custom software are higher. An exact figure only appears in the written proposal, because it follows the agreed scope.`
  }

  return `المواقع تبدأ من ${websites} يورو، والمتاجر والبرمجيات المخصّصة أعلى. ولا يظهر الرقم الدقيق إلا في العرض المكتوب، لأنه يتبع النطاق المتفق عليه.`
}
