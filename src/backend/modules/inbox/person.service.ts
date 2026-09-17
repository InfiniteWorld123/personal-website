import { getDb } from '#/backend/db/client'
import { notFoundError } from '#/backend/shared/error'
import type { InboxRow, Note, Person } from '#/shared/types/inbox.types'
import type {
  InboxLanguage,
  InboxQueryInput,
  NoteInput,
  PersonSource,
  PersonWriteInput,
} from '#/shared/validation/inbox.validation'
import { listMessages } from './message.service'
import { emptyToNull, toInt, toIsoRequired } from './inbox.sql'

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

type RowShape = {
  id: string
  name: string
  email: string
  company: string | null
  language: InboxLanguage
  source: PersonSource
  starred: boolean
  archived_at: Date | null
  last_message_at: Date
  subject: string | null
  preview: string | null
  last_direction: string | null
  unread_count: number | string
  attachment_count: number | string
}

const project = (row: RowShape): InboxRow => ({
  id: row.id,
  name: row.name,
  email: row.email,
  company: emptyToNull(row.company),
  language: row.language,
  source: row.source,
  subject: row.subject ?? '',
  preview: (row.preview ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
  lastMessageAt: toIsoRequired(row.last_message_at),
  unreadCount: toInt(row.unread_count),
  attachmentCount: toInt(row.attachment_count),
  starred: row.starred,
  archived: row.archived_at !== null,
  // The last word was the owner's. This is what the "replied" mark reads,
  // because he chose that a message stays in the list after he answers it —
  // so the list has to say which ones he already answered.
  replied: row.last_direction === 'OUT',
})

/**
 * One row per person, newest conversation first.
 *
 * The form message stays on `leads.message` where 0007 put it, so "unread" has
 * two halves: the enquiry itself, unread while `read_at` is null, and every
 * inbound letter since. Counting only the second would leave a brand-new
 * enquiry looking already answered.
 */
export const listInbox = async (query: InboxQueryInput): Promise<InboxRow[]> => {
  const where: string[] = ['l.is_junk = false']
  const values: unknown[] = []

  /*
   * **A search looks everywhere, a tab does not.**
   *
   * Without this, a filed conversation was invisible to a search unless he
   * first guessed that it had been filed and switched tabs — which is not how
   * anybody uses a mailbox, and is not what the placeholder promises. So the
   * archive is only *excluded* while he is browsing: type something and the
   * whole correspondence is in scope. The Archived tab still means archived,
   * because there it is the question being asked rather than a filter on it.
   */
  if (query.lens === 'archived') where.push('l.archived_at IS NOT NULL')
  else if (query.search === '') where.push('l.archived_at IS NULL')

  if (query.lens === 'starred') where.push('l.starred = true')
  if (query.lens === 'unread') where.push('unread.n > 0')

  if (query.search !== '') {
    values.push(`%${query.search}%`)
    const p = `$${values.length}`

    where.push(
      `(l.name ILIKE ${p} OR l.email ILIKE ${p} OR l.company ILIKE ${p} OR l.message ILIKE ${p}
        OR EXISTS (SELECT 1 FROM lead_messages m WHERE m.lead_id = l.id
                    AND (m.subject ILIKE ${p} OR m.body ILIKE ${p}))
        OR EXISTS (SELECT 1 FROM lead_attachments a WHERE a.lead_id = l.id
                    AND a.filename ILIKE ${p}))`,
    )
  }

  values.push(query.limit)

  const result = await getDb().query<RowShape>(
    `SELECT l.id, l.name, l.email, l.company, l.language, l.source, l.starred,
            l.archived_at, l.last_message_at,
            COALESCE(last.subject, '') AS subject,
            COALESCE(NULLIF(last.body, ''), l.message) AS preview,
            last.direction AS last_direction,
            unread.n AS unread_count,
            COALESCE(att.n, 0) AS attachment_count
       FROM leads l
       LEFT JOIN LATERAL (
         SELECT m.subject, m.body, m.direction
           FROM lead_messages m
          WHERE m.lead_id = l.id
          ORDER BY m.sent_at DESC
          LIMIT 1
       ) last ON true
       LEFT JOIN LATERAL (
         SELECT (CASE WHEN l.read_at IS NULL AND btrim(l.message) <> '' THEN 1 ELSE 0 END)
              + (SELECT count(*) FROM lead_messages m
                  WHERE m.lead_id = l.id AND m.direction = 'IN' AND m.read_at IS NULL) AS n
       ) unread ON true
       LEFT JOIN LATERAL (
         SELECT count(*) AS n FROM lead_attachments a WHERE a.lead_id = l.id
       ) att ON true
      WHERE ${where.join(' AND ')}
      ORDER BY l.last_message_at DESC
      LIMIT $${values.length};`,
    values,
  )

  return result.rows.map(project)
}

/* -------------------------------------------------------------------------- */
/* One person                                                                 */
/* -------------------------------------------------------------------------- */

type PersonShape = {
  id: string
  name: string
  email: string
  phone: string | null
  company: string | null
  language: InboxLanguage
  source: PersonSource
  service_interest: string
  budget_band: string
  timeline: string
  message: string
  created_at: Date
  read_at: Date | null
  archived_at: Date | null
  starred: boolean
  unread: boolean
}

export const getPerson = async (id: string): Promise<Person> => {
  const result = await getDb().query<PersonShape>(
    `SELECT l.id, l.name, l.email, l.phone, l.company, l.language, l.source,
            l.service_interest, l.budget_band, l.timeline, l.message,
            l.created_at, l.read_at, l.archived_at, l.starred,
            (l.read_at IS NULL AND btrim(l.message) <> '')
              OR EXISTS (SELECT 1 FROM lead_messages m
                          WHERE m.lead_id = l.id AND m.direction = 'IN' AND m.read_at IS NULL)
              AS unread
       FROM leads l WHERE l.id = $1;`,
    [id],
  )

  const row = result.rows[0]

  if (!row) throw notFoundError('That person is not in the inbox')

  const [messages, notes] = await Promise.all([listMessages(id), listNotes(id)])

  // Only what the form actually collected. An empty row of labels with no
  // values reads as a broken screen.
  const facts = [
    ['Service', row.service_interest],
    ['Budget', row.budget_band],
    ['Timeline', row.timeline],
  ]
    .filter(([, value]) => value.trim() !== '')
    .map(([label, value]) => ({ label, value }))

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: emptyToNull(row.phone),
    company: emptyToNull(row.company),
    language: row.language,
    source: row.source,
    firstMessage: row.message,
    facts,
    createdAt: toIsoRequired(row.created_at),
    starred: row.starred,
    archived: row.archived_at !== null,
    unread: row.unread,
    messages,
    notes,
  }
}


/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

export const updatePerson = async (id: string, input: PersonWriteInput): Promise<Person> => {
  const result = await getDb().query<{ id: string }>(
    `UPDATE leads
        SET name = $2, email = $3, phone = NULLIF($4, ''), company = NULLIF($5, ''),
            language = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 RETURNING id;`,
    [id, input.name, input.email, input.phone, input.company, input.language],
  )

  if (!result.rows[0]) throw notFoundError('That person is not in the inbox')

  return getPerson(id)
}

export const setStarred = async (id: string, starred: boolean): Promise<Person> => {
  await getDb().query('UPDATE leads SET starred = $2 WHERE id = $1;', [id, starred])

  return getPerson(id)
}

/**
 * Filing, and taking back out.
 *
 * Nothing archives itself. He chose that a message stays where it is after he
 * answers — so this is always a button he pressed, never a consequence of
 * having replied.
 */
export const setArchived = async (id: string, archived: boolean): Promise<Person> => {
  await getDb().query(
    `UPDATE leads SET archived_at = ${archived ? 'CURRENT_TIMESTAMP' : 'NULL'},
            updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
    [id],
  )

  return getPerson(id)
}

/**
 * Read, or back to unread.
 *
 * Nothing calls this on open. Merely opening a conversation used to mark it
 * read, so a message could be filed as answered without ever being looked at.
 * Marking read is an act with its own button.
 */
export const setRead = async (id: string, read: boolean): Promise<Person> => {
  const db = getDb()
  const stamp = read ? 'COALESCE(read_at, CURRENT_TIMESTAMP)' : 'NULL'

  await db.query(`UPDATE leads SET read_at = ${stamp} WHERE id = $1;`, [id])
  await db.query(
    `UPDATE lead_messages SET read_at = ${stamp} WHERE lead_id = $1 AND direction = 'IN';`,
    [id],
  )

  return getPerson(id)
}

/* -------------------------------------------------------------------------- */
/* Notes — about the person, never about one letter                           */
/* -------------------------------------------------------------------------- */

const listNotes = async (personId: string): Promise<Note[]> => {
  const result = await getDb().query<{
    id: string
    body: string
    created_at: Date
    updated_at: Date
  }>(
    'SELECT id, body, created_at, updated_at FROM lead_notes WHERE lead_id = $1 ORDER BY created_at DESC;',
    [personId],
  )

  return result.rows.map((row) => ({
    id: row.id,
    body: row.body,
    createdAt: toIsoRequired(row.created_at),
    updatedAt: toIsoRequired(row.updated_at),
  }))
}

export const addNote = async (personId: string, input: NoteInput): Promise<Person> => {
  const result = await getDb().query<{ id: string }>(
    'INSERT INTO lead_notes (lead_id, body) VALUES ($1, $2) RETURNING id;',
    [personId, input.body],
  )

  if (!result.rows[0]) throw notFoundError('That person is not in the inbox')

  return getPerson(personId)
}

export const updateNote = async (
  personId: string,
  noteId: string,
  input: NoteInput,
): Promise<Person> => {
  await getDb().query(
    'UPDATE lead_notes SET body = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND lead_id = $2;',
    [noteId, personId, input.body],
  )

  return getPerson(personId)
}

export const deleteNote = async (personId: string, noteId: string): Promise<Person> => {
  await getDb().query('DELETE FROM lead_notes WHERE id = $1 AND lead_id = $2;', [noteId, personId])

  return getPerson(personId)
}
