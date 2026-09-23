import type { AssistantLanguage, AssistantProvider } from '../../contracts/assistant.contract'

/**
 * The optional generative model, behind a wall one function thick.
 *
 * `docs/v2/ai-assistant.md`: spending should be $0 if feasible, with a hard
 * cutoff, and "a no-cost, non-generative fallback or temporarily disabled
 * assistant is preferable to an unexpected charge". So:
 *
 *  - The default provider is `none`: answers are composed from the published
 *    text itself (`assistant.compose.ts`) and no model is ever called.
 *  - `ASSISTANT_PROVIDER=workers-ai` names Cloudflare Workers AI over its REST
 *    API — and still calls nothing until `ASSISTANT_DAILY_PROVIDER_CALLS` is
 *    set above its default of 0. The cap is counted in the V2 database
 *    (`v2_assistant_usage_days`), reserved *before* each call, so concurrent
 *    Workers cannot overspend it; once reached, answers fall back to `none`.
 *  - A model is only ever handed published snippets, is told to answer only
 *    from them, and its answer is thrown away when it names a price the
 *    snippets do not (the money guard in `assistant.compose.ts`).
 *
 * Nothing here is activated by this code landing: no key is in the
 * repository, and the owner has not approved a provider or its terms.
 */

export type ProviderSnippet = { title: string; text: string }

export type ProviderInput = {
  question: string
  language: AssistantLanguage
  snippets: ProviderSnippet[]
}

/** What an adapter returns: the answer text, or `unknown` when the snippets do not answer. */
export type ProviderOutput = { kind: 'answer'; text: string } | { kind: 'unknown' }

export type ProviderAdapter = {
  readonly name: Exclude<AssistantProvider, 'none'>
  generate(input: ProviderInput): Promise<ProviderOutput>
}

type Env = Record<string, string | undefined>

/** The provider this deployment names. Unknown values fall to `none` rather than failing. */
export const configuredProvider = (environment: Env = process.env): AssistantProvider =>
  environment.ASSISTANT_PROVIDER?.trim() === 'workers-ai' ? 'workers-ai' : 'none'

const readCount = (value: string | undefined, fallback: number, max: number): number => {
  const parsed = Number(value?.trim())

  if (value === undefined || value.trim() === '' || !Number.isInteger(parsed) || parsed < 0) return fallback

  return Math.min(parsed, max)
}

/** Model calls allowed per UTC day. 0 (the default) means never. */
export const dailyProviderCap = (environment: Env = process.env): number =>
  readCount(environment.ASSISTANT_DAILY_PROVIDER_CALLS, 0, 10_000)

/** Questions the whole site may ask per UTC day, model or not. An abuse ceiling. */
export const dailyQuestionLimit = (environment: Env = process.env): number =>
  readCount(environment.ASSISTANT_DAILY_QUESTION_LIMIT, 500, 100_000)

/* ------------------------------------------------------------ the prompt */

/** The one token the model is told to produce when the snippets do not answer. */
export const UNKNOWN_TOKEN = 'NOT_IN_SNIPPETS'

const INSTRUCTION: Record<AssistantLanguage, string> = {
  de: `Du beantwortest Fragen von Besuchern einer Website. Antworte ausschließlich auf Grundlage der nummerierten Auszüge unten, auf Deutsch, in höchstens drei Sätzen. Nenne niemals einen Preis, eine Zahl, eine Frist, einen Rabatt oder eine Zusage, die nicht wörtlich in den Auszügen steht. Erstelle kein individuelles Angebot. Wenn die Auszüge die Frage nicht beantworten, antworte genau: ${UNKNOWN_TOKEN}`,
  en: `You answer visitors' questions on a website. Answer only from the numbered extracts below, in English, in at most three sentences. Never state a price, number, deadline, discount or commitment that is not written in the extracts. Never make a custom quote. If the extracts do not answer the question, reply with exactly: ${UNKNOWN_TOKEN}`,
  ar: `أنت تجيب عن أسئلة زوار موقع إلكتروني. أجب حصراً من المقتطفات المرقّمة أدناه، باللغة العربية، في ثلاث جمل على الأكثر. لا تذكر أبداً سعراً أو رقماً أو مدة أو خصماً أو التزاماً غير مكتوب حرفياً في المقتطفات. لا تقدّم عرض سعر مخصصاً. إن لم تُجب المقتطفات عن السؤال، اكتب بالضبط: ${UNKNOWN_TOKEN}`,
}

export const buildPrompt = (input: ProviderInput): { system: string; user: string } => ({
  system: INSTRUCTION[input.language],
  user: `${input.snippets
    .map((snippet, index) => `[${index + 1}] ${snippet.title}\n${snippet.text}`)
    .join('\n\n')}\n\n---\n${input.question}`,
})

/* ------------------------------------------------------------- Workers AI */

const DEFAULT_MODEL = '@cf/meta/llama-3.1-8b-instruct'
const TIMEOUT_MS = 12_000

/**
 * Cloudflare Workers AI over REST: `POST /accounts/{id}/ai/run/{model}`.
 *
 * Plain `fetch`, no SDK. Needs `ASSISTANT_WORKERS_AI_ACCOUNT_ID` and
 * `ASSISTANT_WORKERS_AI_TOKEN` (a token scoped to Workers AI only), both as
 * encrypted secrets, never in the repository. The response is read
 * defensively: a changed field costs a fallback answer, never an error in a
 * visitor's face.
 */
const workersAi = (environment: Env): ProviderAdapter | null => {
  const account = environment.ASSISTANT_WORKERS_AI_ACCOUNT_ID?.trim()
  const token = environment.ASSISTANT_WORKERS_AI_TOKEN?.trim()

  if (!account || !token) return null

  const model = environment.ASSISTANT_WORKERS_AI_MODEL?.trim() || DEFAULT_MODEL

  return {
    name: 'workers-ai',
    async generate(input) {
      const prompt = buildPrompt(input)
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${model}`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: prompt.user },
            ],
            max_tokens: 300,
            temperature: 0.2,
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      )

      if (!response.ok) throw new Error(`Workers AI responded ${response.status}`)

      const payload = (await response.json().catch(() => ({}))) as { result?: { response?: unknown } }
      const text = typeof payload.result?.response === 'string' ? payload.result.response.trim() : ''

      if (!text) throw new Error('Workers AI returned no text')
      if (text.includes(UNKNOWN_TOKEN)) return { kind: 'unknown' }

      return { kind: 'answer', text }
    },
  }
}

let adapterForTest: ProviderAdapter | null | undefined

/**
 * Tests only: the adapter to use instead of the real one. `null` forces
 * "none configured"; `undefined` restores the environment's choice. The
 * suite never reaches a real AI service.
 */
export const useProviderAdapterForTest = (adapter: ProviderAdapter | null | undefined): void => {
  adapterForTest = adapter
}

/** The adapter this deployment would use, or null when the model is off. */
export const resolveProviderAdapter = (environment: Env = process.env): ProviderAdapter | null => {
  if (adapterForTest !== undefined) return adapterForTest
  if (configuredProvider(environment) !== 'workers-ai') return null

  return workersAi(environment)
}
