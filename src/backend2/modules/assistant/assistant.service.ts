import { hashOpaqueSecret, newOpaqueSecret } from '../../auth/crypto'
import { consumeRateLimit, sweepRateLimits } from '../../auth/rate-limit'
import {
  ASSISTANT_LIMITS,
  type AskInput,
  type AskResult,
  type AssistantAnswer,
  type AssistantLanguage,
  type AssistantSettings,
  type AssistantSource,
  type AssistantStatus,
  type AssistantUsage,
  type ConversationListQuery,
  type OwnerConversation,
  type OwnerConversationPage,
  type OwnerMessage,
  type SettingsPatch,
} from '../../contracts/assistant.contract'
import { toPage } from '../../contracts/pagination.contract'
import { withTransaction } from '../../db/client'
import { assistantUnavailable, notFound, rateLimited, validationFailed } from '../../http/error'
import {
  contactLinks,
  extractiveAnswer,
  fallbackAnswer,
  generativeAnswer,
  handoffAnswer,
  smalltalkAnswer,
} from './assistant.compose'
import { type KnowledgeDocument, loadKnowledge } from './assistant.knowledge'
import { COPY, NOTICE_KEY, detectLanguage, pathFor } from './assistant.language'
import {
  configuredProvider,
  dailyProviderCap,
  dailyQuestionLimit,
  resolveProviderAdapter,
} from './assistant.provider'
import * as repo from './assistant.repo'
import { indexDocuments, search } from './assistant.retrieval'
import { asksAboutPrice, asksForContact, isSmalltalk } from './assistant.text'

/**
 * The Public AI Assistant (`docs/v2/ai-assistant.md`).
 *
 * The order inside `askAssistant` is the feature:
 *
 *  1. Switched off → refused, nothing stored.
 *  2. Per-visitor limits (keyed hash of the address, never the address) and
 *     the site-wide daily ceiling → refused, nothing stored.
 *  3. The question is stored before an answer is composed, so a provider that
 *     times out still leaves the owner the question that was asked.
 *  4. Retrieval runs before any model: a question the published site does not
 *     answer never reaches one.
 *  5. The model, when it is on at all, is used only while today's reserved
 *     allowance lasts, and its answer must pass the money guard.
 */

/**
 * Per sender. Generous for a person reading answers, tight for a script. The
 * refusal says only "too fast" and when to try again.
 */
export const ASK_RATE_LIMITS = [
  { scope: 'assistant-ask-minute', limit: 8, windowSeconds: 60 },
  { scope: 'assistant-ask-hour', limit: 60, windowSeconds: 60 * 60 },
  { scope: 'assistant-ask-day', limit: 150, windowSeconds: 24 * 60 * 60 },
] as const

const REFUSALS = {
  disabled: 'The assistant is not available right now. Please use the contact form.',
  dailyLimit: 'The assistant has answered as many questions as it can today. Please use the contact form.',
  tooFast: 'That is a lot of questions at once. Please wait a moment and try again.',
} as const

/* ------------------------------------------------------------------ settings */

const toSettings = (row: repo.SettingsRow): AssistantSettings => ({
  enabled: row.enabled,
  retentionMode: row.retention_mode,
  retentionDays: row.retention_days,
  updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
})

export const readSettings = async (): Promise<AssistantSettings> => toSettings(await repo.readSettings())

export const updateSettings = async (patch: SettingsPatch): Promise<AssistantSettings> => {
  const current = await repo.readSettings()
  const retentionMode = patch.retentionMode ?? current.retention_mode
  const retentionDays =
    retentionMode === 'manual' ? null : (patch.retentionDays ?? current.retention_days ?? null)

  if (retentionMode === 'days' && retentionDays === null) {
    throw validationFailed('Choose after how many days conversations are deleted', {
      issues: [{ field: 'retentionDays', message: 'Choose after how many days conversations are deleted' }],
      missing: [],
    })
  }

  return toSettings(
    await repo.writeSettings({ enabled: patch.enabled ?? current.enabled, retentionMode, retentionDays }),
  )
}

/**
 * Applies the owner's retention choice: with `days`, deletes every
 * conversation (and, by CASCADE, its messages) idle for longer. With
 * `manual`, deletes nothing — conversations stay until the owner deletes them.
 */
export const purgeExpiredConversations = async (): Promise<{ mode: 'manual' | 'days'; deleted: number }> => {
  const settings = await repo.readSettings()

  if (settings.retention_mode !== 'days' || settings.retention_days === null) {
    return { mode: 'manual', deleted: 0 }
  }

  return { mode: 'days', deleted: await repo.deleteConversationsIdleFor(settings.retention_days) }
}

/* -------------------------------------------------------------------- status */

const providerActive = async (): Promise<boolean> => {
  const adapter = resolveProviderAdapter()
  const cap = dailyProviderCap()

  if (!adapter || cap < 1) return false

  return (await repo.readUsedToday('provider_calls')) < cap
}

export const readStatus = async (language: AssistantLanguage): Promise<AssistantStatus> => {
  const settings = await repo.readSettings()

  return {
    enabled: settings.enabled,
    mode: settings.enabled && (await providerActive()) ? 'generative' : 'extractive',
    notice: { key: NOTICE_KEY, text: COPY.notice[language] },
    links: [
      ...contactLinks(language),
      { kind: 'privacy', label: COPY.links.privacy[language], url: pathFor(language, 'privacy') },
    ],
    limits: { messageMaxLength: ASSISTANT_LIMITS.message },
  }
}

/* ----------------------------------------------------------------- answering */

/** The index is rebuilt only when the knowledge build itself changed. */
const indexes = new WeakMap<KnowledgeDocument[], ReturnType<typeof indexDocuments>>()

const indexFor = (documents: KnowledgeDocument[]) => {
  const cached = indexes.get(documents)

  if (cached) return cached

  const built = indexDocuments(documents)

  indexes.set(documents, built)

  return built
}

type Composed = { answer: AssistantAnswer; providerCalled: boolean; providerRejected: boolean }

/** The reply to one question, from published content only. */
export const composeAnswer = async (message: string, language: AssistantLanguage): Promise<Composed> => {
  const plain = (answer: AssistantAnswer): Composed => ({ answer, providerCalled: false, providerRejected: false })

  if (isSmalltalk(message)) return plain(smalltalkAnswer(language))

  const priceIntent = asksAboutPrice(message)
  const contactIntent = asksForContact(message)
  const hits = search(indexFor(await loadKnowledge(language)), message, language, {
    priceIntent,
    contactIntent,
  })

  if (hits.length === 0) return plain(contactIntent ? handoffAnswer(language) : fallbackAnswer(language))

  const extractive = extractiveAnswer({ hits, language, priceIntent, contactIntent })
  const adapter = resolveProviderAdapter()
  const cap = dailyProviderCap()

  // The allowance is taken *before* the call, so a crash mid-call still counts.
  if (!adapter || cap < 1 || !(await repo.reserveDaily('provider_calls', cap))) return plain(extractive)

  const result = await generativeAnswer({ adapter, question: message, hits, language, priceIntent, contactIntent })

  if (result.kind === 'answer') return { answer: result.answer, providerCalled: true, providerRejected: false }

  if (result.kind === 'unknown') {
    return {
      answer: contactIntent ? handoffAnswer(language) : fallbackAnswer(language),
      providerCalled: true,
      providerRejected: true,
    }
  }

  return { answer: extractive, providerCalled: true, providerRejected: true }
}

const enforceVisitorLimits = async (identity: string): Promise<void> => {
  for (const rule of ASK_RATE_LIMITS) {
    const result = await consumeRateLimit({
      scope: rule.scope,
      identity,
      rule: { limit: rule.limit, windowSeconds: rule.windowSeconds },
    })

    if (!result.allowed) {
      await repo.bumpUsage({ rate_limited: 1 })

      throw rateLimited(REFUSALS.tooFast, { reason: 'too_fast', retryAfter: result.retryAfter })
    }
  }
}

/**
 * One question, one answer. `identity` is the sender's address as
 * `requestIdentity` reads it; it is used only as a keyed-hash rate-limit key
 * and is never stored with the conversation.
 */
export const askAssistant = async (input: { ask: AskInput; identity: string }): Promise<AskResult> => {
  const { ask, identity } = input
  const settings = await repo.readSettings()

  if (!settings.enabled) throw assistantUnavailable(REFUSALS.disabled, { reason: 'disabled' })

  await enforceVisitorLimits(identity)

  if (!(await repo.reserveDaily('questions', dailyQuestionLimit()))) {
    await repo.bumpUsage({ capped: 1 })

    throw assistantUnavailable(REFUSALS.dailyLimit, { reason: 'daily_limit' })
  }

  // Housekeeping that nothing else schedules. A failure here fails nothing.
  await sweepRateLimits().catch(() => {})
  if (settings.retention_mode === 'days') await purgeExpiredConversations().catch(() => {})

  const language = detectLanguage(ask.message, ask.locale)

  let token = ask.conversationId
  let conversation = token ? await repo.findConversationByTokenHash(hashOpaqueSecret(token)) : null

  // A very long conversation starts afresh rather than growing without bound.
  if (conversation && (await repo.countVisitorMessages(conversation.id)) >= ASSISTANT_LIMITS.questionsPerConversation) {
    conversation = null
  }

  const conversationId = await withTransaction(async () => {
    let id = conversation?.id

    if (!id) {
      // An unknown, deleted or expired handle is not an error: a new conversation begins.
      token = newOpaqueSecret()

      id = (
        await repo.insertConversation({ tokenHash: hashOpaqueSecret(token), language, pageLocale: ask.locale })
      ).id
    }

    await repo.appendMessage({ conversationId: id, role: 'visitor', language, body: ask.message })

    return id
  })

  const composed = await composeAnswer(ask.message, language)
  const { answer } = composed

  await withTransaction(() =>
    repo.appendMessage({
      conversationId,
      role: 'assistant',
      language: answer.language,
      body: answer.text,
      outcome: answer.outcome,
      provider: answer.provider,
      sources: answer.sources,
      offeredContact: answer.links.length > 0,
    }),
  )

  await repo.bumpUsage({
    conversations: conversation ? 0 : 1,
    answered: answer.outcome === 'answered' ? 1 : 0,
    fallbacks: answer.outcome === 'fallback' ? 1 : 0,
    handoffs: answer.outcome === 'handoff' ? 1 : 0,
    contact_offers: answer.links.length > 0 ? 1 : 0,
    provider_fallbacks: composed.providerRejected ? 1 : 0,
  })

  return { conversationId: token!, answer }
}

/* ------------------------------------------------------------------ the owner */

const iso = (value: Date | string): string => new Date(value).toISOString()

const PREVIEW_CHARS = 160

export const listConversations = async (query: ConversationListQuery): Promise<OwnerConversationPage> => {
  const { rows, total } = await repo.listConversations(query)

  return toPage({
    items: rows.map((row) => ({
      id: row.id,
      language: row.language,
      pageLocale: row.page_locale,
      preview: (row.preview ?? '').slice(0, PREVIEW_CHARS),
      messageCount: Number(row.message_count),
      fallbackCount: Number(row.fallback_count),
      createdAt: iso(row.created_at),
      lastMessageAt: iso(row.last_message_at),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  })
}

const parseSources = (value: repo.MessageRow['sources']): AssistantSource[] => {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value

  return Array.isArray(parsed) ? (parsed as AssistantSource[]) : []
}

export const readConversation = async (id: string): Promise<OwnerConversation> => {
  const row = await repo.findConversation(id)

  if (!row) throw notFound('That conversation does not exist')

  const messages: OwnerMessage[] = (await repo.listMessages(id)).map((message) => ({
    id: message.id,
    position: Number(message.position),
    role: message.role,
    language: message.language,
    body: message.body,
    outcome: message.outcome,
    provider: message.provider,
    sources: parseSources(message.sources),
    offeredContact: message.offered_contact,
    createdAt: iso(message.created_at),
  }))

  return {
    id: row.id,
    language: row.language,
    pageLocale: row.page_locale,
    messageCount: Number(row.message_count),
    fallbackCount: Number(row.fallback_count),
    createdAt: iso(row.created_at),
    lastMessageAt: iso(row.last_message_at),
    messages,
  }
}

export const deleteConversation = async (id: string): Promise<{ id: string; deleted: true }> => {
  if (!(await repo.deleteConversation(id))) throw notFound('That conversation does not exist')

  return { id, deleted: true }
}

export const readUsage = async (days: number): Promise<AssistantUsage> => {
  const rows = await repo.readUsageDays(days)
  const adapter = resolveProviderAdapter()
  const cap = dailyProviderCap()
  const usedToday = await repo.readUsedToday('provider_calls')

  return {
    days: rows.map((row) => ({
      day: row.day,
      conversations: row.conversations,
      questions: row.questions,
      answered: row.answered,
      fallbacks: row.fallbacks,
      handoffs: row.handoffs,
      contactOffers: row.contact_offers,
      providerCalls: row.provider_calls,
      providerFallbacks: row.provider_fallbacks,
      rateLimited: row.rate_limited,
      capped: row.capped,
    })),
    provider: {
      configured: adapter ? adapter.name : configuredProvider(),
      dailyCap: cap,
      usedToday,
      active: Boolean(adapter) && cap > 0 && usedToday < cap,
    },
    dailyQuestionLimit: dailyQuestionLimit(),
    estimatedCostCents: 0,
  }
}
