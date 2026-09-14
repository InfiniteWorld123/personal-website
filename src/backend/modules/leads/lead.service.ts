import { getDb, withTransaction, type Db } from '#/backend/db/client'
import { internalError, notFoundError, validationError } from '#/backend/shared/error'
import { enforceRateLimit } from '#/backend/shared/rate-limit'
import type {
  AdminLeadDetail,
  AdminLeadList,
  AdminLeadListItem,
  InboxSettings,
} from '#/shared/types/lead.types'
import { richTextToPlainText, type RichTextDoc } from '#/shared/validation/rich-text'
import { LEAD_SIGN_OFF } from '#/shared/lead-copy'
import {
  DEFAULT_INBOX_PREFERENCES,
  LEAD_PAGE_SIZE,
  readInboxPreferences,
  type ContactSubmitInput,
  type InboxPreferences,
  type InboxSignatures,
  type LeadBulkInput,
  type LeadFilterInput,
  type LeadLanguage,
  type LeadReplyInput,
  type LeadSource,
  type LeadStatus,
} from '#/shared/validation/lead.validation'
import { env } from '#/shared/env'
import { createReplyToken, inboundIsConfigured, stripQuotedReply } from './lead.inbound'
import { sendLeadNotificationMail, sendLeadReplyMail } from './lead.mail'

/**
 * The inbox.
 *
 * One rule shapes every write here: **the message is stored before anything
 * else is attempted**. The endpoint this replaces forwarded the form straight
 * to Resend, so a rejected send was a message that never existed. Storing
 * first means the worst mail outage costs a notification.
 *
 * The second rule is one row per person. A visitor who writes twice, or writes
 * and then books, is one lead with a conversation — not three lines in a list.
 */

/** Where the inbox keeps its own switches. One row, JSON value. */
const INBOX_SETTINGS_KEY = 'inbox'

const MAX_CONTACT_PER_IP_PER_WINDOW = 5
const MAX_CONTACT_PER_EMAIL_PER_HOUR = 3

/* -------------------------------------------------------------------------- */
/* Projections                                                                */
/* -------------------------------------------------------------------------- */

type LeadRow = {
  id: string
  source: LeadSource
  name: string
  email: string
  phone: string | null
  company: string | null
  service_interest: string
  budget_band: string
  timeline: string
  message: string
  language: LeadLanguage
  status: LeadStatus
  read_at: Date | null
  archived_at: Date | null
  is_junk: boolean
  attachment_name: string | null
  attachment_bytes: number | null
  notified_at: Date | null
  created_at: Date
  message_count: string
  booking_starts_at: Date | null
  booking_type_name: string | null
}

/**
 * A lead has no subject line — the form never asks for one. The list shows
 * what the person is after instead, which is the qualifying answer they did
 * give, and falls back to the first line they wrote.
 */
const subjectFor = (row: LeadRow): string => {
  if (row.service_interest.trim()) return row.service_interest.trim()

  const firstLine = row.message.split('\n').find((line) => line.trim() !== '')?.trim() ?? ''

  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine
}

const bookingLabel = (row: LeadRow): string | null => {
  if (!row.booking_starts_at) return null

  const when = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(row.booking_starts_at)

  return `${row.booking_type_name || 'Termin'} · ${when}`
}

const toListItem = (row: LeadRow): AdminLeadListItem => ({
  id: row.id,
  source: row.source,
  name: row.name,
  email: row.email,
  company: row.company ?? '',
  subject: subjectFor(row),
  preview: row.message.replaceAll('\n', ' ').slice(0, 180),
  status: row.status,
  language: row.language,
  budget: row.budget_band,
  timeline: row.timeline,
  projectType: row.service_interest,
  isUnread: row.read_at === null,
  isJunk: row.is_junk,
  isArchived: row.archived_at !== null,
  hasAttachment: Boolean(row.attachment_name),
  bookingLabel: bookingLabel(row),
  replyCount: Number(row.message_count ?? 0),
  createdAt: row.created_at.toISOString(),
})

/**
 * The newest confirmed call this person booked, joined onto their row. This is
 * what makes one inbox one inbox: the booking does not arrive as a second
 * line, it appears on the line of the person who made it.
 */
const LEAD_COLUMNS = `l.id, l.source, l.name, l.email, l.phone, l.company, l.service_interest,
        l.budget_band, l.timeline, l.message, l.language, l.status, l.read_at, l.archived_at,
        l.is_junk, l.attachment_name, l.attachment_bytes, l.notified_at, l.created_at,
        (SELECT count(*) FROM lead_messages m WHERE m.lead_id = l.id)::text AS message_count,
        nb.starts_at AS booking_starts_at, nb.type_name AS booking_type_name`

const LEAD_FROM = `FROM leads l
   LEFT JOIN LATERAL (
     SELECT b.starts_at,
            COALESCE((SELECT t.name FROM booking_type_translations t
                       WHERE t.booking_type_id = b.booking_type_id
                       ORDER BY CASE t.language WHEN 'de' THEN 1 WHEN 'en' THEN 2 ELSE 3 END
                       LIMIT 1), '') AS type_name
       FROM bookings b
      WHERE b.lead_id = l.id AND b.status = 'CONFIRMED'
      ORDER BY b.starts_at DESC
      LIMIT 1
   ) nb ON true`

/* -------------------------------------------------------------------------- */
/* Events                                                                     */
/* -------------------------------------------------------------------------- */

type LeadEventKind =
  | 'ARRIVED'
  | 'NOTIFIED'
  | 'OPENED'
  | 'STATUS'
  | 'REPLIED'
  | 'INBOUND'
  | 'NOTE'
  | 'ARCHIVED'
  | 'UNARCHIVED'
  | 'JUNK'
  | 'NOT_JUNK'

const recordEvent = async (
  db: Db,
  leadId: string,
  kind: LeadEventKind,
  detail = '',
): Promise<void> => {
  await db.query(`INSERT INTO lead_events (lead_id, kind, detail) VALUES ($1, $2, $3);`, [
    leadId,
    kind,
    detail,
  ])
}

/* -------------------------------------------------------------------------- */
/* The public door: the contact form                                          */
/* -------------------------------------------------------------------------- */

export type ContactAttachment = { filename: string; content: string; bytes: number }

export type ContactSubmitContext = {
  clientIp?: string
  attachment?: ContactAttachment | null
}

/**
 * Writes the message, then tells the owner it arrived.
 *
 * A returning address does not open a second row: the new message is appended
 * to that person's conversation and their lead is pulled back to the top of
 * the inbox, unread. Their qualifying answers only fill gaps, never overwrite
 * what the owner has since edited — the same rule the booking path follows.
 */
export const submitContactMessage = async (
  input: ContactSubmitInput,
  context: ContactSubmitContext = {},
): Promise<{ id: string }> => {
  if (context.clientIp) {
    await enforceRateLimit({
      scope: 'contact-ip',
      identity: context.clientIp,
      limit: MAX_CONTACT_PER_IP_PER_WINDOW,
      windowSeconds: 15 * 60,
      message: 'Please wait before sending another message.',
    })
  }

  await enforceRateLimit({
    scope: 'contact-email',
    identity: input.email.toLowerCase(),
    limit: MAX_CONTACT_PER_EMAIL_PER_HOUR,
    windowSeconds: 60 * 60,
    message: 'Please wait before sending another message.',
  })

  const attachment = context.attachment ?? null

  const id = await withTransaction(async (db) => {
    const existing = await db.query<{ id: string }>(
      `SELECT id FROM leads WHERE lower(email) = lower($1) ORDER BY created_at DESC LIMIT 1;`,
      [input.email],
    )
    const found = existing.rows[0]?.id

    if (found) {
      await db.query(
        `UPDATE leads
            SET name = CASE WHEN name = '' THEN $2 ELSE name END,
                phone = COALESCE(NULLIF(phone, ''), NULLIF($3, '')),
                company = COALESCE(NULLIF(company, ''), NULLIF($4, '')),
                service_interest = CASE WHEN service_interest = '' THEN $5 ELSE service_interest END,
                budget_band = CASE WHEN budget_band = '' THEN $6 ELSE budget_band END,
                timeline = CASE WHEN timeline = '' THEN $7 ELSE timeline END,
                "language" = $8,
                attachment_name = COALESCE($9, attachment_name),
                attachment_bytes = COALESCE($10, attachment_bytes),
                -- Back to the top of the inbox: someone who writes again is
                -- waiting again, whatever was done with their last message.
                read_at = NULL,
                archived_at = NULL,
                is_junk = false,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1;`,
        [
          found,
          input.name,
          input.phone,
          input.company,
          input.projectType,
          input.budget,
          input.timeline,
          input.language,
          attachment?.filename ?? null,
          attachment?.bytes ?? null,
        ],
      )

      // The new words go into the conversation rather than over the message
      // that is already there, so nothing a person wrote is ever replaced.
      await db.query(
        `INSERT INTO lead_messages (lead_id, direction, subject, body)
         VALUES ($1, 'IN', $2, $3);`,
        [found, input.projectType, input.message],
      )

      await recordEvent(db, found, 'ARRIVED', 'Contact form, again')

      return found
    }

    const created = await db.query<{ id: string }>(
      `INSERT INTO leads
         (source, name, email, phone, company, service_interest, budget_band, timeline,
          message, "language", attachment_name, attachment_bytes)
       VALUES ('CONTACT_FORM', $1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8, $9, $10, $11)
       RETURNING id;`,
      [
        input.name,
        input.email,
        input.phone,
        input.company,
        input.projectType,
        input.budget,
        input.timeline,
        input.message,
        input.language,
        attachment?.filename ?? null,
        attachment?.bytes ?? null,
      ],
    )

    const newId = created.rows[0]?.id
    if (!newId) throw internalError('The message could not be stored')

    await recordEvent(db, newId, 'ARRIVED', 'Contact form')

    return newId
  })

  // Past the point of no return: the message is safe, so a failing mail is
  // reported in the record and nowhere else.
  const notified = await sendLeadNotificationMail({
    id,
    source: 'CONTACT_FORM',
    name: input.name,
    email: input.email,
    company: input.company,
    phone: input.phone,
    projectType: input.projectType,
    budget: input.budget,
    timeline: input.timeline,
    message: input.message,
    language: input.language,
    attachment: attachment ? { filename: attachment.filename, content: attachment.content } : null,
  })

  if (notified) {
    const db = getDb()
    await db.query(`UPDATE leads SET notified_at = CURRENT_TIMESTAMP WHERE id = $1;`, [id])
    await recordEvent(db, id, 'NOTIFIED')
  }

  return { id }
}

/* -------------------------------------------------------------------------- */
/* The admin list                                                             */
/* -------------------------------------------------------------------------- */

const buildLeadFilter = (filter: LeadFilterInput): { where: string; values: unknown[] } => {
  const clauses: string[] = []
  const values: unknown[] = []

  // Junk lives in its own tab and nowhere else, including "all" — otherwise
  // the button that files it away would not appear to do anything.
  switch (filter.tab) {
    case 'open':
      clauses.push('l.archived_at IS NULL', 'l.is_junk = false')
      break
    case 'unread':
      clauses.push('l.read_at IS NULL', 'l.archived_at IS NULL', 'l.is_junk = false')
      break
    case 'new':
      clauses.push(`l.status = 'NEW'`, 'l.archived_at IS NULL', 'l.is_junk = false')
      break
    case 'closed':
      clauses.push(`l.status IN ('WON', 'LOST')`, 'l.is_junk = false')
      break
    case 'archived':
      clauses.push('l.archived_at IS NOT NULL', 'l.is_junk = false')
      break
    case 'junk':
      clauses.push('l.is_junk = true')
      break
    default:
      clauses.push('l.is_junk = false')
  }

  if (!filter.withBookings) clauses.push(`l.source <> 'BOOKING'`)

  if (filter.search) {
    values.push(`%${filter.search}%`)
    const placeholder = `$${values.length}`
    clauses.push(
      `(l.name ILIKE ${placeholder} OR l.email ILIKE ${placeholder}
        OR COALESCE(l.company, '') ILIKE ${placeholder} OR l.message ILIKE ${placeholder}
        OR EXISTS (SELECT 1 FROM lead_messages m WHERE m.lead_id = l.id AND m.body ILIKE ${placeholder}))`,
    )
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, values }
}

export const listLeadsForAdmin = async (filter: LeadFilterInput): Promise<AdminLeadList> => {
  const db = getDb()
  const { where, values } = buildLeadFilter(filter)

  const totals = await db.query<{ count: string; unread: string }>(
    `SELECT count(*)::text AS count,
            (SELECT count(*)::text FROM leads
              WHERE read_at IS NULL AND archived_at IS NULL AND is_junk = false) AS unread
       FROM leads l ${where};`,
    values,
  )

  const total = Number(totals.rows[0]?.count ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / LEAD_PAGE_SIZE))
  // A filter that shrinks the list must not strand the owner on a page that no
  // longer exists, so the requested page is clamped rather than empty.
  const page = Math.min(filter.page, pageCount)

  const rows = await db.query<LeadRow>(
    `SELECT ${LEAD_COLUMNS}
       ${LEAD_FROM}
       ${where}
      ORDER BY l.created_at DESC, l.id
      LIMIT $${values.length + 1} OFFSET $${values.length + 2};`,
    [...values, LEAD_PAGE_SIZE, (page - 1) * LEAD_PAGE_SIZE],
  )

  return {
    items: rows.rows.map(toListItem),
    total,
    page,
    pageCount,
    unread: Number(totals.rows[0]?.unread ?? 0),
  }
}

export const countUnreadLeads = async (): Promise<{ unread: number }> => {
  const result = await getDb().query<{ unread: string }>(
    `SELECT count(*)::text AS unread FROM leads
      WHERE read_at IS NULL AND archived_at IS NULL AND is_junk = false;`,
  )

  return { unread: Number(result.rows[0]?.unread ?? 0) }
}

const loadLead = async (db: Db, id: string): Promise<LeadRow> => {
  const result = await db.query<LeadRow>(
    `SELECT ${LEAD_COLUMNS} ${LEAD_FROM} WHERE l.id = $1;`,
    [id],
  )
  const row = result.rows[0]

  if (!row) throw notFoundError('That message no longer exists')

  return row
}

export const getLeadForAdmin = async (id: string): Promise<AdminLeadDetail> => {
  const db = getDb()
  const row = await loadLead(db, id)

  const [messages, notes, events, bookings] = await Promise.all([
    db.query<{
      id: string
      direction: 'IN' | 'OUT'
      subject: string
      body: string
      body_rich: RichTextDoc | null
      sent_at: Date
    }>(
      `SELECT id, direction, subject, body, body_rich, sent_at FROM lead_messages
        WHERE lead_id = $1 ORDER BY sent_at, id;`,
      [id],
    ),
    db.query<{ id: string; body: string; created_at: Date }>(
      `SELECT id, body, created_at FROM lead_notes WHERE lead_id = $1 ORDER BY created_at DESC;`,
      [id],
    ),
    db.query<{ id: string; kind: string; detail: string; created_at: Date }>(
      `SELECT id, kind, detail, created_at FROM lead_events WHERE lead_id = $1
        ORDER BY created_at DESC, id LIMIT 40;`,
      [id],
    ),
    db.query<{ id: string; starts_at: Date; status: string; type_name: string }>(
      `SELECT b.id, b.starts_at, b.status,
              COALESCE((SELECT t.name FROM booking_type_translations t
                         WHERE t.booking_type_id = b.booking_type_id
                         ORDER BY CASE t.language WHEN 'de' THEN 1 WHEN 'en' THEN 2 ELSE 3 END
                         LIMIT 1), '') AS type_name
         FROM bookings b WHERE b.lead_id = $1 ORDER BY b.starts_at DESC;`,
      [id],
    ),
  ])

  return {
    ...toListItem(row),
    phone: row.phone ?? '',
    message: row.message,
    attachmentName: row.attachment_name,
    attachmentBytes: row.attachment_bytes,
    notifiedAt: row.notified_at?.toISOString() ?? null,
    readAt: row.read_at?.toISOString() ?? null,
    messages: messages.rows.map((message) => ({
      id: message.id,
      direction: message.direction,
      subject: message.subject,
      body: message.body,
      // Only a reply written here can be rich; anything inbound is plain text
      // written by someone else, and is never rendered as markup.
      rich: message.direction === 'OUT' ? message.body_rich : null,
      sentAt: message.sent_at.toISOString(),
    })),
    notes: notes.rows.map((note) => ({
      id: note.id,
      body: note.body,
      createdAt: note.created_at.toISOString(),
    })),
    events: events.rows.map((event) => ({
      id: event.id,
      kind: event.kind,
      detail: event.detail,
      createdAt: event.created_at.toISOString(),
    })),
    bookings: bookings.rows.map((booking) => ({
      id: booking.id,
      label: booking.type_name || 'Termin',
      startsAt: booking.starts_at.toISOString(),
      status: booking.status,
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Filing                                                                     */
/* -------------------------------------------------------------------------- */

const touch = async (db: Db, id: string, set: string, values: unknown[]): Promise<void> => {
  const result = await db.query(
    `UPDATE leads SET ${set}, updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
    [id, ...values],
  )

  if (result.rowCount === 0) throw notFoundError('That message no longer exists')
}

export const markLeadRead = async (id: string, read: boolean): Promise<AdminLeadDetail> => {
  const db = getDb()

  await touch(db, id, read ? 'read_at = COALESCE(read_at, CURRENT_TIMESTAMP)' : 'read_at = NULL', [])
  if (read) await recordEvent(db, id, 'OPENED')

  return getLeadForAdmin(id)
}

export const setLeadStatus = async (id: string, status: LeadStatus): Promise<AdminLeadDetail> => {
  const db = getDb()

  await touch(db, id, 'status = $2', [status])
  await recordEvent(db, id, 'STATUS', status)

  return getLeadForAdmin(id)
}

export const setLeadArchived = async (id: string, archived: boolean): Promise<AdminLeadDetail> => {
  const db = getDb()

  await touch(
    db,
    id,
    archived
      ? 'archived_at = CURRENT_TIMESTAMP, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)'
      : 'archived_at = NULL',
    [],
  )
  await recordEvent(db, id, archived ? 'ARCHIVED' : 'UNARCHIVED')

  return getLeadForAdmin(id)
}

/**
 * Junk is a flag, never a delete. The owner said the button should file the
 * message away rather than destroy it, and a wrongly flagged enquiry has to be
 * recoverable from its own tab.
 */
export const setLeadJunk = async (id: string, junk: boolean): Promise<AdminLeadDetail> => {
  const db = getDb()

  await touch(
    db,
    id,
    junk ? 'is_junk = true, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)' : 'is_junk = false',
    [],
  )
  await recordEvent(db, id, junk ? 'JUNK' : 'NOT_JUNK')

  return getLeadForAdmin(id)
}

export const applyLeadBulkAction = async (input: LeadBulkInput): Promise<{ changed: number }> => {
  const set: Record<LeadBulkInput['action'], string> = {
    read: 'read_at = COALESCE(read_at, CURRENT_TIMESTAMP)',
    unread: 'read_at = NULL',
    archive: 'archived_at = CURRENT_TIMESTAMP, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)',
    unarchive: 'archived_at = NULL',
    junk: 'is_junk = true, read_at = COALESCE(read_at, CURRENT_TIMESTAMP)',
    notJunk: 'is_junk = false',
  }
  const event: Record<LeadBulkInput['action'], LeadEventKind> = {
    read: 'OPENED',
    unread: 'OPENED',
    archive: 'ARCHIVED',
    unarchive: 'UNARCHIVED',
    junk: 'JUNK',
    notJunk: 'NOT_JUNK',
  }

  return withTransaction(async (db) => {
    const result = await db.query(
      `UPDATE leads SET ${set[input.action]}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ANY($1::uuid[]);`,
      [input.ids],
    )

    await db.query(
      `INSERT INTO lead_events (lead_id, kind, detail)
       SELECT id, $2, 'Bulk' FROM leads WHERE id = ANY($1::uuid[]);`,
      [input.ids, event[input.action]],
    )

    return { changed: result.rowCount ?? 0 }
  })
}

/* -------------------------------------------------------------------------- */
/* Notes                                                                      */
/* -------------------------------------------------------------------------- */

export const addLeadNote = async (id: string, body: string): Promise<AdminLeadDetail> => {
  const db = getDb()

  await loadLead(db, id)
  await db.query(`INSERT INTO lead_notes (lead_id, body) VALUES ($1, $2);`, [id, body])
  await recordEvent(db, id, 'NOTE')

  return getLeadForAdmin(id)
}

export const deleteLeadNote = async (id: string, noteId: string): Promise<AdminLeadDetail> => {
  const result = await getDb().query(`DELETE FROM lead_notes WHERE id = $1 AND lead_id = $2;`, [
    noteId,
    id,
  ])

  if (result.rowCount === 0) throw notFoundError('That note no longer exists')

  return getLeadForAdmin(id)
}

/* -------------------------------------------------------------------------- */
/* Replying                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Sends the reply, then writes it into the conversation.
 *
 * The order is the opposite of the arrival path, and deliberately so: a reply
 * that was never sent must not appear in the thread as though it had been.
 */
export const replyToLead = async (
  id: string,
  input: LeadReplyInput,
): Promise<AdminLeadDetail> => {
  const db = getDb()
  const lead = await loadLead(db, id)

  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw validationError('Email is not configured, so this reply cannot be sent')
  }

  // Minted on the first reply rather than at arrival: a lead that is never
  // answered never needs an address, and an unused token is one more secret
  // sitting in the database for nothing.
  let replyToken: string | null = null

  if (inboundIsConfigured()) {
    const existing = await db.query<{ reply_token: string | null }>(
      `SELECT reply_token FROM leads WHERE id = $1;`,
      [id],
    )
    replyToken = existing.rows[0]?.reply_token ?? null

    if (!replyToken) {
      replyToken = createReplyToken()
      await db.query(`UPDATE leads SET reply_token = $2 WHERE id = $1;`, [id, replyToken])
    }
  }

  const preferences = await readPreferences(db)
  const signatures = await readSignatures(db)
  const subject = input.subject.trim() || subjectFor(lead)

  // The document is the letter; `body` is the same words without formatting,
  // which is what search, the list preview, and a plain-text mail client read.
  const plain = input.doc ? richTextToPlainText(input.doc) : input.body

  const { accepted } = await sendLeadReplyMail({
    to: lead.email,
    toName: lead.name,
    subject,
    body: plain,
    doc: input.doc ?? null,
    language: lead.language,
    replyToken,
    signature: preferences.signature
      ? signatures[lead.language]?.trim() || LEAD_SIGN_OFF[lead.language]
      : null,
  })

  if (!accepted) throw internalError('The reply could not be sent')

  await db.query(
    `INSERT INTO lead_messages (lead_id, direction, subject, body, body_rich)
     VALUES ($1, 'OUT', $2, $3, $4::jsonb);`,
    [id, subject, plain, input.doc ? JSON.stringify(input.doc) : null],
  )

  // Answering is the act that moves a lead along, so the status follows the
  // work instead of waiting to be set by hand.
  await touch(
    db,
    id,
    `status = CASE WHEN status = 'NEW' THEN 'CONTACTED' ELSE status END,
     read_at = COALESCE(read_at, CURRENT_TIMESTAMP)`,
    [],
  )
  await recordEvent(db, id, 'REPLIED', subject)

  return getLeadForAdmin(id)
}

/**
 * An answer coming back from the person. Called by the inbound webhook, which
 * has already checked the signature — this function trusts its caller and
 * nothing else, so it matches only on the per-lead token.
 */
export const recordInboundReply = async (input: {
  token: string
  body: string
  subject: string
  externalId: string | null
}): Promise<{ matched: boolean; recorded: boolean }> => {
  const db = getDb()
  const found = await db.query<{ id: string }>(
    `SELECT id FROM leads WHERE reply_token = $1 LIMIT 1;`,
    [input.token],
  )
  const id = found.rows[0]?.id

  if (!id) return { matched: false, recorded: false }

  const body = stripQuotedReply(input.body)

  const inserted = await db.query(
    `INSERT INTO lead_messages (lead_id, direction, subject, body, external_id)
     VALUES ($1, 'IN', $2, $3, $4)
     ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING;`,
    [id, input.subject.slice(0, 160), body, input.externalId],
  )

  // A provider that delivers the same webhook twice must not mark a lead
  // unread twice, nor write the answer twice.
  if (inserted.rowCount === 0) return { matched: true, recorded: false }

  await db.query(
    `UPDATE leads SET read_at = NULL, archived_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1;`,
    [id],
  )
  await recordEvent(db, id, 'INBOUND')

  return { matched: true, recorded: true }
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

const INBOX_SIGNATURES_KEY = 'inbox_signatures'

const EMPTY_SIGNATURES: InboxSignatures = { de: '', en: '', ar: '' }

const readSignatures = async (db: Db): Promise<InboxSignatures> => {
  const result = await db.query<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE "key" = $1;`,
    [INBOX_SIGNATURES_KEY],
  )
  const stored = result.rows[0]?.value

  if (typeof stored !== 'object' || stored === null) return EMPTY_SIGNATURES

  const row = stored as Record<string, unknown>

  return {
    de: typeof row.de === 'string' ? row.de : '',
    en: typeof row.en === 'string' ? row.en : '',
    ar: typeof row.ar === 'string' ? row.ar : '',
  }
}

export const saveInboxSignatures = async (
  signatures: InboxSignatures,
): Promise<InboxSettings> => {
  await getDb().query(
    `INSERT INTO app_settings ("key", value, updated_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
    [INBOX_SIGNATURES_KEY, JSON.stringify(signatures)],
  )

  return getInboxSettings()
}

const readPreferences = async (db: Db): Promise<InboxPreferences> => {
  const result = await db.query<{ value: unknown }>(
    `SELECT value FROM app_settings WHERE "key" = $1;`,
    [INBOX_SETTINGS_KEY],
  )

  return result.rows[0] ? readInboxPreferences(result.rows[0].value) : DEFAULT_INBOX_PREFERENCES
}

export const getInboxSettings = async (): Promise<InboxSettings> => ({
  preferences: await readPreferences(getDb()),
  signatures: await readSignatures(getDb()),
  canSendMail: Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
  canReceiveMail: inboundIsConfigured(),
})

export const saveInboxPreferences = async (
  preferences: InboxPreferences,
): Promise<InboxSettings> => {
  await getDb().query(
    `INSERT INTO app_settings ("key", value, updated_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT ("key") DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
    [INBOX_SETTINGS_KEY, JSON.stringify(preferences)],
  )

  return getInboxSettings()
}
