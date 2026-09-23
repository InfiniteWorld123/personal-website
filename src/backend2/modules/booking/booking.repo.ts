import type { TypeTexts } from '../../contracts/booking.contract'
import { getDb } from '../../db/client'

/**
 * Every statement Booking runs, against `0010_booking.sql`. No rules here.
 * Queries run one at a time, never in parallel.
 */

const toNumber = (value: unknown): number => Number(value ?? 0)

/* ---------------------------------------------------------------- settings */

export type SettingsRow = {
  min_notice_minutes: number
  window_days: number
  change_limit_hours: number
  reminder_minutes: number
}

export const readSettings = async (): Promise<SettingsRow> => {
  const { rows } = await getDb().query<SettingsRow>('SELECT * FROM v2_booking_settings WHERE id = 1')

  return rows[0] ?? { min_notice_minutes: 1440, window_days: 60, change_limit_hours: 12, reminder_minutes: 1440 }
}

export const writeSettings = async (input: SettingsRow): Promise<void> => {
  await getDb().query(
    `INSERT INTO v2_booking_settings (id, min_notice_minutes, window_days, change_limit_hours, reminder_minutes)
     VALUES (1, $1, $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET min_notice_minutes = $1, window_days = $2, change_limit_hours = $3,
       reminder_minutes = $4, updated_at = CURRENT_TIMESTAMP`,
    [input.min_notice_minutes, input.window_days, input.change_limit_hours, input.reminder_minutes],
  )
}

/* ------------------------------------------------------------------- types */

export type TypeRow = {
  id: string
  slug: string
  position: number
  enabled: boolean
  duration_minutes: number
  buffer_minutes: number
  slot_step_minutes: number
  methods: Array<'video' | 'in_person' | 'phone'>
  texts: Partial<TypeTexts>
  updated_at: Date
}

export const listTypes = async (input: { limit: number; offset: number }): Promise<{ rows: TypeRow[]; total: number }> => {
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string }>('SELECT count(*) AS total FROM v2_booking_types')
  const { rows } = await db.query<TypeRow>(
    'SELECT * FROM v2_booking_types ORDER BY position, id LIMIT $1 OFFSET $2',
    [input.limit, input.offset],
  )

  return { rows, total: toNumber(counted[0]?.total) }
}

export const enabledTypes = async (): Promise<TypeRow[]> => {
  const { rows } = await getDb().query<TypeRow>(
    'SELECT * FROM v2_booking_types WHERE enabled = true ORDER BY position, id LIMIT 100',
  )

  return rows
}

export const findType = async (id: string): Promise<TypeRow | null> => {
  const { rows } = await getDb().query<TypeRow>('SELECT * FROM v2_booking_types WHERE id = $1', [id])

  return rows[0] ?? null
}

export const findTypeBySlug = async (slug: string): Promise<TypeRow | null> => {
  const { rows } = await getDb().query<TypeRow>('SELECT * FROM v2_booking_types WHERE slug = $1', [slug])

  return rows[0] ?? null
}

export const insertType = async (input: {
  slug: string
  enabled: boolean
  durationMinutes: number
  bufferMinutes: number
  slotStepMinutes: number
  methods: string[]
  texts: TypeTexts
}): Promise<string> => {
  const db = getDb()

  await db.query(`SELECT pg_advisory_xact_lock(hashtext('v2_booking_types.position'))`)

  const { rows: next } = await db.query<{ next: number }>(
    'SELECT COALESCE(MAX(position), 0) + 1 AS next FROM v2_booking_types',
  )
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO v2_booking_types (slug, position, enabled, duration_minutes, buffer_minutes, slot_step_minutes, methods, texts)
     VALUES ($1, $2, $3, $4, $5, $6, $7::text[], $8::jsonb) RETURNING id`,
    [
      input.slug,
      next[0]!.next,
      input.enabled,
      input.durationMinutes,
      input.bufferMinutes,
      input.slotStepMinutes,
      input.methods,
      JSON.stringify(input.texts),
    ],
  )

  return rows[0]!.id
}

export const updateType = async (input: {
  id: string
  slug?: string
  enabled?: boolean
  durationMinutes?: number
  bufferMinutes?: number
  slotStepMinutes?: number
  methods?: string[]
  texts?: TypeTexts
}): Promise<void> => {
  const sets: string[] = []
  const values: unknown[] = [input.id]
  const set = (column: string, value: unknown, cast = '') => {
    values.push(value)
    sets.push(`${column} = $${values.length}${cast}`)
  }

  if (input.slug !== undefined) set('slug', input.slug)
  if (input.enabled !== undefined) set('enabled', input.enabled)
  if (input.durationMinutes !== undefined) set('duration_minutes', input.durationMinutes)
  if (input.bufferMinutes !== undefined) set('buffer_minutes', input.bufferMinutes)
  if (input.slotStepMinutes !== undefined) set('slot_step_minutes', input.slotStepMinutes)
  if (input.methods !== undefined) set('methods', input.methods, '::text[]')
  if (input.texts !== undefined) set('texts', JSON.stringify(input.texts), '::jsonb')

  await getDb().query(
    `UPDATE v2_booking_types SET ${[...sets, 'updated_at = CURRENT_TIMESTAMP'].join(', ')} WHERE id = $1`,
    values,
  )
}

export const deleteType = async (id: string): Promise<void> => {
  await getDb().query('DELETE FROM v2_booking_types WHERE id = $1', [id])
}

export const countUpcomingForType = async (typeId: string, now: Date): Promise<number> => {
  const { rows } = await getDb().query<{ total: string }>(
    `SELECT count(*) AS total FROM v2_booking_appointments
      WHERE type_id = $1 AND status = 'confirmed' AND ends_at > $2`,
    [typeId, now],
  )

  return toNumber(rows[0]?.total)
}

/* ------------------------------------------------------------ availability */

export type WeeklyRow = { weekday: number; start_minute: number; end_minute: number }
export type ExceptionRow = { on_date: string | Date; ranges: Array<{ startMinute: number; endMinute: number }>; note: string }

export const readWeekly = async (): Promise<WeeklyRow[]> => {
  const { rows } = await getDb().query<WeeklyRow>(
    'SELECT weekday, start_minute, end_minute FROM v2_booking_weekly_hours ORDER BY weekday, start_minute',
  )

  return rows
}

export const replaceWeekly = async (ranges: Array<{ weekday: number; startMinute: number; endMinute: number }>): Promise<void> => {
  const db = getDb()

  await db.query('DELETE FROM v2_booking_weekly_hours')

  for (const range of ranges) {
    await db.query(
      'INSERT INTO v2_booking_weekly_hours (weekday, start_minute, end_minute) VALUES ($1, $2, $3)',
      [range.weekday, range.startMinute, range.endMinute],
    )
  }
}

const dateText = (value: string | Date): string =>
  typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)

export const readExceptions = async (from: string, to: string): Promise<Array<ExceptionRow & { on_date: string }>> => {
  const { rows } = await getDb().query<ExceptionRow>(
    `SELECT to_char(on_date, 'YYYY-MM-DD') AS on_date, ranges, note FROM v2_booking_exceptions
      WHERE on_date >= $1::date AND on_date <= $2::date ORDER BY on_date LIMIT 400`,
    [from, to],
  )

  return rows.map((row) => ({ ...row, on_date: dateText(row.on_date) }))
}

/** Replaces every exception from `from` on; earlier ones stay as a record. */
export const replaceFutureExceptions = async (
  from: string,
  items: Array<{ date: string; ranges: Array<{ startMinute: number; endMinute: number }>; note: string }>,
): Promise<void> => {
  const db = getDb()

  await db.query('DELETE FROM v2_booking_exceptions WHERE on_date >= $1::date', [from])

  for (const item of items) {
    if (item.date < from) continue

    await db.query(
      'INSERT INTO v2_booking_exceptions (on_date, ranges, note) VALUES ($1::date, $2::jsonb, $3)',
      [item.date, JSON.stringify(item.ranges), item.note],
    )
  }
}

/* ------------------------------------------------------------ appointments */

export type AppointmentRow = {
  id: string
  reference: string
  manage_token_hash: string
  manage_nonce: string
  type_id: string | null
  type_name: string
  duration_minutes: number
  buffer_minutes: number
  method: 'video' | 'in_person' | 'phone'
  starts_at: Date
  ends_at: Date
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  source: 'public' | 'manual'
  outside_hours: boolean
  visitor_name: string
  visitor_email: string
  visitor_phone: string | null
  company: string
  subject_choice: string | null
  budget_choice: string | null
  note: string
  language: 'de' | 'en' | 'ar'
  visitor_timezone: string
  submission_id: string | null
  inbox_conversation_id: string | null
  invitation_sent_at: Date | null
  reminder_due_at: Date | null
  reminder_state: 'pending' | 'sent' | 'skipped' | 'failed' | 'cancelled'
  reminder_sent_at: Date | null
  cancelled_at: Date | null
  cancelled_by: 'visitor' | 'owner' | null
  cancel_reason_code: string | null
  cancel_reason_text: string | null
  video_meeting_id: string | null
  video_host_participant: string | null
  video_guest_participant: string | null
  video_ended_at: Date | null
  revision: number
  created_at: Date
  updated_at: Date
}

const COLUMNS = `a.*`

/** Confirmed appointments whose kept time touches this window. */
export const blockedBetween = async (input: {
  from: Date
  to: Date
  excludeId?: string
}): Promise<Array<{ start: Date; end: Date }>> => {
  const { rows } = await getDb().query<{ start: Date; end: Date }>(
    `SELECT lower(blocked) AS start, upper(blocked) AS end FROM v2_booking_appointments
      WHERE status = 'confirmed' AND blocked && tstzrange($1::timestamptz, $2::timestamptz, '[)') AND id <> $3
      ORDER BY lower(blocked)`,
    [input.from, input.to, input.excludeId ?? '00000000-0000-0000-0000-000000000000'],
  )

  return rows.map((row) => ({ start: new Date(row.start), end: new Date(row.end) }))
}

/** Serialises every write that takes time from the calendar. */
export const lockCalendar = async (): Promise<void> => {
  await getDb().query(`SELECT pg_advisory_xact_lock(hashtext('v2_booking_appointments.calendar'))`)
}

export const insertAppointment = async (input: {
  reference: string
  manageTokenHash: string
  manageNonce: string
  typeId: string
  typeName: string
  durationMinutes: number
  bufferMinutes: number
  method: string
  startsAt: Date
  endsAt: Date
  source: 'public' | 'manual'
  outsideHours: boolean
  visitorName: string
  visitorEmail: string
  visitorPhone: string | null
  company: string
  subject: string | null
  budget: string | null
  note: string
  language: string
  visitorTimeZone: string
  submissionId: string | null
  reminderDueAt: Date | null
  reminderState: 'pending' | 'skipped'
}): Promise<string> => {
  const { rows } = await getDb().query<{ id: string }>(
    `INSERT INTO v2_booking_appointments
       (reference, manage_token_hash, manage_nonce, type_id, type_name, duration_minutes, buffer_minutes, method,
        starts_at, ends_at, blocked, source, outside_hours, visitor_name, visitor_email, visitor_phone,
        company, subject_choice, budget_choice, note, language, visitor_timezone, submission_id,
        reminder_due_at, reminder_state)
     VALUES ($1, $2, $24, $3, $4, $5, $6, $7, $8, $9,
             tstzrange($8::timestamptz, $9::timestamptz + make_interval(mins => $6::int), '[)'),
             $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     RETURNING id`,
    [
      input.reference,
      input.manageTokenHash,
      input.typeId,
      input.typeName,
      input.durationMinutes,
      input.bufferMinutes,
      input.method,
      input.startsAt,
      input.endsAt,
      input.source,
      input.outsideHours,
      input.visitorName,
      input.visitorEmail,
      input.visitorPhone,
      input.company,
      input.subject,
      input.budget,
      input.note,
      input.language,
      input.visitorTimeZone,
      input.submissionId,
      input.reminderDueAt,
      input.reminderState,
      input.manageNonce,
    ],
  )

  return rows[0]!.id
}

export const findAppointment = async (id: string): Promise<AppointmentRow | null> => {
  const { rows } = await getDb().query<AppointmentRow>(`SELECT ${COLUMNS} FROM v2_booking_appointments a WHERE a.id = $1`, [id])

  return rows[0] ?? null
}

export const lockAppointment = async (id: string): Promise<AppointmentRow | null> => {
  const { rows } = await getDb().query<AppointmentRow>(
    `SELECT ${COLUMNS} FROM v2_booking_appointments a WHERE a.id = $1 FOR UPDATE`,
    [id],
  )

  return rows[0] ?? null
}

export const findByReference = async (reference: string): Promise<AppointmentRow | null> => {
  const { rows } = await getDb().query<AppointmentRow>(
    `SELECT ${COLUMNS} FROM v2_booking_appointments a WHERE a.reference = $1`,
    [reference],
  )

  return rows[0] ?? null
}

export const findBySubmission = async (submissionId: string): Promise<AppointmentRow | null> => {
  const { rows } = await getDb().query<AppointmentRow>(
    `SELECT ${COLUMNS} FROM v2_booking_appointments a WHERE a.submission_id = $1`,
    [submissionId],
  )

  return rows[0] ?? null
}

export const referenceExists = async (reference: string): Promise<boolean> => {
  const { rows } = await getDb().query('SELECT 1 FROM v2_booking_appointments WHERE reference = $1', [reference])

  return rows.length > 0
}

const likePattern = (query: string): string => `%${query.replace(/[\\%_]/gu, (match) => `\\${match}`)}%`

export const listAppointments = async (input: {
  from?: string
  to?: string
  status?: string
  typeId?: string
  method?: string
  q?: string
  limit: number
  offset: number
}): Promise<{ rows: AppointmentRow[]; total: number }> => {
  const where: string[] = []
  const values: unknown[] = []
  const add = (sql: (p: string) => string, value: unknown) => {
    values.push(value)
    where.push(sql(`$${values.length}`))
  }

  if (input.from) add((p) => `a.ends_at > ${p}`, input.from)
  if (input.to) add((p) => `a.starts_at < ${p}`, input.to)
  if (input.status) add((p) => `a.status = ${p}`, input.status)
  if (input.typeId) add((p) => `a.type_id = ${p}`, input.typeId)
  if (input.method) add((p) => `a.method = ${p}`, input.method)
  if (input.q) {
    add(
      (p) => `(a.visitor_name ILIKE ${p} OR a.visitor_email ILIKE ${p} OR a.reference ILIKE ${p} OR a.company ILIKE ${p})`,
      likePattern(input.q),
    )
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const db = getDb()
  const { rows: counted } = await db.query<{ total: string }>(
    `SELECT count(*) AS total FROM v2_booking_appointments a ${clause}`,
    values,
  )

  values.push(input.limit, input.offset)

  const { rows } = await db.query<AppointmentRow>(
    `SELECT ${COLUMNS} FROM v2_booking_appointments a ${clause}
      ORDER BY a.starts_at ASC, a.id ASC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  )

  return { rows, total: toNumber(counted[0]?.total) }
}

/** Updates the named columns; `blocked` follows the times whenever they change. */
export const updateAppointment = async (id: string, fields: Record<string, unknown>): Promise<void> => {
  const sets: string[] = []
  const values: unknown[] = [id]

  for (const [column, value] of Object.entries(fields)) {
    if (value === undefined) continue
    values.push(value)
    sets.push(`${column} = $${values.length}`)
  }

  if ('starts_at' in fields || 'ends_at' in fields) {
    sets.push(`blocked = tstzrange(COALESCE($${values.length + 1}::timestamptz, starts_at),
      COALESCE($${values.length + 2}::timestamptz, ends_at) + make_interval(mins => buffer_minutes), '[)')`)
    values.push(fields.starts_at ?? null, fields.ends_at ?? null)
  }

  await getDb().query(
    `UPDATE v2_booking_appointments
        SET ${[...sets, 'revision = revision + 1', 'updated_at = CURRENT_TIMESTAMP'].join(', ')}
      WHERE id = $1`,
    values,
  )
}

export const addHistory = async (input: {
  appointmentId: string
  actor: 'visitor' | 'owner' | 'system'
  kind: string
  details?: Record<string, unknown>
}): Promise<void> => {
  await getDb().query(
    'INSERT INTO v2_booking_history (appointment_id, actor, kind, details) VALUES ($1, $2, $3, $4::jsonb)',
    [input.appointmentId, input.actor, input.kind, JSON.stringify(input.details ?? {})],
  )
}

export const listHistory = async (appointmentId: string): Promise<Array<{ at: Date; actor: string; kind: string; details: Record<string, unknown> }>> => {
  const { rows } = await getDb().query<{ at: Date; actor: string; kind: string; details: Record<string, unknown> }>(
    `SELECT at, actor, kind, details FROM v2_booking_history WHERE appointment_id = $1
      ORDER BY at, id LIMIT 200`,
    [appointmentId],
  )

  return rows
}

/** Pending reminders whose time has come, claimed so no second run takes them. */
export const claimDueReminders = async (now: Date, limit: number): Promise<string[]> => {
  const { rows } = await getDb().query<{ id: string }>(
    `UPDATE v2_booking_appointments SET reminder_state = 'sent', reminder_sent_at = $1
      WHERE id IN (
        SELECT id FROM v2_booking_appointments
         WHERE reminder_state = 'pending' AND status = 'confirmed'
           AND reminder_due_at <= $1 AND starts_at > $1
           -- A manual appointment the visitor was never told about gets no reminder.
           AND (source = 'public' OR invitation_sent_at IS NOT NULL)
         ORDER BY reminder_due_at, id
         LIMIT $2
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id`,
    [now, limit],
  )

  return rows.map((row) => row.id)
}

/** A changed reminder time applies to every future reminder not yet sent. */
export const recomputePendingReminders = async (reminderMinutes: number, now: Date): Promise<void> => {
  await getDb().query(
    `UPDATE v2_booking_appointments
        SET reminder_due_at = starts_at - make_interval(mins => $1::int),
            reminder_state = CASE WHEN starts_at - make_interval(mins => $1::int) <= $2::timestamptz THEN 'skipped' ELSE 'pending' END
      WHERE status = 'confirmed' AND starts_at > $2 AND reminder_state IN ('pending', 'skipped')`,
    [reminderMinutes, now],
  )
}

/** Links an appointment to its Inbox conversation, without counting as an edit. */
export const setConversation = async (id: string, conversationId: string): Promise<void> => {
  await getDb().query(
    'UPDATE v2_booking_appointments SET inbox_conversation_id = $2 WHERE id = $1 AND inbox_conversation_id IS NULL',
    [id, conversationId],
  )
}

export const setReminderState = async (id: string, state: 'failed' | 'sent'): Promise<void> => {
  await getDb().query('UPDATE v2_booking_appointments SET reminder_state = $2 WHERE id = $1', [id, state])
}
