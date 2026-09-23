import type { ConversationListQuery, InboxFolder } from '../../contracts/inbox.contract'
import { getDb } from '../../db/client'

/**
 * Every statement the Inbox runs, against the shape `0009_inbox.sql`
 * installed. No business rule lives here.
 *
 * Queries run one after another, never `Promise.all`: a Worker may hold six
 * sockets at once and the local development database answers one connection
 * at a time.
 */

export type ConversationRow = {
  id: string
  subject: string
  counterpart_email: string
  counterpart_name: string
  origin: 'incoming' | 'outgoing' | 'contact' | 'booking'
  origin_ref: string | null
  facts: Record<string, string>
  reply_token: string
  folder: InboxFolder
  trashed_from: 'inbox' | 'archived' | null
  trashed_at: Date | null
  is_read: boolean
  is_starred: boolean
  message_count: number
  last_message_at: Date
  last_outgoing_at: Date | null
  last_direction: 'incoming' | 'outgoing' | null
  last_preview: string
  created_at: Date
  updated_at: Date
}

export type ConversationListRow = ConversationRow & {
  has_failed_send: boolean
  has_draft: boolean
}

export type MessageRow = {
  id: string
  conversation_id: string
  direction: 'incoming' | 'outgoing'
  from_email: string
  from_name: string
  to_email: string
  to_name: string
  subject: string
  body_text: string
  body_doc: unknown
  has_html: boolean
  message_id_header: string | null
  in_reply_to: string | null
  references_header: string | null
  occurred_at: Date
  delivery_status: 'sending' | 'accepted' | 'failed' | null
  delivery_provider: 'resend' | 'fake' | null
  provider_message_id: string | null
  failure_reason: string | null
  send_attempts: number
  last_attempt_at: Date | null
  source_draft_id: string | null
  attachments: Array<{ assetId: string; fileName: string; contentType: string; byteSize: number }>
  language: 'de' | 'en' | 'ar' | null
  created_at: Date
}

export type AttachmentRow = {
  id: string
  message_id: string
  position: number
  file_name: string
  declared_type: string
  detected_type: string | null
  byte_size: number
  checksum: string | null
  storage_key: string | null
  status: 'stored' | 'blocked' | 'failed'
  failure_reason: string | null
  saved_media_asset_id: string | null
  created_at: Date
}

export type DraftRow = {
  id: string
  conversation_id: string | null
  to_email: string
  subject: string
  body_doc: unknown
  language: 'de' | 'en' | 'ar'
  attachment_asset_ids: string[]
  revision: number
  created_at: Date
  updated_at: Date
  conversation_subject?: string | null
}

const MESSAGE_COLUMNS = `
  id, conversation_id, direction, from_email, from_name, to_email, to_name, subject,
  body_text, body_doc, (body_html IS NOT NULL AND body_html <> '') AS has_html,
  message_id_header, in_reply_to, references_header, occurred_at, delivery_status,
  delivery_provider, provider_message_id, failure_reason, send_attempts, last_attempt_at,
  source_draft_id, attachments, language, created_at`

/** `%` and `_` typed by the owner are searched for, not treated as wildcards. */
const likePattern = (query: string): string => `%${query.replace(/[\\%_]/gu, (match) => `\\${match}`)}%`

const toNumber = (value: unknown): number => Number(value ?? 0)

/* ----------------------------------------------------------- conversations */

const LIST_FLAGS = `
  EXISTS (
    SELECT 1 FROM v2_inbox_messages m
     WHERE m.conversation_id = c.id AND m.direction = 'outgoing' AND m.delivery_status = 'failed'
  ) AS has_failed_send,
  EXISTS (SELECT 1 FROM v2_inbox_drafts d WHERE d.conversation_id = c.id) AS has_draft`

export const listConversations = async (
  query: ConversationListQuery,
): Promise<{ rows: ConversationListRow[]; total: number }> => {
  const where: string[] = []
  const values: unknown[] = []
  let order = 'c.last_message_at DESC, c.id DESC'

  switch (query.view) {
    case 'sent':
      where.push(`c.last_outgoing_at IS NOT NULL`, `c.folder <> 'trash'`)
      order = 'c.last_outgoing_at DESC, c.id DESC'
      break
    case 'trash':
      where.push(`c.folder = 'trash'`)
      order = 'c.trashed_at DESC, c.id DESC'
      break
    default:
      values.push(query.view)
      where.push(`c.folder = $${values.length}`)
  }

  if (query.unread) where.push('c.is_read = false')
  if (query.starred) where.push('c.is_starred = true')

  if (query.q) {
    values.push(likePattern(query.q))
    const p = `$${values.length}`

    where.push(`(
      c.subject ILIKE ${p} OR c.counterpart_email ILIKE ${p} OR c.counterpart_name ILIKE ${p}
      OR EXISTS (
        SELECT 1 FROM v2_inbox_messages s
         WHERE s.conversation_id = c.id AND (s.body_text ILIKE ${p} OR s.subject ILIKE ${p})
      )
    )`)
  }

  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
  const db = getDb()

  const { rows: counted } = await db.query<{ total: string }>(
    `SELECT count(*) AS total FROM v2_inbox_conversations c ${clause}`,
    values,
  )

  values.push(query.pageSize, (query.page - 1) * query.pageSize)

  const { rows } = await db.query<ConversationListRow>(
    `SELECT c.*, ${LIST_FLAGS}
       FROM v2_inbox_conversations c
       ${clause}
      ORDER BY ${order}
      LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  )

  return { rows, total: toNumber(counted[0]?.total) }
}

export const countFolders = async (): Promise<{
  inbox: number
  inboxUnread: number
  archived: number
  trash: number
  sent: number
  drafts: number
}> => {
  const { rows } = await getDb().query<Record<string, string>>(
    `SELECT
       count(*) FILTER (WHERE folder = 'inbox') AS inbox,
       count(*) FILTER (WHERE folder = 'inbox' AND is_read = false) AS inbox_unread,
       count(*) FILTER (WHERE folder = 'archived') AS archived,
       count(*) FILTER (WHERE folder = 'trash') AS trash,
       count(*) FILTER (WHERE last_outgoing_at IS NOT NULL AND folder <> 'trash') AS sent,
       (SELECT count(*) FROM v2_inbox_drafts) AS drafts
     FROM v2_inbox_conversations`,
  )
  const row = rows[0] ?? {}

  return {
    inbox: toNumber(row.inbox),
    inboxUnread: toNumber(row.inbox_unread),
    archived: toNumber(row.archived),
    trash: toNumber(row.trash),
    sent: toNumber(row.sent),
    drafts: toNumber(row.drafts),
  }
}

export const findConversation = async (id: string): Promise<ConversationListRow | null> => {
  const { rows } = await getDb().query<ConversationListRow>(
    `SELECT c.*, ${LIST_FLAGS} FROM v2_inbox_conversations c WHERE c.id = $1`,
    [id],
  )

  return rows[0] ?? null
}

export const lockConversation = async (id: string): Promise<ConversationRow | null> => {
  const { rows } = await getDb().query<ConversationRow>(
    'SELECT * FROM v2_inbox_conversations WHERE id = $1 FOR UPDATE',
    [id],
  )

  return rows[0] ?? null
}

export const findConversationByToken = async (token: string): Promise<ConversationRow | null> => {
  const { rows } = await getDb().query<ConversationRow>(
    'SELECT * FROM v2_inbox_conversations WHERE reply_token = $1 FOR UPDATE',
    [token],
  )

  return rows[0] ?? null
}

/** The conversation that holds any of these Message-IDs, newest match first. */
export const findConversationByMessageIds = async (
  messageIds: string[],
): Promise<ConversationRow | null> => {
  if (messageIds.length === 0) return null

  const { rows } = await getDb().query<ConversationRow>(
    `SELECT c.* FROM v2_inbox_messages m
       JOIN v2_inbox_conversations c ON c.id = m.conversation_id
      WHERE m.message_id_header = ANY($1::text[])
      ORDER BY m.occurred_at DESC, m.id DESC
      LIMIT 1
      FOR UPDATE OF c`,
    [messageIds],
  )

  return rows[0] ?? null
}

export const insertConversation = async (input: {
  subject: string
  counterpartEmail: string
  counterpartName: string
  origin: ConversationRow['origin']
  originRef?: string | null
  facts?: Record<string, string>
  replyToken: string
  isRead: boolean
  occurredAt: Date
}): Promise<ConversationRow> => {
  const { rows } = await getDb().query<ConversationRow>(
    `INSERT INTO v2_inbox_conversations
       (subject, counterpart_email, counterpart_name, origin, origin_ref, facts, reply_token,
        is_read, last_message_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)
     RETURNING *`,
    [
      input.subject,
      input.counterpartEmail,
      input.counterpartName,
      input.origin,
      input.originRef ?? null,
      JSON.stringify(input.facts ?? {}),
      input.replyToken,
      input.isRead,
      input.occurredAt,
    ],
  )

  return rows[0]!
}

/**
 * Brings the list columns up to date after a message was added.
 *
 * An incoming message also makes the conversation unread and — if it was
 * archived or in Trash — returns it to the Inbox, so a client's answer is
 * never hidden.
 */
export const recordMessageOnConversation = async (input: {
  conversationId: string
  direction: 'incoming' | 'outgoing'
  occurredAt: Date
  preview: string
}): Promise<void> => {
  const incoming = input.direction === 'incoming'

  await getDb().query(
    `UPDATE v2_inbox_conversations
        SET message_count = message_count + 1,
            last_message_at = GREATEST(last_message_at, $2),
            last_direction = $3,
            last_preview = $4,
            last_outgoing_at = CASE WHEN $3 = 'outgoing' THEN $2 ELSE last_outgoing_at END,
            is_read = CASE WHEN $5 THEN false ELSE is_read END,
            folder = CASE WHEN $5 THEN 'inbox' ELSE folder END,
            trashed_at = CASE WHEN $5 THEN NULL ELSE trashed_at END,
            trashed_from = CASE WHEN $5 THEN NULL ELSE trashed_from END,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1`,
    [input.conversationId, input.occurredAt, input.direction, input.preview, incoming],
  )
}

export const updateConversationFlags = async (input: {
  id: string
  isRead?: boolean
  isStarred?: boolean
  folder?: InboxFolder
  trashedFrom?: 'inbox' | 'archived' | null
  trashedAt?: Date | null
}): Promise<void> => {
  const sets: string[] = []
  const values: unknown[] = [input.id]

  const set = (column: string, value: unknown) => {
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if (input.isRead !== undefined) set('is_read', input.isRead)
  if (input.isStarred !== undefined) set('is_starred', input.isStarred)
  if (input.folder !== undefined) set('folder', input.folder)
  if (input.trashedFrom !== undefined) set('trashed_from', input.trashedFrom)
  if (input.trashedAt !== undefined) set('trashed_at', input.trashedAt)

  if (sets.length === 0) return

  await getDb().query(
    `UPDATE v2_inbox_conversations SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    values,
  )
}

export const deleteConversationRow = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_inbox_conversations WHERE id = $1', [id])
}

export const trashedConversationIds = async (limit: number): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    `SELECT id FROM v2_inbox_conversations WHERE folder = 'trash' ORDER BY trashed_at, id LIMIT $1`,
    [limit],
  )

  return rows.map((row) => row.id)
}

/* ---------------------------------------------------------------- messages */

export const listMessages = async (input: {
  conversationId: string
  limit: number
  offset: number
}): Promise<{ rows: MessageRow[]; total: number }> => {
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string }>(
    'SELECT count(*) AS total FROM v2_inbox_messages WHERE conversation_id = $1',
    [input.conversationId],
  )
  const { rows } = await db.query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM v2_inbox_messages
      WHERE conversation_id = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2 OFFSET $3`,
    [input.conversationId, input.limit, input.offset],
  )

  return { rows, total: toNumber(counted[0]?.total) }
}

export const findMessage = async (id: string): Promise<MessageRow | null> => {
  const { rows } = await getDb().query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM v2_inbox_messages WHERE id = $1`,
    [id],
  )

  return rows[0] ?? null
}

export const lockMessage = async (id: string): Promise<MessageRow | null> => {
  const { rows } = await getDb().query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM v2_inbox_messages WHERE id = $1 FOR UPDATE`,
    [id],
  )

  return rows[0] ?? null
}

export const findMessageByDraft = async (draftId: string): Promise<MessageRow | null> => {
  const { rows } = await getDb().query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM v2_inbox_messages WHERE source_draft_id = $1`,
    [draftId],
  )

  return rows[0] ?? null
}

export const findMessageHtml = async (id: string): Promise<string | null> => {
  const { rows } = await getDb().query<{ body_html: string | null }>(
    `SELECT body_html FROM v2_inbox_messages WHERE id = $1 AND direction = 'incoming'`,
    [id],
  )

  return rows[0]?.body_html ?? null
}

export const dedupeKeyExists = async (key: string): Promise<boolean> => {
  const { rows } = await getDb().query('SELECT 1 FROM v2_inbox_messages WHERE dedupe_key = $1', [
    key,
  ])

  return rows.length > 0
}

/** The newest message of a conversation, for a reply's threading headers and quote. */
export const latestMessages = async (conversationId: string, limit: number): Promise<MessageRow[]> => {
  const { rows } = await getDb().query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM v2_inbox_messages
      WHERE conversation_id = $1
      ORDER BY occurred_at DESC, id DESC
      LIMIT $2`,
    [conversationId, limit],
  )

  return rows
}

export const insertMessage = async (input: {
  conversationId: string
  direction: 'incoming' | 'outgoing'
  fromEmail: string
  fromName: string
  toEmail: string
  toName: string
  subject: string
  bodyText: string
  bodyDoc?: unknown
  bodyHtml?: string | null
  messageIdHeader: string | null
  inReplyTo: string | null
  referencesHeader: string | null
  occurredAt: Date
  dedupeKey?: string | null
  deliveryStatus?: 'sending' | null
  sourceDraftId?: string | null
  attachments?: MessageRow['attachments']
  language?: 'de' | 'en' | 'ar' | null
}): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_inbox_messages
       (conversation_id, direction, from_email, from_name, to_email, to_name, subject, body_text,
        body_doc, body_html, message_id_header, in_reply_to, references_header, occurred_at,
        dedupe_key, delivery_status, source_draft_id, attachments, language)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17,
             $18::jsonb, $19)
     RETURNING id`,
    [
      input.conversationId,
      input.direction,
      input.fromEmail,
      input.fromName,
      input.toEmail,
      input.toName,
      input.subject,
      input.bodyText,
      input.bodyDoc === undefined ? null : JSON.stringify(input.bodyDoc),
      input.bodyHtml ?? null,
      input.messageIdHeader,
      input.inReplyTo,
      input.referencesHeader,
      input.occurredAt,
      input.dedupeKey ?? null,
      input.deliveryStatus ?? null,
      input.sourceDraftId ?? null,
      JSON.stringify(input.attachments ?? []),
      input.language ?? null,
    ],
  )

  return rows[0]!.id
}

export const markSendAttempt = async (id: string): Promise<void> => {
  await getDb().query(
    `UPDATE v2_inbox_messages
        SET delivery_status = 'sending', send_attempts = send_attempts + 1,
            last_attempt_at = CURRENT_TIMESTAMP, failure_reason = NULL
      WHERE id = $1`,
    [id],
  )
}

export const recordDelivery = async (input: {
  id: string
  status: 'accepted' | 'failed'
  provider: 'resend' | 'fake' | null
  providerMessageId?: string | null
  failureReason?: string | null
}): Promise<void> => {
  await getDb().query(
    `UPDATE v2_inbox_messages
        SET delivery_status = $2, delivery_provider = $3,
            provider_message_id = COALESCE($4, provider_message_id), failure_reason = $5
      WHERE id = $1`,
    [
      input.id,
      input.status,
      input.provider,
      input.providerMessageId ?? null,
      input.failureReason ?? null,
    ],
  )
}

export const messageIdsForConversation = async (conversationId: string): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_inbox_messages WHERE conversation_id = $1',
    [conversationId],
  )

  return rows.map((row) => row.id)
}

/* ------------------------------------------------------------- attachments */

export const insertAttachment = async (input: {
  messageId: string
  position: number
  fileName: string
  declaredType: string
  detectedType: string | null
  byteSize: number
  checksum: string | null
  storageKey: string | null
  status: 'stored' | 'blocked' | 'failed'
  failureReason: string | null
}): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_inbox_attachments
       (message_id, position, file_name, declared_type, detected_type, byte_size, checksum,
        storage_key, status, failure_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      input.messageId,
      input.position,
      input.fileName,
      input.declaredType,
      input.detectedType,
      input.byteSize,
      input.checksum,
      input.storageKey,
      input.status,
      input.failureReason,
    ],
  )
}

export const attachmentsForMessages = async (messageIds: string[]): Promise<AttachmentRow[]> => {
  if (messageIds.length === 0) return []

  const { rows } = await getDb().query<AttachmentRow>(
    `SELECT * FROM v2_inbox_attachments WHERE message_id = ANY($1::uuid[])
      ORDER BY message_id, position, id`,
    [messageIds],
  )

  return rows
}

export const findAttachment = async (id: string): Promise<AttachmentRow | null> => {
  const { rows } = await getDb().query<AttachmentRow>(
    'SELECT * FROM v2_inbox_attachments WHERE id = $1',
    [id],
  )

  return rows[0] ?? null
}

export const setSavedMediaAsset = async (id: string, assetId: string): Promise<void> => {
  await getDb().query('UPDATE v2_inbox_attachments SET saved_media_asset_id = $2 WHERE id = $1', [
    id,
    assetId,
  ])
}

export const storageKeysForConversation = async (conversationId: string): Promise<string[]> => {
  const { rows } = await getDb().query<{ storage_key: string }>(
    `SELECT a.storage_key FROM v2_inbox_attachments a
       JOIN v2_inbox_messages m ON m.id = a.message_id
      WHERE m.conversation_id = $1 AND a.storage_key IS NOT NULL`,
    [conversationId],
  )

  return rows.map((row) => row.storage_key)
}

/* ------------------------------------------------------------------ drafts */

const DRAFT_SELECT = `
  SELECT d.*, c.subject AS conversation_subject
    FROM v2_inbox_drafts d
    LEFT JOIN v2_inbox_conversations c ON c.id = d.conversation_id`

export const listDrafts = async (input: {
  limit: number
  offset: number
}): Promise<{ rows: DraftRow[]; total: number }> => {
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string }>(
    'SELECT count(*) AS total FROM v2_inbox_drafts',
  )
  const { rows } = await db.query<DraftRow>(
    `${DRAFT_SELECT} ORDER BY d.updated_at DESC, d.id DESC LIMIT $1 OFFSET $2`,
    [input.limit, input.offset],
  )

  return { rows, total: toNumber(counted[0]?.total) }
}

export const findDraft = async (id: string): Promise<DraftRow | null> => {
  const { rows } = await getDb().query<DraftRow>(`${DRAFT_SELECT} WHERE d.id = $1`, [id])

  return rows[0] ?? null
}

export const lockDraft = async (id: string): Promise<DraftRow | null> => {
  const { rows } = await getDb().query<DraftRow>(
    'SELECT * FROM v2_inbox_drafts WHERE id = $1 FOR UPDATE',
    [id],
  )

  return rows[0] ?? null
}

export const findReplyDraft = async (conversationId: string): Promise<DraftRow | null> => {
  const { rows } = await getDb().query<DraftRow>(
    'SELECT * FROM v2_inbox_drafts WHERE conversation_id = $1',
    [conversationId],
  )

  return rows[0] ?? null
}

export const insertDraft = async (input: {
  conversationId: string | null
  toEmail: string
  subject: string
  language: 'de' | 'en' | 'ar'
}): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_inbox_drafts (conversation_id, to_email, subject, language)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (conversation_id) WHERE conversation_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [input.conversationId, input.toEmail, input.subject, input.language],
  )

  return rows[0]?.id ?? ''
}

export const updateDraftRow = async (input: {
  id: string
  toEmail?: string
  subject?: string
  bodyDoc?: unknown
  language?: string
  attachmentAssetIds?: string[]
}): Promise<void> => {
  const sets: string[] = []
  const values: unknown[] = [input.id]

  const set = (column: string, value: unknown, cast = '') => {
    values.push(value)
    sets.push(`${column} = $${values.length}${cast}`)
  }

  if (input.toEmail !== undefined) set('to_email', input.toEmail)
  if (input.subject !== undefined) set('subject', input.subject)
  if (input.bodyDoc !== undefined) set('body_doc', JSON.stringify(input.bodyDoc), '::jsonb')
  if (input.language !== undefined) set('language', input.language)
  if (input.attachmentAssetIds !== undefined) set('attachment_asset_ids', input.attachmentAssetIds, '::uuid[]')

  await getDb().query(
    `UPDATE v2_inbox_drafts
        SET ${[...sets, 'revision = revision + 1', 'updated_at = CURRENT_TIMESTAMP'].join(', ')}
      WHERE id = $1`,
    values,
  )
}

export const deleteDraftRow = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_inbox_drafts WHERE id = $1', [id])
}

export const draftIdsForConversation = async (conversationId: string): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    'SELECT id FROM v2_inbox_drafts WHERE conversation_id = $1',
    [conversationId],
  )

  return rows.map((row) => row.id)
}

/* ---------------------------------------------------------------- settings */

export const readSignatures = async (): Promise<Array<{ language: string; body: string }>> => {
  const { rows } = await getDb().query<{ language: string; body: string }>(
    'SELECT language, body FROM v2_inbox_signatures',
  )

  return rows
}

export const writeSignature = async (language: string, body: string): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_inbox_signatures (language, body) VALUES ($1, $2)
     ON CONFLICT (language) DO UPDATE SET body = EXCLUDED.body, updated_at = CURRENT_TIMESTAMP`,
    [language, body],
  )
}

export type SnippetRow = {
  id: string
  title: string
  language: 'de' | 'en' | 'ar' | null
  body: string
  updated_at: Date
}

export const listSnippets = async (input: {
  limit: number
  offset: number
}): Promise<{ rows: SnippetRow[]; total: number }> => {
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string }>(
    'SELECT count(*) AS total FROM v2_inbox_snippets',
  )
  const { rows } = await db.query<SnippetRow>(
    `SELECT id, title, language, body, updated_at FROM v2_inbox_snippets
      ORDER BY lower(title), id LIMIT $1 OFFSET $2`,
    [input.limit, input.offset],
  )

  return { rows, total: toNumber(counted[0]?.total) }
}

export const insertSnippet = async (input: {
  title: string
  language: string | null
  body: string
}): Promise<SnippetRow> => {
  const { rows } = await getDb().query<SnippetRow>(
    `INSERT INTO v2_inbox_snippets (title, language, body) VALUES ($1, $2, $3)
     RETURNING id, title, language, body, updated_at`,
    [input.title, input.language, input.body],
  )

  return rows[0]!
}

export const updateSnippet = async (input: {
  id: string
  title: string
  language: string | null
  body: string
}): Promise<SnippetRow | null> => {
  const { rows } = await getDb().query<SnippetRow>(
    `UPDATE v2_inbox_snippets SET title = $2, language = $3, body = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING id, title, language, body, updated_at`,
    [input.id, input.title, input.language, input.body],
  )

  return rows[0] ?? null
}

export const deleteSnippet = async (id: string): Promise<boolean> => {
  const { rows } = await getDb().query('DELETE FROM v2_inbox_snippets WHERE id = $1 RETURNING id', [
    id,
  ])

  return rows.length > 0
}

/** The message just before this one in its conversation, for a reply's quote. */
export const previousMessage = async (input: {
  conversationId: string
  before: Date
  excludeId: string
}): Promise<MessageRow | null> => {
  const { rows } = await getDb().query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM v2_inbox_messages
      WHERE conversation_id = $1 AND occurred_at <= $2 AND id <> $3
      ORDER BY occurred_at DESC, id DESC
      LIMIT 1`,
    [input.conversationId, input.before, input.excludeId],
  )

  return rows[0] ?? null
}

/** True when this Message-ID is one we generated for a message we sent. */
export const outgoingMessageIdExists = async (messageIdHeader: string): Promise<boolean> => {
  const { rows } = await getDb().query(
    `SELECT 1 FROM v2_inbox_messages WHERE message_id_header = $1 AND direction = 'outgoing' LIMIT 1`,
    [messageIdHeader],
  )

  return rows.length > 0
}
