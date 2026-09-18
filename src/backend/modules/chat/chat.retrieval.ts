import type { ChatTone } from '#/shared/chat.settings'
import type { ChatLanguage } from '#/shared/validation/chat.validation'
import { allowedAmounts, getKnowledge, type KnowledgeEntry } from './chat.knowledge'

/**
 * Finding the answer, and refusing the ones that were not found (D34).
 *
 * Everything here is pure: no database, no network, no clock. That is
 * deliberate — these three functions are the guards that stand between a
 * rented model and sentences a stranger will read as the owner's promise, so
 * they have to be testable without any of it.
 */

/**
 * Words too common to mean anything. Without these, "Wie viel kostet das?"
 * matches every entry containing "das" and the assistant answers confidently
 * from the wrong one — which is worse than admitting it does not know.
 */
const STOPWORDS: Record<ChatLanguage, string[]> = {
  de: 'und oder der die das den dem des ein eine einen einem eines ist sind war wird werden kann koennen muss ich du sie wir ihr mit fuer auf aus bei nach von zu im in am an als auch nur noch schon wie was wer wo wann warum welche welcher welches man mir mich dir dich es sich nicht kein keine mehr sehr etwas alles wenn dass denn aber dann hier dort bitte danke hallo guten tag'.split(' '),
  en: 'and or the a an is are was were be been being do does did can could should would will shall have has had i you we they he she it my your our their with for from into on at by of to in as also just only more very some any all if that this these those there here what which who whom when where why how please thanks thank hello hi'.split(' '),
  ar: 'و او أو في من على الى إلى عن مع هذا هذه ذلك تلك التي الذي ما ماذا هل كم كيف متى اين أين لماذا انا أنا انت أنت نحن هم هي هو كان كانت يكون تكون قد لقد ثم لكن او ان أن إن لا نعم عند لدى بعد قبل كل بعض اي أي شيء شي جدا جداً ايضا أيضاً فقط مرحبا السلام لو سمحت شكرا'.split(' '),
}

/**
 * One spelling for the many a visitor types.
 *
 * Arabic carries the weight here: `أ إ آ` are the same letter to someone
 * typing quickly, `ة` and `ه` are interchangeable at the end of a word, and
 * the diacritics are optional. Without this, `اسعار` never matches `أسعار`
 * and the Arabic assistant knows nothing.
 */
export const normalise = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ً-ْـ]/g, '')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/**
 * `ال` is Arabic's definite article, written joined to the word. Without
 * dropping it, `الموقع` and `موقع` are two unrelated tokens and half the
 * Arabic questions a visitor types miss their entry. Only on words long
 * enough to survive it — `الان` is a word, not an article plus one letter.
 */
const stripArabicArticle = (word: string): string =>
  word.startsWith('ال') && word.length > 4 ? word.slice(2) : word

const tokenise = (value: string, language: ChatLanguage): string[] => {
  const stop = new Set(STOPWORDS[language])

  return normalise(value)
    .split(' ')
    .map((word) => (language === 'ar' ? stripArabicArticle(word) : word))
    .filter((word) => word.length > 2 && !stop.has(word))
}

/**
 * Two words count as the same word when they share a five-character opening.
 *
 * Five, not four, and a test is the reason. At four, `website` matched the cue
 * `webshop` — so "Was kostet eine Website?" was answered with *which service
 * do I need*, confidently and about the wrong thing, while the price entry it
 * was obviously asking for sorted second. Five separates `websi` from `websh`
 * and still joins `kostet` to `kosten`, which is the whole point of matching
 * on stems in a language that inflects.
 */
const overlaps = (needle: string, haystack: string[]): boolean =>
  haystack.some((word) => {
    const shared = Math.min(needle.length, word.length)

    if (shared < 4) return needle === word

    const required = Math.min(5, shared)

    return needle.slice(0, required) === word.slice(0, required)
  })

/**
 * Below this, the book is treated as having no answer.
 *
 * Two independent meaningful words, or one that matches a cue written
 * specifically to catch it. Set by hand rather than tuned: the cost of being
 * too strict is a polite "I don't know", and the cost of being too loose is a
 * confident wrong answer in the owner's name. Those are not symmetric.
 */
const MATCH_THRESHOLD = 2

export type Retrieved = { entry: KnowledgeEntry; score: number }

/** The entries worth showing a model, best first. Empty means: do not ask one. */
export const search = (question: string, language: ChatLanguage, take = 3): Retrieved[] => {
  const asked = tokenise(question, language)

  if (asked.length === 0) return []

  const scored = getKnowledge(language)
    .map((entry) => {
      const text = tokenise(`${entry.question} ${entry.answer}`, language)
      let score = 0

      for (const word of asked) {
        // A cue is a word put there on purpose to catch this question, so it
        // counts double — that is the whole reason cues exist.
        if (overlaps(word, entry.cues)) score += 2
        else if (overlaps(word, text)) score += 1
      }

      return { entry, score }
    })
    .filter((hit) => hit.score >= MATCH_THRESHOLD)
    .sort((left, right) => right.score - left.score)

  return scored.slice(0, take)
}

/**
 * Every currency amount in a sentence, however it was written.
 *
 * Handles `990 €`, `€990`, `1.490 EUR` and `1,490` — a model asked for German
 * will use the dot as a thousands separator, and a check that misses that is
 * a check that passes the one answer it existed to catch.
 */
export const amountsIn = (text: string): number[] => {
  const matches = text.matchAll(/(?:€|EUR|eur)\s?([\d.,]+)|([\d.,]+)\s?(?:€|EUR|eur|euro|يورو)/gu)
  const found: number[] = []

  for (const match of matches) {
    const raw = (match[1] ?? match[2] ?? '').replace(/[.,](?=\d{3}\b)/g, '').replace(',', '.')
    const value = Number.parseFloat(raw)

    if (Number.isFinite(value)) found.push(value)
  }

  return found
}

export class InventedMoneyError extends Error {
  constructor(readonly amounts: number[]) {
    super(`The answer named an amount that is not published: ${amounts.join(', ')}`)
    this.name = 'InventedMoneyError'
  }
}

/**
 * The second guard, and the one the owner actually asked for.
 *
 * His prices are compound — a build price, an instalment, a monthly tier, a
 * technical surcharge — and a model that has seen three of those will happily
 * add a fourth. Telling it not to is a request. This is a rule: any amount in
 * the answer that the site does not itself publish means the answer is thrown
 * away and the published sentence is sent instead.
 */
export const assertNoInventedMoney = (answer: string): void => {
  const allowed = new Set(allowedAmounts())
  const invented = amountsIn(answer).filter((amount) => !allowed.has(amount))

  if (invented.length > 0) throw new InventedMoneyError(invented)
}

/**
 * The same answer, said three ways.
 *
 * `terse` cuts to the first sentence, which is where the published answers
 * put the actual answer. `warm` adds an opener. `formal` is the copy as
 * written — the German is already `Sie`-free and direct, so there is nothing
 * to do to it, and doing nothing is the point.
 */
export const shapeTone = (answer: string, tone: ChatTone, language: ChatLanguage): string => {
  if (tone === 'formal') return answer

  if (tone === 'terse') {
    const [first] = answer.split(/(?<=[.!?؟])\s+/)

    return first ?? answer
  }

  const opener = { de: 'Gute Frage — ', en: 'Good question — ', ar: 'سؤال جيد — ' }[language]

  return `${opener}${answer}`
}
