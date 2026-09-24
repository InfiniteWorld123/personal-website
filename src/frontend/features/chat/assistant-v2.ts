import type { AskResult, AssistantLanguage, AssistantStatus } from '#/backend2/contracts/assistant.contract'
import type { Language } from '#/frontend/i18n/language'

/** The widget's Backend2 calls (`docs/v2/public-cutover.md`, step 7). */

export class AssistantRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`Assistant request failed (${status})`)
  }
}

const readData = async <T>(response: Response): Promise<T> => {
  const body = (await response.json().catch(() => ({}))) as { data?: T; code?: string; error?: { code?: string } }

  if (!response.ok) throw new AssistantRequestError(response.status, body.code ?? body.error?.code)

  return body.data as T
}

export const readAssistantStatus = async (language: Language): Promise<AssistantStatus> =>
  readData(await fetch(`/api/v2/assistant/status?language=${language}`, { headers: { accept: 'application/json' } }))

export const askAssistantV2 = async (input: {
  message: string
  conversationId: string | undefined
  locale: AssistantLanguage
}): Promise<AskResult> =>
  readData(
    await fetch('/api/v2/assistant/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ message: input.message, conversationId: input.conversationId ?? null, locale: input.locale }),
    }),
  )

/** What the V2 widget says before the first answer, and when it cannot answer. */
export const assistantV2Words: Record<
  Language,
  { greeting: string; suggestions: string[]; resting: string; slowDown: string; sources: string }
> = {
  de: {
    greeting: 'Hallo. Ich beantworte Fragen zu Ablauf, Preisrahmen und Übergabe — nur mit dem, was auf dieser Website steht.',
    suggestions: ['Wie startet ein Projekt konkret?', 'Was kostet eine Website?', 'Muss ich Texte schon haben?'],
    resting: 'Der Assistent macht gerade Pause. Deine Frage beantwortet Yaman gern selbst.',
    slowDown: 'Zu viele Fragen in kurzer Zeit. In einer Minute geht es weiter — oder schreib Yaman direkt.',
    sources: 'Quellen',
  },
  en: {
    greeting: 'Hi. I answer questions about process, price ranges and handover — only from what this website says.',
    suggestions: ['How does a project start?', 'What does a website cost?', 'Do I need texts ready?'],
    resting: 'The assistant is resting. Yaman will gladly answer you himself.',
    slowDown: 'Too many questions in a short time. Try again in a minute — or write to Yaman directly.',
    sources: 'Sources',
  },
  ar: {
    greeting: 'أهلاً. أجيب عن الأسئلة حول سير العمل ونطاق الأسعار والتسليم — فقط مما هو مكتوب في هذا الموقع.',
    suggestions: ['كيف يبدأ المشروع عملياً؟', 'كم يكلف الموقع؟', 'هل أحتاج نصوصاً جاهزة؟'],
    resting: 'المساعد في استراحة الآن. يسعد يمان أن يجيبك بنفسه.',
    slowDown: 'أسئلة كثيرة في وقت قصير. حاول بعد دقيقة — أو راسل يمان مباشرة.',
    sources: 'المصادر',
  },
}
