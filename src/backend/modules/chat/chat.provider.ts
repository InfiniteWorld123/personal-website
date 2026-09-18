import { CHAT_SETTINGS } from '#/shared/chat.settings'
import { env } from '#/shared/env'
import type { ChatLanguage } from '#/shared/validation/chat.validation'
import type { KnowledgeEntry } from './chat.knowledge'
import { assertNoInventedMoney, InventedMoneyError, shapeTone } from './chat.retrieval'

/**
 * The rented brain, behind a wall one line thick (D34).
 *
 * The owner cannot pay for a model today, and free tiers generally reserve the
 * right to train on what they are sent and come with no `AVV`. That is fine
 * for his own site and not fine for a client's — so the provider is a setting,
 * and swapping it is `CHAT_PROVIDER=…` rather than a rewrite.
 *
 * Every implementation answers the same question: *given these entries from
 * the book and nothing else, what should be said?* None of them is ever asked
 * anything when the book came back empty — that check happens before this
 * file is reached, which is what makes "it cannot invent" true.
 */

export type ComposeInput = {
  question: string
  /** Already retrieved, best first, and never empty. */
  entries: KnowledgeEntry[]
  language: ChatLanguage
}

export type Brain = {
  /** Recorded on every answer, so a sentence that reads wrong can be traced to its author. */
  readonly name: string
  compose(input: ComposeInput): Promise<string>
}

/**
 * The book, read out loud.
 *
 * Not a placeholder and not a degraded mode: with no key, no account and no
 * network this answers eight questions in three languages correctly, and it
 * is what every other brain falls back to. The owner can ship the whole
 * feature on it and add a model the month he has one.
 */
const bookOnly: Brain = {
  name: 'off',
  compose: async ({ entries, language }) =>
    shapeTone(entries[0]!.answer, CHAT_SETTINGS.tone, language),
}

const INSTRUCTION: Record<ChatLanguage, string> = {
  de: 'Du beantwortest Fragen auf der Website von Yaman Warda. Antworte ausschließlich aus den unten stehenden Auszügen, auf Deutsch, in höchstens drei Sätzen. Nenne niemals einen Preis, eine Zahl, eine Frist oder eine Zusage, die nicht wörtlich in den Auszügen steht. Steht die Antwort nicht darin, schreibe genau: UNBEKANNT',
  en: 'You answer questions on Yaman Warda\'s website. Answer only from the extracts below, in English, in at most three sentences. Never state a price, a number, a deadline or a commitment that is not written in the extracts. If the answer is not there, reply with exactly: UNBEKANNT',
  ar: 'أنت تجيب عن الأسئلة على موقع يمان وردة. أجب حصراً من المقتطفات أدناه، بالعربية، في ثلاث جمل على الأكثر. لا تذكر أبداً سعراً أو رقماً أو مدة أو التزاماً غير مكتوب في المقتطفات. وإن لم يكن الجواب فيها، اكتب بالضبط: UNBEKANNT',
}

/** The one token the model is told to produce when the extracts do not answer. */
const UNKNOWN_TOKEN = 'UNBEKANNT'

export class BookHasNoAnswerError extends Error {
  constructor() {
    super('The brain reported that the extracts do not answer the question')
    this.name = 'BookHasNoAnswerError'
  }
}

const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Google's free tier, over plain `fetch`.
 *
 * No SDK: nothing here needs one, the Worker bundle stays as it is, and
 * adding a dependency to reach one HTTP endpoint is a decision this feature
 * does not have to make. The response is read defensively — every field
 * optional-chained — because a provider that changes a field name should cost
 * this site a nicer sentence, never an error in a visitor's face.
 */
const google: Brain = {
  name: 'google',
  async compose({ question, entries, language }) {
    const extracts = entries
      .map((entry, index) => `[${index + 1}] ${entry.question}\n${entry.answer}`)
      .join('\n\n')

    const response = await fetch(
      `${GOOGLE_ENDPOINT}/${env.CHAT_MODEL ?? 'gemini-2.0-flash'}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': env.CHAT_API_KEY ?? '',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: INSTRUCTION[language] }] },
          contents: [{ role: 'user', parts: [{ text: `${extracts}\n\n---\n${question}` }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 400 },
        }),
      },
    )

    if (!response.ok) {
      // A free tier says 429 on a busy afternoon. That is an ordinary event
      // here, not an incident: the visitor gets the book's own answer.
      console.error('[chat] provider refused', { status: response.status })

      throw new Error(`Provider responded ${response.status}`)
    }

    const payload = (await response.json().catch(() => ({}))) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim()

    if (!text) throw new Error('Provider returned no text')
    if (text.includes(UNKNOWN_TOKEN)) throw new BookHasNoAnswerError()

    return text
  },
}

const BRAINS: Record<string, Brain> = { off: bookOnly, google }

/** Which brain this deployment rents. Unknown names fall to the book rather than failing to boot. */
export const getBrain = (): Brain => {
  const chosen = env.CHAT_PROVIDER ?? 'off'

  if (chosen !== 'off' && !env.CHAT_API_KEY) {
    console.error('[chat] CHAT_PROVIDER is set without CHAT_API_KEY; answering from the book')

    return bookOnly
  }

  return BRAINS[chosen] ?? bookOnly
}

export type Composed = { reply: string; producedBy: string }

/**
 * One answer, with both guards applied and a floor underneath.
 *
 * The order matters. The model speaks, the money guard judges what it said,
 * and any failure at all — a refusal, a rate limit, a changed field, an
 * invented figure — lands on the book's own answer rather than on the visitor.
 * The one exception is the model reporting that the extracts do not answer the
 * question, which is a real answer and has to travel up.
 */
export const compose = async (input: ComposeInput): Promise<Composed> => {
  const brain = getBrain()

  if (brain.name === 'off') {
    return { reply: await bookOnly.compose(input), producedBy: bookOnly.name }
  }

  try {
    const reply = await brain.compose(input)

    assertNoInventedMoney(reply)

    return { reply, producedBy: brain.name }
  } catch (error) {
    if (error instanceof BookHasNoAnswerError) throw error

    if (error instanceof InventedMoneyError) {
      console.error('[chat] answer discarded', { amounts: error.amounts })
    }

    return { reply: await bookOnly.compose(input), producedBy: `${brain.name}:fell-back` }
  }
}
