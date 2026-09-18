import { getDb } from '#/backend/db/client'
import { notFoundError } from '#/backend/shared/error'
import { enforceRateLimit } from '#/backend/shared/rate-limit'
import { CHAT_SETTINGS } from '#/shared/chat.settings'
// The repository's own address, not `getSite()`. That helper layers the
// admin's published overrides on top, and those live in a module the browser
// fills — inside an API request the store is empty and it would return this
// same value while implying it had checked. Reading `site` says what is true.
import { site } from '#/frontend/content/site'
import type { ChatAnswer, ChatIntro } from '#/shared/types/chat.types'
import type { ChatAskInput, ChatLanguage } from '#/shared/validation/chat.validation'
import { getKnowledge, priceSentence } from './chat.knowledge'
import { BookHasNoAnswerError, compose } from './chat.provider'
import { search, shapeTone } from './chat.retrieval'

/**
 * The assistant on the public pages (D34).
 *
 * The order of operations in `ask` is the feature. Retrieval runs before the
 * provider, so a question the book cannot answer never reaches a model. The
 * conversation is recorded before the answer is composed, so a provider that
 * times out still leaves the owner the question that was asked — the same rule
 * the rest of this codebase follows for leads and bookings.
 */

type AskContext = { clientIp?: string }

type ConversationRow = {
  id: string
  language: ChatLanguage
  visitor_message_count: number
  first_unanswered_at: string | null
}

/**
 * Old conversations delete themselves on write, the way the rate-limit table
 * prunes itself in `consumeRateLimit`. A scheduled job would be a second thing
 * to deploy and a second thing to notice has stopped running; a `DELETE` on a
 * table this size is cheaper than the cron trigger that would replace it.
 *
 * This is the line that makes "thirty days, then gone" true rather than a
 * sentence in a privacy policy.
 */
const prune = async (): Promise<void> => {
  await getDb().query(
    `DELETE FROM chat_conversations
      WHERE last_message_at < CURRENT_TIMESTAMP - make_interval(days => $1);`,
    [CHAT_SETTINGS.retentionDays],
  )
}

/**
 * A path, and only a path.
 *
 * The widget sends where it was opened from. A visitor controls that string,
 * and a query string is precisely where an email address arrives by accident —
 * so the query and the fragment are cut off here rather than trusted.
 */
const toStoredPath = (raw: string): string | null => {
  const path = raw.split('?')[0]!.split('#')[0]!.trim()

  return path.startsWith('/') ? path.slice(0, 120) : null
}

const openConversation = async (
  language: ChatLanguage,
  path: string | null,
): Promise<ConversationRow> => {
  const { rows } = await getDb().query<ConversationRow>(
    `INSERT INTO chat_conversations (language, opened_from)
     VALUES ($1, $2)
     RETURNING id, language, visitor_message_count, first_unanswered_at;`,
    [language, path],
  )

  return rows[0]!
}

const loadConversation = async (id: string): Promise<ConversationRow> => {
  const { rows } = await getDb().query<ConversationRow>(
    `SELECT id, language, visitor_message_count, first_unanswered_at
       FROM chat_conversations WHERE id = $1;`,
    [id],
  )

  // Expired rather than wrong, most of the time: the visitor's tab outlived
  // the retention window. A 404 lets the widget start a new conversation
  // instead of showing an error for something nobody did wrong.
  if (!rows[0]) throw notFoundError('That conversation has expired')

  return rows[0]
}

const recordMessage = async (
  conversationId: string,
  author: 'VISITOR' | 'ASSISTANT',
  body: string,
  extra: { sourceKey?: string | null; producedBy?: string | null } = {},
): Promise<void> => {
  await getDb().query(
    `INSERT INTO chat_messages (conversation_id, author, body, source_key, produced_by)
     VALUES ($1, $2, $3, $4, $5);`,
    [conversationId, author, body, extra.sourceKey ?? null, extra.producedBy ?? null],
  )
}

/**
 * What it says when the book has nothing.
 *
 * The owner chose to show his contact details rather than ask the visitor for
 * an address — against my recommendation, and it is his site. The `inbox`
 * branch is written and unreached: it is one setting away, so changing his
 * mind costs him a word in `CHAT_SETTINGS` rather than a session of mine.
 */
const fallbackReply = (language: ChatLanguage): string => {
  const email = site.email

  if (CHAT_SETTINGS.fallback === 'inbox') {
    return {
      de: 'Das steht nicht in meinen Unterlagen. Ich leite die Frage an Yaman weiter — an welche E-Mail-Adresse darf er antworten?',
      en: 'That is not in my notes. I will pass the question on to Yaman — which email address should he reply to?',
      ar: 'هذا ليس في أوراقي. سأمرّر السؤال إلى يمان — على أي بريد يرد عليك؟',
    }[language]
  }

  return {
    de: `Das steht nicht in meinen Unterlagen. Schreib direkt an ${email} — dann antwortet Yaman selbst.`,
    en: `That is not in my notes. Write directly to ${email} and Yaman will answer himself.`,
    ar: `هذا ليس في أوراقي. اكتب مباشرة إلى ${email} ويرد عليك يمان بنفسه.`,
  }[language]
}

const markUnanswered = async (conversationId: string): Promise<void> => {
  // `COALESCE` so it records the *first* failure and later ones do not move it.
  // The owner reads this column to find the conversations worth his attention.
  await getDb().query(
    `UPDATE chat_conversations
        SET first_unanswered_at = COALESCE(first_unanswered_at, CURRENT_TIMESTAMP)
      WHERE id = $1;`,
    [conversationId],
  )
}

/**
 * Two ceilings, because this is the first endpoint here whose cost grows with
 * how much a stranger feels like typing.
 *
 * The per-conversation one is a column, checked below. This is the other: how
 * many conversations one address may start in a day. Outside a Worker there is
 * no trustworthy address, and `getTrustedClientIp` returns nothing rather than
 * believing a spoofable header — so this simply does not apply there.
 */
const assertAddressWithinLimit = async (clientIp?: string): Promise<void> => {
  if (!clientIp) return

  await enforceRateLimit({
    scope: 'chat-ip',
    identity: clientIp,
    limit: CHAT_SETTINGS.conversationsPerAddressPerDay,
    windowSeconds: 24 * 60 * 60,
    message: 'That is a lot of questions for one day. Write to me instead.',
  })
}

export const ask = async (input: ChatAskInput, context: AskContext): Promise<ChatAnswer> => {
  const limit = CHAT_SETTINGS.visitorMessageLimit

  // The address ceiling and the pruning both belong to *starting* a
  // conversation, not to continuing one: a visitor who is already talking
  // should not be cut off mid-question, and pruning on every message would run
  // a DELETE twenty times for one conversation.
  const conversation = await (async () => {
    if (input.conversationId) return loadConversation(input.conversationId)

    await assertAddressWithinLimit(context.clientIp)
    await prune()

    return openConversation(input.language, toStoredPath(input.path))
  })()

  // The ceiling is reported, not thrown. A visitor who reaches it has done
  // nothing wrong, and an error envelope would tell them so in the wrong tone.
  if (conversation.visitor_message_count >= limit) {
    return {
      conversationId: conversation.id,
      reply: fallbackReply(conversation.language),
      fallback: true,
      used: conversation.visitor_message_count,
      limit,
      canContinue: false,
    }
  }

  // The language of the page wins over the language of the conversation's
  // first message: the visitor may have walked from /de to /ar mid-visit.
  const language = input.language

  await recordMessage(conversation.id, 'VISITOR', input.message)

  const { rows } = await getDb().query<{ visitor_message_count: number }>(
    `UPDATE chat_conversations
        SET visitor_message_count = visitor_message_count + 1,
            last_message_at = CURRENT_TIMESTAMP,
            language = $2
      WHERE id = $1
      RETURNING visitor_message_count;`,
    [conversation.id, language],
  )

  const used = rows[0]?.visitor_message_count ?? conversation.visitor_message_count + 1

  const hits = search(input.message, language)

  // The first guard. Nothing matched, so no model is asked — and a model that
  // is not asked cannot invent an answer in the owner's name.
  if (hits.length === 0) {
    const reply = fallbackReply(language)

    await recordMessage(conversation.id, 'ASSISTANT', reply, { producedBy: 'fallback' })
    await markUnanswered(conversation.id)

    return { conversationId: conversation.id, reply, fallback: true, used, limit, canContinue: used < limit }
  }

  const best = hits[0]!.entry

  // Money never goes through a model at all. The owner chose ranges over exact
  // figures, and the published sentence is the whole of what he agreed to say.
  if (best.money && CHAT_SETTINGS.prices !== 'exact') {
    const reply =
      CHAT_SETTINGS.prices === 'silent'
        ? shapeTone(best.answer, CHAT_SETTINGS.tone, language)
        : priceSentence(language)

    await recordMessage(conversation.id, 'ASSISTANT', reply, {
      sourceKey: best.key,
      producedBy: 'published-prices',
    })

    return { conversationId: conversation.id, reply, fallback: false, used, limit, canContinue: used < limit }
  }

  try {
    const { reply, producedBy } = await compose({
      question: input.message,
      entries: hits.map((hit) => hit.entry),
      language,
    })

    await recordMessage(conversation.id, 'ASSISTANT', reply, { sourceKey: best.key, producedBy })

    return { conversationId: conversation.id, reply, fallback: false, used, limit, canContinue: used < limit }
  } catch (error) {
    // The model read the extracts and said they do not answer the question.
    // That is a real answer and is treated as one.
    if (!(error instanceof BookHasNoAnswerError)) throw error

    const reply = fallbackReply(language)

    await recordMessage(conversation.id, 'ASSISTANT', reply, { producedBy: 'brain-declined' })
    await markUnanswered(conversation.id)

    return { conversationId: conversation.id, reply, fallback: true, used, limit, canContinue: used < limit }
  }
}

/**
 * Everything the widget needs before anyone types.
 *
 * Served rather than bundled so that changing a setting reaches the next
 * visitor instead of the next deploy — and so the suggestions stay the book's
 * real questions rather than a second copy of them in the client.
 */
export const getIntro = (language: ChatLanguage): ChatIntro => {
  const greeting = {
    de: 'Hallo. Ich beantworte Fragen zu Ablauf, Preisrahmen und Übergabe.',
    en: 'Hello. I answer questions about process, price range and handover.',
    ar: 'أهلاً. أجيب عن الأسئلة المتعلقة بسير العمل ونطاق السعر والتسليم.',
  }[language]

  const disclosure = {
    de: 'Automatische Antwort. Es liest niemand mit.',
    en: 'Automated reply. No human is reading along.',
    ar: 'رد آلي. لا يقرأ هنا إنسان.',
  }[language]

  return {
    settings: {
      launcher: CHAT_SETTINGS.launcher,
      side: CHAT_SETTINGS.side,
      reveal: CHAT_SETTINGS.reveal,
      opening: CHAT_SETTINGS.opening,
      disclosure: CHAT_SETTINGS.disclosure,
    },
    greeting,
    suggestions:
      CHAT_SETTINGS.opening === 'suggestions'
        ? getKnowledge(language).slice(0, 3).map((entry) => entry.question)
        : [],
    disclosure,
    limit: CHAT_SETTINGS.visitorMessageLimit,
  }
}
