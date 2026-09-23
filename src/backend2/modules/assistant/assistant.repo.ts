import type {
  AssistantLanguage,
  AssistantOutcome,
  AssistantProvider,
  AssistantSource,
  ConversationListQuery,
  RetentionMode,
} from '../../contracts/assistant.contract'
import { getDb } from '../../db/client'

/**
 * The assistant's SQL, and nothing else. Conversations, messages, settings and
 * the anonymous daily counters. No address, user agent or name is ever
 * written: there is no column for one.
 */

/* ------------------------------------------------------------------ settings */

export type SettingsRow = {
  enabled: boolean
  retention_mode: RetentionMode
  retention_days: number | null
  updated_at: Date | null
}

/** The saved settings, or the defaults when the owner never saved any. */
export const readSettings = async (): Promise<SettingsRow> => {
  const { rows } = await getDb().query<SettingsRow>(
    'SELECT enabled, retention_mode, retention_days, updated_at FROM v2_assistant_settings WHERE id = 1',
  )

  return rows[0] ?? { enabled: false, retention_mode: 'manual', retention_days: null, updated_at: null }
}

export const writeSettings = async (settings: {
  enabled: boolean
  retentionMode: RetentionMode
  retentionDays: number | null
}): Promise<SettingsRow> => {
  const { rows } = await getDb().query<SettingsRow>(
    `INSERT INTO v2_assistant_settings (id, enabled, retention_mode, retention_days, updated_at)
     VALUES (1, $1, $2, $3, CURRENT_TIMESTAMP)
     ON CONFLICT (id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       retention_mode = EXCLUDED.retention_mode,
       retention_days = EXCLUDED.retention_days,
       updated_at = CURRENT_TIMESTAMP
     RETURNING enabled, retention_mode, retention_days, updated_at`,
    [settings.enabled, settings.retentionMode, settings.retentionDays],
  )

  return rows[0]!
}

/* ------------------------------------------------------------- conversations */

export type ConversationRow = {
  id: string
  language: AssistantLanguage
  page_locale: AssistantLanguage | null
  message_count: number
  fallback_count: number
  created_at: Date
  last_message_at: Date
}

const CONVERSATION_COLUMNS =
  'c.id, c.language, c.page_locale, c.message_count, c.fallback_count, c.created_at, c.last_message_at'

export const findConversationByTokenHash = async (
  tokenHash: string,
): Promise<ConversationRow | null> => {
  const { rows } = await getDb().query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM v2_assistant_conversations c WHERE c.token_hash = $1`,
    [tokenHash],
  )

  return rows[0] ?? null
}

export const insertConversation = async (input: {
  tokenHash: string
  language: AssistantLanguage
  pageLocale: AssistantLanguage | null
}): Promise<ConversationRow> => {
  const { rows } = await getDb().query<ConversationRow>(
    `INSERT INTO v2_assistant_conversations AS c (token_hash, language, page_locale)
     VALUES ($1, $2, $3)
     RETURNING ${CONVERSATION_COLUMNS}`,
    [input.tokenHash, input.language, input.pageLocale],
  )

  return rows[0]!
}

/**
 * Appends one message at the next position and bumps the conversation, in
 * one statement pair the caller runs inside a transaction. The row lock on the
 * conversation serialises two replies racing into the same conversation.
 */
export const appendMessage = async (input: {
  conversationId: string
  role: 'visitor' | 'assistant'
  language: AssistantLanguage
  body: string
  outcome?: AssistantOutcome
  provider?: AssistantProvider
  sources?: AssistantSource[]
  offeredContact?: boolean
}): Promise<void> => {
  const db = getDb()
  const { rows } = await db.query<{ message_count: number }>(
    `UPDATE v2_assistant_conversations
        SET message_count = message_count + 1,
            fallback_count = fallback_count + $2,
            last_message_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING message_count`,
    [input.conversationId, input.outcome === 'fallback' ? 1 : 0],
  )

  const position = rows[0]?.message_count

  // Deleted by the owner between the question and the reply: nothing to add to.
  if (position === undefined) return

  await db.query(
    `INSERT INTO v2_assistant_messages
       (conversation_id, position, role, language, body, outcome, provider, sources, offered_contact)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      input.conversationId,
      position,
      input.role,
      input.language,
      input.body,
      input.outcome ?? null,
      input.provider ?? null,
      JSON.stringify(input.sources ?? []),
      input.offeredContact ?? false,
    ],
  )
}

export const countVisitorMessages = async (conversationId: string): Promise<number> => {
  const { rows } = await getDb().query<{ n: string | number }>(
    `SELECT count(*) AS n FROM v2_assistant_messages WHERE conversation_id = $1 AND role = 'visitor'`,
    [conversationId],
  )

  return Number(rows[0]?.n ?? 0)
}

/* ---------------------------------------------------------------- the owner */

const likePattern = (text: string): string => `%${text.replace(/[\\%_]/gu, (c) => `\\${c}`)}%`

export type ConversationListRow = ConversationRow & { preview: string | null }

export const listConversations = async (
  query: ConversationListQuery,
): Promise<{ rows: ConversationListRow[]; total: number }> => {
  const where: string[] = []
  const values: unknown[] = []
  const add = (value: unknown): string => {
    values.push(value)

    return `$${values.length}`
  }

  if (query.language !== 'all') where.push(`c.language = ${add(query.language)}`)
  // UTC days, the same days the usage counters use.
  if (query.from !== '') where.push(`c.created_at >= ${add(query.from)}::date::timestamp AT TIME ZONE 'UTC'`)
  if (query.to !== '') {
    where.push(`c.created_at < (${add(query.to)}::date + 1)::timestamp AT TIME ZONE 'UTC'`)
  }
  if (query.outcome === 'fallback') where.push('c.fallback_count > 0')
  if (query.search !== '') {
    where.push(
      `EXISTS (SELECT 1 FROM v2_assistant_messages s
                WHERE s.conversation_id = c.id AND s.body ILIKE ${add(likePattern(query.search))})`,
    )
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string | number }>(
    `SELECT count(*) AS total FROM v2_assistant_conversations c ${clause}`,
    values,
  )

  const limit = add(query.pageSize)
  const offset = add((query.page - 1) * query.pageSize)

  // Most recent activity first; the id breaks ties, so a page boundary never moves.
  const { rows } = await db.query<ConversationListRow>(
    `SELECT ${CONVERSATION_COLUMNS},
            (SELECT m.body FROM v2_assistant_messages m
              WHERE m.conversation_id = c.id AND m.role = 'visitor'
              ORDER BY m.position LIMIT 1) AS preview
       FROM v2_assistant_conversations c
       ${clause}
      ORDER BY c.last_message_at DESC, c.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    values,
  )

  return { rows, total: Number(counted[0]?.total ?? 0) }
}

export const findConversation = async (id: string): Promise<ConversationRow | null> => {
  const { rows } = await getDb().query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM v2_assistant_conversations c WHERE c.id = $1`,
    [id],
  )

  return rows[0] ?? null
}

export type MessageRow = {
  id: string
  position: number
  role: 'visitor' | 'assistant'
  language: AssistantLanguage
  body: string
  outcome: AssistantOutcome | null
  provider: AssistantProvider | null
  sources: AssistantSource[] | string
  offered_contact: boolean
  created_at: Date
}

/** Bounded by `ASSISTANT_LIMITS.questionsPerConversation`, so one read is enough. */
export const listMessages = async (conversationId: string): Promise<MessageRow[]> => {
  const { rows } = await getDb().query<MessageRow>(
    `SELECT id, position, role, language, body, outcome, provider, sources, offered_contact, created_at
       FROM v2_assistant_messages
      WHERE conversation_id = $1
      ORDER BY position`,
    [conversationId],
  )

  return rows
}

/** The conversation and — by the foreign key's CASCADE — every message in it. */
export const deleteConversation = async (id: string): Promise<boolean> => {
  const { rows } = await getDb().query<{ id: string }>(
    'DELETE FROM v2_assistant_conversations WHERE id = $1 RETURNING id',
    [id],
  )

  return rows.length > 0
}

/** Retention: conversations whose last message is older than `days`. */
export const deleteConversationsIdleFor = async (days: number): Promise<number> => {
  const { rows } = await getDb().query<{ id: string }>(
    `DELETE FROM v2_assistant_conversations
      WHERE last_message_at < CURRENT_TIMESTAMP - make_interval(days => $1)
      RETURNING id`,
    [days],
  )

  return rows.length
}

/* ------------------------------------------------------------ daily counters */

export type UsageCounter =
  | 'conversations'
  | 'questions'
  | 'answered'
  | 'fallbacks'
  | 'handoffs'
  | 'contact_offers'
  | 'provider_calls'
  | 'provider_fallbacks'
  | 'rate_limited'
  | 'capped'

const COUNTERS: readonly UsageCounter[] = [
  'conversations',
  'questions',
  'answered',
  'fallbacks',
  'handoffs',
  'contact_offers',
  'provider_calls',
  'provider_fallbacks',
  'rate_limited',
  'capped',
]

const TODAY = `(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date`

/** Adds to today's counters. Names are checked against a fixed list, never interpolated from input. */
export const bumpUsage = async (increments: Partial<Record<UsageCounter, number>>): Promise<void> => {
  const entries = COUNTERS.filter((name) => (increments[name] ?? 0) > 0)

  if (entries.length === 0) return

  const values = entries.map((name) => increments[name] ?? 0)

  await getDb().query(
    `INSERT INTO v2_assistant_usage_days (day, ${entries.join(', ')})
     VALUES (${TODAY}, ${entries.map((_, index) => `$${index + 1}`).join(', ')})
     ON CONFLICT (day) DO UPDATE SET
       ${entries.map((name) => `${name} = v2_assistant_usage_days.${name} + EXCLUDED.${name}`).join(', ')}`,
    values,
  )
}

/**
 * Takes one unit of today's allowance for `counter`, or refuses. Atomic: the
 * `WHERE` inside `ON CONFLICT DO UPDATE` is evaluated under the row lock, so
 * two Workers racing for the last unit cannot both get it.
 */
export const reserveDaily = async (
  counter: 'questions' | 'provider_calls',
  limit: number,
): Promise<boolean> => {
  if (limit < 1) return false

  const { rows } = await getDb().query<{ used: number }>(
    `INSERT INTO v2_assistant_usage_days (day, ${counter})
     VALUES (${TODAY}, 1)
     ON CONFLICT (day) DO UPDATE SET ${counter} = v2_assistant_usage_days.${counter} + 1
       WHERE v2_assistant_usage_days.${counter} < $1
     RETURNING ${counter} AS used`,
    [limit],
  )

  return rows.length > 0
}

export const readUsedToday = async (counter: 'questions' | 'provider_calls'): Promise<number> => {
  const { rows } = await getDb().query<{ used: number }>(
    `SELECT ${counter} AS used FROM v2_assistant_usage_days WHERE day = ${TODAY}`,
  )

  return Number(rows[0]?.used ?? 0)
}

export type UsageRow = Record<UsageCounter, number> & { day: string }

/** The last `days` UTC days, today included, oldest first; missing days are zeros. */
export const readUsageDays = async (days: number): Promise<UsageRow[]> => {
  const { rows } = await getDb().query<UsageRow>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            ${COUNTERS.map((name) => `coalesce(u.${name}, 0)::int AS ${name}`).join(',\n            ')}
       FROM generate_series(${TODAY} - ($1::int - 1), ${TODAY}, interval '1 day') AS d(day)
       LEFT JOIN v2_assistant_usage_days u ON u.day = d.day::date
      ORDER BY d.day`,
    [days],
  )

  return rows.map((row) => ({
    ...row,
    ...Object.fromEntries(COUNTERS.map((name) => [name, Number(row[name])])),
  })) as UsageRow[]
}

/** Summed counters over an inclusive UTC date range, for Analytics. */
export const readUsageRange = async (from: string, to: string): Promise<UsageRow[]> => {
  const { rows } = await getDb().query<UsageRow>(
    `SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
            ${COUNTERS.map((name) => `coalesce(u.${name}, 0)::int AS ${name}`).join(',\n            ')}
       FROM generate_series($1::date, $2::date, interval '1 day') AS d(day)
       LEFT JOIN v2_assistant_usage_days u ON u.day = d.day::date
      ORDER BY d.day`,
    [from, to],
  )

  return rows.map((row) => ({
    ...row,
    ...Object.fromEntries(COUNTERS.map((name) => [name, Number(row[name])])),
  })) as UsageRow[]
}

/** What is stored right now: for the owner's privacy explanation and Analytics. */
export const countStored = async (): Promise<{ conversations: number; messages: number }> => {
  const { rows } = await getDb().query<{ conversations: string | number; messages: string | number }>(
    `SELECT (SELECT count(*) FROM v2_assistant_conversations) AS conversations,
            (SELECT count(*) FROM v2_assistant_messages) AS messages`,
  )

  return { conversations: Number(rows[0]?.conversations ?? 0), messages: Number(rows[0]?.messages ?? 0) }
}
