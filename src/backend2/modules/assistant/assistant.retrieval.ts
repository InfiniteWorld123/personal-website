import type { AssistantLanguage } from '../../contracts/assistant.contract'
import { CONTACT_FACTS_ID, type KnowledgeDocument } from './assistant.knowledge'
import { clip, isPriceWord, sameStem, sentences, tokenise } from './assistant.text'

/**
 * Finding the published passages that answer a question — and, just as
 * important, deciding that none does.
 *
 * Pure: it takes the documents `assistant.knowledge.ts` read and a question,
 * and returns hits. A small lexical scorer rather than embeddings: it needs no
 * model, no paid index and no network, it is explainable to the owner, and it
 * is easy to prove it cannot return something that was not published.
 *
 * The cost of being too strict is a polite "I don't know" with the Contact
 * link; the cost of being too loose is a confident wrong answer in the
 * owner's name. The thresholds lean strict for that reason.
 */

type Passage = {
  document: KnowledgeDocument
  text: string
  tokens: string[]
}

type Indexed = {
  document: KnowledgeDocument
  titleTokens: string[]
  passages: Passage[]
}

export type RetrievalHit = {
  document: KnowledgeDocument
  score: number
  /** The best-matching published sentences, verbatim, clipped. */
  snippet: string
}

const PASSAGE_CHARS = 600
const SNIPPET_CHARS = 360

/**
 * The share of the question's weight a passage must cover. Below it, the
 * passage shares some words with the question but is about something else.
 */
const MIN_COVERAGE = 0.6

/** Lines merged into passages of roughly `PASSAGE_CHARS`, never splitting a line. */
const passagesOf = (text: string): string[] => {
  const passages: string[] = []
  let current = ''

  for (const line of text.split('\n').map((part) => part.trim()).filter(Boolean)) {
    if (current && current.length + line.length > PASSAGE_CHARS) {
      passages.push(current)
      current = ''
    }

    current = current ? `${current}\n${line}` : line
  }

  if (current) passages.push(current)

  return passages
}

export const indexDocuments = (documents: KnowledgeDocument[]): Indexed[] =>
  documents.map((document) => ({
    document,
    titleTokens: tokenise(document.title, 'any'),
    passages: passagesOf(document.text).map((text) => ({ document, text, tokens: tokenise(text, 'any') })),
  }))

const matchesAny = (word: string, tokens: string[]): boolean => tokens.some((token) => sameStem(word, token))

/**
 * The published sentences of a passage that carry the question's words, in
 * their original order, up to the snippet length.
 */
const snippetOf = (passage: string, asked: string[]): string => {
  const scored = sentences(passage).map((sentence, index) => ({
    sentence,
    index,
    hits: asked.filter((word) => matchesAny(word, tokenise(sentence, 'any'))).length,
  }))

  const best = Math.max(0, ...scored.map((entry) => entry.hits))
  const chosen: typeof scored = []
  let length = 0

  // The best sentence first, then its neighbours with any match, in order.
  for (const entry of [...scored].sort((a, b) => b.hits - a.hits || a.index - b.index)) {
    if (chosen.length > 0 && (entry.hits === 0 || length + entry.sentence.length > SNIPPET_CHARS)) continue
    if (chosen.length === 0 && best === 0 && entry.index !== 0) continue

    chosen.push(entry)
    length += entry.sentence.length + 1

    if (length >= SNIPPET_CHARS) break
  }

  return clip(
    chosen
      .sort((a, b) => a.index - b.index)
      .map((entry) => entry.sentence)
      .join(' '),
    SNIPPET_CHARS,
  )
}

export type SearchOptions = {
  /** The visitor asked about prices: services with a published price rank up. */
  priceIntent?: boolean
  /** The visitor asked how to reach the owner: the published contact details rank up. */
  contactIntent?: boolean
  take?: number
}

/**
 * The documents worth answering from, best first. Empty means: the website
 * does not answer this, and nothing may be composed from it.
 */
export const search = (
  index: Indexed[],
  question: string,
  language: AssistantLanguage,
  options: SearchOptions = {},
): RetrievalHit[] => {
  const asked = [...new Set(tokenise(question, language))]
  const take = options.take ?? 3

  if (asked.length === 0 && !options.priceIntent) return []

  const allPassages = index.flatMap((entry) => entry.passages)
  const total = Math.max(1, allPassages.length)

  /*
   * How much each word says. A word most of the site uses ("website" on a web
   * developer's site) says little about which passage is meant: half weight.
   * A word the site never uses ("walrus") says the most — it names something
   * the website does not cover — so it weighs heaviest in the coverage check
   * below, and a question about it is not answered from its other words.
   */
  const weight = new Map(
    asked.map((word) => {
      const frequency = allPassages.filter((passage) => matchesAny(word, passage.tokens)).length / total

      return [word, frequency === 0 ? 1.5 : frequency > 0.35 ? 0.5 : 1] as const
    }),
  )

  const threshold = asked.length <= 1 ? 1 : 2
  const hits: RetrievalHit[] = []

  for (const entry of index) {
    // A published price answers the "how much" part of a question by itself.
    const priceAnswered = Boolean(options.priceIntent && entry.document.priceLine)
    const counted = asked.filter((word) => !(priceAnswered && isPriceWord(word)))
    const possible = counted.reduce((sum, word) => sum + (weight.get(word) ?? 1), 0)

    let bestScore = 0
    let bestCoverage = 0
    let bestPassage: Passage | null = null

    for (const passage of entry.passages) {
      let score = 0
      let covered = 0

      for (const word of counted) {
        const w = weight.get(word) ?? 1

        if (matchesAny(word, entry.titleTokens)) {
          score += 2 * w
          covered += w
        } else if (matchesAny(word, passage.tokens)) {
          score += w
          covered += w
        }
      }

      if (priceAnswered) score += 1.5
      if (options.contactIntent && entry.document.id === CONTACT_FACTS_ID) score += 1.5

      if (score > bestScore) {
        bestScore = score
        bestCoverage = possible === 0 ? 1 : covered / possible
        bestPassage = passage
      }
    }

    /*
     * A price question is answered only by a published price, or by a passage
     * that talks about prices (the FAQ's "why every price says from"). A page
     * that merely shares the word "website" is not an answer to "how much".
     */
    const aboutPrice =
      !options.priceIntent ||
      priceAnswered ||
      entry.titleTokens.some(isPriceWord) ||
      Boolean(bestPassage?.tokens.some(isPriceWord))

    if (bestPassage && aboutPrice && bestScore >= threshold && bestCoverage >= MIN_COVERAGE) {
      hits.push({
        document: entry.document,
        score: bestScore,
        snippet:
          entry.document.kind === 'faq'
            ? clip(entry.document.text, SNIPPET_CHARS + 120)
            : snippetOf(bestPassage.text, asked),
      })
    }
  }

  hits.sort((a, b) => b.score - a.score || a.document.id.localeCompare(b.document.id))

  const best = hits[0]?.score ?? 0

  // Only hits close to the best: a weak third match is noise, not an answer.
  return hits.filter((hit) => hit.score >= best * 0.6).slice(0, take)
}
