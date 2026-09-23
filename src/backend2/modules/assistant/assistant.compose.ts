import type {
  AssistantAnswer,
  AssistantLanguage,
  AssistantLink,
  AssistantSource,
} from '../../contracts/assistant.contract'
import type { KnowledgeDocument } from './assistant.knowledge'
import { COPY, pathFor } from './assistant.language'
import type { ProviderAdapter } from './assistant.provider'
import type { RetrievalHit } from './assistant.retrieval'
import { amountsIn, inventedAmounts } from './assistant.text'

/**
 * Turning retrieval hits into the reply a visitor reads.
 *
 * Two authors, one floor:
 *
 *  - `none` (the default): the reply *is* the published wording — the best
 *    matching sentences of each source, its published price line, and a link
 *    to the page. It cannot state anything the website does not.
 *  - an optional model may reword those same snippets. Its answer is then
 *    judged: a failure, an "I cannot tell from these extracts", or any price
 *    the snippets do not contain sends the visitor the `none` reply instead.
 *    A model failure never looks like a confident answer.
 *
 * With no hits, nothing is composed at all: the honest fallback is sent, and
 * no model is asked.
 */

export const contactLinks = (language: AssistantLanguage): AssistantLink[] => [
  { kind: 'contact', label: COPY.links.contact[language], url: pathFor(language, 'contact') },
  { kind: 'booking', label: COPY.links.booking[language], url: pathFor(language, 'booking') },
]

const sourceOf = (document: KnowledgeDocument): AssistantSource => ({
  kind: document.kind,
  title: document.title,
  url: document.url,
})

/** One bullet per hit: the title, the published sentences, the published price. */
const snippetBlock = (hit: RetrievalHit, priceIntent: boolean): string => {
  const price = hit.document.priceLine
  const withPrice = price && (priceIntent || hit.document.kind === 'service') && !hit.snippet.includes(price)

  return `• ${hit.document.title}: ${hit.snippet}${withPrice ? `\n  ${price}` : ''}`
}

export const extractiveAnswer = (input: {
  hits: RetrievalHit[]
  language: AssistantLanguage
  priceIntent: boolean
  contactIntent: boolean
}): AssistantAnswer => {
  const { hits, language, priceIntent, contactIntent } = input
  const offerContact = priceIntent || contactIntent
  const lines = [COPY.intro[language], ...hits.map((hit) => snippetBlock(hit, priceIntent))]

  if (priceIntent) lines.push(COPY.customQuote[language])

  return {
    text: lines.join('\n'),
    language,
    outcome: 'answered',
    provider: 'none',
    sources: uniqueSources(hits),
    links: offerContact ? contactLinks(language) : [],
  }
}

const uniqueSources = (hits: RetrievalHit[]): AssistantSource[] => {
  const seen = new Set<string>()
  const sources: AssistantSource[] = []

  for (const hit of hits) {
    const source = sourceOf(hit.document)
    const key = `${source.url}|${source.title}`

    if (seen.has(key)) continue

    seen.add(key)
    sources.push(source)
  }

  return sources
}

export const fallbackAnswer = (language: AssistantLanguage): AssistantAnswer => ({
  text: COPY.fallback[language],
  language,
  outcome: 'fallback',
  provider: 'none',
  sources: [],
  links: contactLinks(language),
})

export const handoffAnswer = (language: AssistantLanguage): AssistantAnswer => ({
  text: COPY.handoff[language],
  language,
  outcome: 'handoff',
  provider: 'none',
  sources: [],
  links: contactLinks(language),
})

export const smalltalkAnswer = (language: AssistantLanguage): AssistantAnswer => ({
  text: COPY.smalltalk[language],
  language,
  outcome: 'smalltalk',
  provider: 'none',
  sources: [],
  links: [],
})

/* ------------------------------------------------------------- the model */

/** Every amount the snippets handed to a model publish: their text and their price lines. */
export const publishedAmounts = (hits: RetrievalHit[]): number[] =>
  hits.flatMap((hit) => [
    ...hit.document.amounts,
    ...amountsIn(hit.snippet),
    ...(hit.document.priceLine ? amountsIn(hit.document.priceLine) : []),
  ])

export type GenerativeResult =
  | { kind: 'answer'; answer: AssistantAnswer }
  /** The model said the snippets do not answer: the honest fallback. */
  | { kind: 'unknown' }
  /** The model failed or was overruled: use the extractive answer. */
  | { kind: 'rejected'; reason: 'failed' | 'invented_price' }

/**
 * Asks the model to reword the snippets, and judges what it said. Never
 * throws: every failure is a result the caller turns into a safe reply.
 */
export const generativeAnswer = async (input: {
  adapter: ProviderAdapter
  question: string
  hits: RetrievalHit[]
  language: AssistantLanguage
  priceIntent: boolean
  contactIntent: boolean
}): Promise<GenerativeResult> => {
  const { adapter, hits, language } = input
  let output: Awaited<ReturnType<ProviderAdapter['generate']>>

  try {
    output = await adapter.generate({
      question: input.question,
      language,
      snippets: hits.map((hit) => ({
        title: hit.document.title,
        text: [hit.snippet, hit.document.priceLine ?? ''].filter(Boolean).join('\n'),
      })),
    })
  } catch (error) {
    // The shape of the failure, never the visitor's text.
    console.error('Assistant provider failed', { provider: adapter.name, error: String(error).slice(0, 120) })

    return { kind: 'rejected', reason: 'failed' }
  }

  if (output.kind === 'unknown') return { kind: 'unknown' }

  const text = output.text.trim().slice(0, 2000)

  if (!text) return { kind: 'rejected', reason: 'failed' }

  // The money guard: any amount the published snippets do not state voids the answer.
  if (inventedAmounts(text, publishedAmounts(hits)).length > 0) {
    return { kind: 'rejected', reason: 'invented_price' }
  }

  const offerContact = input.priceIntent || input.contactIntent

  return {
    kind: 'answer',
    answer: {
      text: input.priceIntent ? `${text}\n${COPY.customQuote[language]}` : text,
      language,
      outcome: 'answered',
      provider: adapter.name,
      sources: uniqueSources(hits),
      links: offerContact ? contactLinks(language) : [],
    },
  }
}
