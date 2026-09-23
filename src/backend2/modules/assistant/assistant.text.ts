import type { AssistantLanguage } from '../../contracts/assistant.contract'

/**
 * Text handling for retrieval and for the money guard. Pure: no database, no
 * network, no clock, so every rule here is tested directly.
 *
 * The normalisation and stopword ideas come from the legacy chat
 * (`src/backend/modules/chat/chat.retrieval.ts`), rewritten here so Backend2
 * imports nothing from the legacy backend.
 */

/**
 * Words too common to mean anything. Without them "Wie viel kostet das?"
 * matches every passage that contains "das".
 */
const STOPWORDS: Record<AssistantLanguage, ReadonlySet<string>> = {
  de: new Set(
    'und oder der die das den dem des ein eine einen einem eines einer ist sind war wird werden kann koennen konnen muss ich du sie wir ihr mit fuer fur auf aus bei nach von zu zum zur im in am an als auch nur noch schon wie was wer wo wann warum welche welcher welches man mir mich dir dich es sich nicht kein keine mehr sehr etwas alles wenn dass denn aber dann hier dort bitte danke hallo guten tag gibt habe hast hat haben mein meine ihr ihre ihnen euch uns unser viel viele wieviel'.split(
      ' ',
    ),
  ),
  en: new Set(
    'and or the a an is are was were be been being do does did can could should would will shall have has had i you we they he she it my your our their with for from into on at by of to in as also just only more very some any all if that this these those there here what which who whom when where why how please thanks thank hello hi hey much many me us get about tell'.split(
      ' ',
    ),
  ),
  ar: new Set(
    'و او في من على الى عن مع هذا هذه ذلك تلك التي الذي ما ماذا هل كم كيف متى اين لماذا انا انت نحن هم هي هو كان كانت يكون تكون قد لقد ثم لكن ان لا نعم عند لدى بعد قبل كل بعض اي شيء شي جدا ايضا فقط مرحبا السلام لو سمحت شكرا لديكم عندكم لك لكم'.split(
      ' ',
    ),
  ),
}

/**
 * One spelling for the many a visitor types. Arabic carries the weight:
 * `أ إ آ` are one letter to someone typing quickly, `ة`/`ه` and `ى`/`ي` are
 * interchangeable at the end of a word, and diacritics are optional. German
 * umlauts fold to their base letter so "Preise" and "preise", "für" and "fur"
 * meet.
 */
export const normalise = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[أإآ]/gu, 'ا')
    .replace(/[ىئ]/gu, 'ي')
    .replace(/ؤ/gu, 'و')
    .replace(/ة/gu, 'ه')
    .replace(/[\u064B-\u0652\u0640]/gu, '')
    .replace(/ä/gu, 'a')
    .replace(/ö/gu, 'o')
    .replace(/ü/gu, 'u')
    .replace(/ß/gu, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * `ال` is Arabic's definite article, joined to the word; `و` ("and") and
 * `ب`/`ل` ("with"/"for") often are too. Stripped only from words long enough
 * to survive it.
 */
const stripArabicPrefix = (word: string): string => {
  let stem = word

  if (/^[وبل]ال/u.test(stem) && stem.length > 5) stem = stem.slice(1)
  if (stem.startsWith('ال') && stem.length > 4) stem = stem.slice(2)

  return stem
}

/** Every stopword list at once: content is indexed without knowing who asks. */
const ALL_STOPWORDS = new Set([...STOPWORDS.de, ...STOPWORDS.en, ...STOPWORDS.ar])

export const tokenise = (value: string, language: AssistantLanguage | 'any'): string[] => {
  const stop = language === 'any' ? ALL_STOPWORDS : STOPWORDS[language]

  return normalise(value)
    .split(' ')
    .map(stripArabicPrefix)
    .filter((word) => word.length > 2 && !stop.has(word))
}

/**
 * Two words count as the same word when they share a five-character opening
 * (or are equal, for short words). Five, not four, as the legacy chat found:
 * at four "website" matched "webshop"; at five "kostet" still meets "kosten".
 */
export const sameStem = (left: string, right: string): boolean => {
  const shared = Math.min(left.length, right.length)

  if (shared < 4) return left === right

  const required = Math.min(5, shared)

  return left.slice(0, required) === right.slice(0, required)
}

/* ---------------------------------------------------------------- intents */

const PRICE_WORDS = [
  'preis', 'preise', 'kosten', 'kostet', 'teuer', 'euro', 'budget', 'bezahlen', 'zahlen',
  'price', 'prices', 'pricing', 'cost', 'costs', 'expensive', 'pay', 'fee', 'fees', 'rate', 'rates',
  'سعر', 'اسعار', 'الاسعار', 'السعر', 'تكلفه', 'التكلفه', 'كلفه', 'يكلف', 'تكلف', 'ثمن', 'يورو', 'بكم',
].map(normalise)

const CONTACT_WORDS = [
  'kontakt', 'kontaktieren', 'erreichen', 'anrufen', 'telefon', 'email', 'mail', 'schreiben',
  'termin', 'buchen', 'gesprach', 'sprechen', 'treffen', 'beratung', 'meeting',
  'contact', 'reach', 'call', 'phone', 'appointment', 'book', 'booking', 'talk', 'speak', 'meet',
  'تواصل', 'التواصل', 'اتصال', 'اتصل', 'موعد', 'حجز', 'احجز', 'مكالمه', 'اكلم', 'التحدث', 'ايميل', 'بريد',
].map(normalise)

const GREETING_WORDS = [
  'hallo', 'hi', 'hey', 'moin', 'servus', 'guten', 'tag', 'morgen', 'abend', 'danke', 'dankeschon',
  'hello', 'thanks', 'thank', 'you', 'good', 'morning', 'evening', 'ok', 'okay', 'bye', 'tschuss',
  'مرحبا', 'اهلا', 'السلام', 'عليكم', 'شكرا', 'صباح', 'مساء', 'الخير', 'اهلين', 'هلا',
].map(normalise)

const rawWords = (message: string): string[] => normalise(message).split(' ').filter(Boolean)

/** One word that asks about money: "kostet", "prices", "سعر". */
export const isPriceWord = (word: string): boolean =>
  PRICE_WORDS.some((cue) => word === cue || (cue.length >= 5 && sameStem(word, cue)))

/** "How much …" and "wie viel …" ask about money unless they ask about time. */
const HOW_MUCH = /\b(how much|wie ?viel)\b(?!\s+(time|zeit|longer|länger))/iu

export const asksAboutPrice = (message: string): boolean =>
  HOW_MUCH.test(message) || rawWords(message).some(isPriceWord)

export const asksForContact = (message: string): boolean =>
  rawWords(message).some((word) =>
    CONTACT_WORDS.some((cue) => word === cue || (cue.length >= 5 && sameStem(word, cue))),
  )

/** Only greeting and thanks words, nothing else: "Hallo!", "thanks a lot". */
export const isSmalltalk = (message: string): boolean => {
  const words = rawWords(message)

  return (
    words.length > 0 &&
    words.length <= 5 &&
    words.every((word) => GREETING_WORDS.includes(word) || STOPWORDS.en.has(word) || STOPWORDS.de.has(word) || word.length <= 1)
  )
}

/* ------------------------------------------------------------ the money guard */

const ARABIC_DIGITS = /[\u0660-\u0669]/gu

/**
 * Every currency amount in a sentence, however it was written: `990 €`,
 * `€990`, `1.490 EUR`, `1,490 euros`, `١٬٤٩٠ يورو`. A model asked for German
 * uses the dot as a thousands separator, and a check that misses that is a
 * check that passes the one answer it existed to catch.
 */
export const amountsIn = (text: string): number[] => {
  const western = text
    .replace(ARABIC_DIGITS, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/\u066C/gu, ',')
    .replace(/\u066B/gu, '.')
  const pattern =
    /(?:€|\beur\b|\beuro\b|يورو)\s?(\d[\d.,\u00A0\u202F]*\d|\d)|(\d[\d.,\u00A0\u202F]*\d|\d)\s?(?:€|\beur(?:o|os)?\b|يورو)/giu
  const found: number[] = []

  for (const match of western.matchAll(pattern)) {
    const raw = (match[1] ?? match[2] ?? '').replace(/[\u00A0\u202F]/gu, '')
    // A separator followed by exactly three digits is a thousands separator.
    const cleaned = raw.replace(/[.,](?=\d{3}(?:\D|$))/gu, '').replace(',', '.')
    const value = Number.parseFloat(cleaned)

    if (Number.isFinite(value)) found.push(Math.round(value * 100) / 100)
  }

  return found
}

/**
 * The amounts in `answer` that none of `allowedTexts` publishes. Empty means
 * the answer names no price the website does not itself state.
 */
export const inventedAmounts = (answer: string, allowed: Iterable<number>): number[] => {
  const known = new Set([...allowed].map((amount) => Math.round(amount * 100) / 100))

  return amountsIn(answer).filter((amount) => !known.has(amount))
}

/* ---------------------------------------------------------------- snippets */

/** Splits prose into sentences, keeping the terminator. */
export const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?؟。])\s+|\n+/u)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0)

/** Cuts at a word boundary and marks the cut. */
export const clip = (text: string, max: number): string => {
  if (text.length <= max) return text

  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')

  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
