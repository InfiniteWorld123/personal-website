import {
  type AppointmentDetail,
  type AppointmentSummary,
  BUDGET_LABELS,
  type BookingLanguage,
  type BookingMethod,
  CANCEL_REASON_LABELS,
  type CancelReason,
  METHOD_LABELS,
  OWNER_TIME_ZONE,
  SUBJECT_LABELS,
  type SlotsResult,
  type VisitorAppointment,
} from '../../contracts/booking.contract'
import { type Page, toPage } from '../../contracts/pagination.contract'
import { readAuthSecret } from '../../auth/config'
import { constantTimeEqual, hashOpaqueSecret, keyedHash, newOpaqueSecret } from '../../auth/crypto'
import { withTransaction } from '../../db/client'
import {
  bookingLinkInvalid,
  bookingTooFar,
  bookingTooSoon,
  changeDeadlinePassed,
  conflict,
  notFound,
  slotUnavailable,
  validationFailed,
} from '../../http/error'
import { sendSystemEmail } from '../inbox/send.service'
import { typeNameIn } from './booking.config.service'
import { bookingMail, type MailKind } from './booking.mail'
import * as repo from './booking.repo'
import { type HourRange, berlinDatesCovering, computeCandidates, isWithinHours } from './booking.slots'
import { addDays, addMinutes, localParts, zonedToInstant, formatForEmail } from './booking.time'

/**
 * Appointments: booking, changing, cancelling, and the emails that go with
 * each — through the Inbox, so the visitor's answers land in one conversation
 * per appointment.
 *
 * The double-booking rule is enforced twice. Inside a transaction that holds
 * the calendar lock, the requested time is checked against the live calendar;
 * and the database's exclusion constraint refuses an overlap even if a future
 * code path forgets to ask.
 */

/* ------------------------------------------------------------- credentials */

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const newReference = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8))

  return `YW-${Array.from(bytes, (byte) => REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]).join('')}`
}

/**
 * The private credential is derived from a stored nonce with the server
 * secret, so a later email can repeat the link, while a copy of the database
 * alone still cannot open anyone's appointment.
 */
const tokenFor = (nonce: string): string => keyedHash(readAuthSecret(), `booking-manage:${nonce}`)

const newCredential = (): { nonce: string; token: string; hash: string } => {
  const nonce = newOpaqueSecret()
  const token = tokenFor(nonce)

  return { nonce, token, hash: hashOpaqueSecret(token) }
}

const siteUrl = (): string => (process.env.PUBLIC_SITE_URL?.trim() || 'https://yamanwarda.de').replace(/\/+$/u, '')

/** The credential rides in the fragment, which browsers never send to a server or a Referer. */
export const linksFor = (row: repo.AppointmentRow): { manageUrl: string; roomUrl: string } => {
  const token = tokenFor(row.manage_nonce)

  return {
    manageUrl: `${siteUrl()}/${row.language}/booking/manage/${row.reference}#${token}`,
    roomUrl: `${siteUrl()}/${row.language}/booking/room/${row.reference}#${token}`,
  }
}

/** One lookup for every visitor route. Wrong token and unknown reference answer alike. */
export const authoriseVisitor = async (reference: string, token: string): Promise<repo.AppointmentRow> => {
  const row = /^YW-[A-Z0-9]{8}$/u.test(reference) ? await repo.findByReference(reference) : null
  const provided = hashOpaqueSecret(token.trim())

  if (!row || !token.trim() || !constantTimeEqual(provided, row.manage_token_hash)) throw bookingLinkInvalid()

  return row
}

/* ---------------------------------------------------------------- calendar */

type Calendar = {
  weekly: Array<{ weekday: number; startMinute: number; endMinute: number }>
  exceptions: Map<string, HourRange[]>
}

const loadCalendar = async (fromDate: string, toDate: string): Promise<Calendar> => {
  const weekly = (await repo.readWeekly()).map((row) => ({
    weekday: row.weekday,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
  }))
  const exceptions = new Map<string, HourRange[]>()

  for (const row of await repo.readExceptions(fromDate, toDate)) exceptions.set(row.on_date, row.ranges)

  return { weekly, exceptions }
}

type VisitorWindow = { earliest: Date; latest: Date }

const visitorWindow = (settings: repo.SettingsRow, now: Date): VisitorWindow => ({
  earliest: addMinutes(now, settings.min_notice_minutes),
  latest: addMinutes(now, settings.window_days * 24 * 60),
})

/** The type as it applies to one appointment: its own snapshot, the type's step. */
const slotTypeOf = (type: repo.TypeRow | null, row?: repo.AppointmentRow) => ({
  durationMinutes: row?.duration_minutes ?? type!.duration_minutes,
  bufferMinutes: row?.buffer_minutes ?? type!.buffer_minutes,
  slotStepMinutes: type?.slot_step_minutes ?? 30,
})

/** Whether exactly this start is offered to a visitor right now. */
const isOfferedStart = async (input: {
  start: Date
  slotType: { durationMinutes: number; bufferMinutes: number; slotStepMinutes: number }
  window: VisitorWindow
  excludeId?: string
}): Promise<boolean> => {
  const dates = berlinDatesCovering(input.start, input.start)
  const calendar = await loadCalendar(dates[0]!, dates.at(-1)!)
  const blocked = await repo.blockedBetween({
    from: addMinutes(input.start, -24 * 60),
    to: addMinutes(input.start, 24 * 60 + input.slotType.durationMinutes),
    excludeId: input.excludeId,
  })

  return computeCandidates({
    dates,
    type: input.slotType,
    ...calendar,
    blocked,
    earliest: input.window.earliest,
    latest: input.window.latest,
  }).some((candidate) => candidate.start.getTime() === input.start.getTime())
}

const refuseOutsideWindow = (start: Date, window: VisitorWindow) => {
  if (start < window.earliest) throw bookingTooSoon()
  if (start > window.latest) throw bookingTooFar()
}

/** The overlap refusal the database gives, turned into the answer a person can act on. */
const asSlotError = (error: unknown): never => {
  if ((error as { code?: string })?.code === '23P01') throw slotUnavailable()

  throw error
}

const reminderFor = (start: Date, settings: repo.SettingsRow, now: Date) => {
  const due = addMinutes(start, -settings.reminder_minutes)

  return due <= now ? { reminderDueAt: due, reminderState: 'skipped' as const } : { reminderDueAt: due, reminderState: 'pending' as const }
}

/* ------------------------------------------------------------------- slots */

export const availableSlots = async (input: {
  typeSlug: string
  method: BookingMethod
  from: string
  days: number
  timeZone: string
  now?: Date
}): Promise<SlotsResult> => {
  const now = input.now ?? new Date()
  const type = await repo.findTypeBySlug(input.typeSlug)

  if (!type || !type.enabled || !type.methods.includes(input.method)) throw notFound('That appointment type is not offered')

  const settings = await repo.readSettings()
  const window = visitorWindow(settings, now)
  const start = zonedToInstant(input.from, 0, input.timeZone) ?? zonedToInstant(input.from, 60, input.timeZone)!
  const end = zonedToInstant(addDays(input.from, input.days), 0, input.timeZone) ?? addMinutes(start, input.days * 1440)
  const slotType = slotTypeOf(type)

  const collect = async (from: Date, to: Date) => {
    const dates = berlinDatesCovering(from, to)
    const calendar = await loadCalendar(dates[0]!, dates.at(-1)!)
    const blocked = await repo.blockedBetween({ from: addMinutes(from, -1440), to: addMinutes(to, 1440) })

    return computeCandidates({ dates, type: slotType, ...calendar, blocked, earliest: window.earliest, latest: window.latest })
      .filter((candidate) => candidate.start >= from && candidate.start < to)
  }

  const candidates = await collect(start, end)
  const days = Array.from({ length: input.days }, (_, index) => addDays(input.from, index)).map((date) => ({
    date,
    slots: candidates
      .filter((candidate) => localParts(candidate.start, input.timeZone).date === date)
      .map((candidate) => ({
        startsAt: candidate.start.toISOString(),
        endsAt: candidate.end.toISOString(),
        localDate: date,
        localTime: localParts(candidate.start, input.timeZone).time,
      })),
  }))

  let nextAvailableDate: string | null = null

  if (candidates.length === 0 && end < window.latest) {
    // Looked for in bounded steps, so an empty fortnight costs a few queries at most.
    for (let from = end; from < window.latest && !nextAvailableDate; from = addMinutes(from, 14 * 1440)) {
      const next = (await collect(from, addMinutes(from, 14 * 1440)))[0]

      if (next) nextAvailableDate = localParts(next.start, input.timeZone).date
    }
  }

  return { timeZone: input.timeZone, days, nextAvailableDate }
}

/* ------------------------------------------------------------------ emails */

const factsFor = (row: repo.AppointmentRow): Record<string, string> => {
  const facts: Record<string, string> = {
    Appointment: `${row.type_name}, ${row.duration_minutes} min · ${formatForEmail(row.starts_at, OWNER_TIME_ZONE, 'en')}`,
    Method: METHOD_LABELS[row.method],
    Reference: row.reference,
  }

  if (row.subject_choice) facts['What is it about'] = SUBJECT_LABELS[row.subject_choice as keyof typeof SUBJECT_LABELS] ?? row.subject_choice
  if (row.budget_choice) facts['Budget range'] = BUDGET_LABELS[row.budget_choice as keyof typeof BUDGET_LABELS] ?? row.budget_choice
  if (row.company) facts.Company = row.company
  if (row.method === 'phone' && row.visitor_phone) facts.Phone = row.visitor_phone

  return facts
}

/**
 * One email to the visitor, in the appointment's conversation.
 *
 * The appointment row is locked while the conversation is found or made, so
 * two emails for one appointment can never open two conversations. A failed
 * delivery is recorded — on the Inbox message, where Retry lives, and in the
 * history — and never undoes the appointment.
 */
export const emailVisitor = async (input: {
  appointmentId: string
  kind: MailKind
  reason?: string | null
  cancelledBy?: 'visitor' | 'owner'
}): Promise<'accepted' | 'failed'> =>
  withTransaction(async () => {
    const row = await repo.lockAppointment(input.appointmentId)

    if (!row) throw notFound('That appointment does not exist')

    const settings = await repo.readSettings()
    const links = linksFor(row)
    const mail = bookingMail({
      kind: input.kind,
      language: row.language,
      visitorName: row.visitor_name,
      typeName: row.type_name,
      method: row.method,
      startsAt: new Date(row.starts_at),
      timeZone: row.visitor_timezone,
      reference: row.reference,
      manageUrl: links.manageUrl,
      roomUrl: links.roomUrl,
      phone: row.visitor_phone,
      cancelledBy: input.cancelledBy,
      reason: input.reason,
      changeLimitHours: settings.change_limit_hours,
    })

    const sent = await sendSystemEmail({
      conversationId: row.inbox_conversation_id,
      origin: 'booking',
      originRef: row.id,
      facts: factsFor(row),
      to: row.visitor_email,
      toName: row.visitor_name,
      subject: mail.subject,
      text: mail.text,
      language: row.language,
    })

    if (!row.inbox_conversation_id) await repo.setConversation(row.id, sent.conversationId)

    const status = sent.message.delivery?.status === 'accepted' ? 'accepted' : 'failed'

    await repo.addHistory({
      appointmentId: row.id,
      actor: 'system',
      kind: status === 'accepted' ? `${input.kind}_sent` : 'email_failed',
      details: { email: input.kind, messageId: sent.message.id },
    })

    return status
  })

/* ----------------------------------------------------------------- mapping */

const iso = (value: Date | null): string | null => (value ? new Date(value).toISOString() : null)

const toSummary = (row: repo.AppointmentRow): AppointmentSummary => ({
  id: row.id,
  reference: row.reference,
  typeId: row.type_id,
  typeName: row.type_name,
  method: row.method,
  startsAt: iso(row.starts_at)!,
  endsAt: iso(row.ends_at)!,
  status: row.status,
  source: row.source,
  outsideHours: row.outside_hours,
  visitorName: row.visitor_name,
  visitorEmail: row.visitor_email,
  language: row.language,
  reminderState: row.reminder_state,
  inboxConversationId: row.inbox_conversation_id,
  invitationSentAt: iso(row.invitation_sent_at),
})

const cancelReasonText = (row: repo.AppointmentRow): string | null => {
  if (!row.cancel_reason_code && !row.cancel_reason_text) return null
  if (row.cancelled_by === 'owner') return row.cancel_reason_text

  const label = CANCEL_REASON_LABELS[row.cancel_reason_code as CancelReason] ?? row.cancel_reason_code

  return row.cancel_reason_text ? `${label}: ${row.cancel_reason_text}` : label
}

const toDetail = async (row: repo.AppointmentRow): Promise<AppointmentDetail> => ({
  ...toSummary(row),
  visitorPhone: row.visitor_phone,
  visitorTimeZone: row.visitor_timezone,
  company: row.company,
  subject: row.subject_choice,
  budget: row.budget_choice,
  note: row.note,
  durationMinutes: row.duration_minutes,
  bufferMinutes: row.buffer_minutes,
  cancelledAt: iso(row.cancelled_at),
  cancelledBy: row.cancelled_by,
  cancelReason: cancelReasonText(row),
  reminderDueAt: iso(row.reminder_due_at),
  reminderSentAt: iso(row.reminder_sent_at),
  videoEndedAt: iso(row.video_ended_at),
  revision: row.revision,
  history: (await repo.listHistory(row.id)).map((entry) => ({
    at: new Date(entry.at).toISOString(),
    actor: entry.actor as 'visitor' | 'owner' | 'system',
    kind: entry.kind,
    details: entry.details,
  })),
})

export const toVisitor = (row: repo.AppointmentRow, settings: repo.SettingsRow, now: Date = new Date()): VisitorAppointment => {
  const deadline = addMinutes(new Date(row.starts_at), -settings.change_limit_hours * 60)

  return {
    reference: row.reference,
    typeName: row.type_name,
    typeSlug: null,
    method: row.method,
    startsAt: iso(row.starts_at)!,
    endsAt: iso(row.ends_at)!,
    status: row.status,
    language: row.language,
    visitorName: row.visitor_name,
    canChange: row.status === 'confirmed' && now <= deadline,
    changeDeadline: deadline.toISOString(),
  }
}

const visitorView = async (row: repo.AppointmentRow, now?: Date): Promise<VisitorAppointment> => {
  const view = toVisitor(row, await repo.readSettings(), now)
  const type = row.type_id ? await repo.findType(row.type_id) : null

  return { ...view, typeSlug: type?.enabled ? type.slug : null }
}

/* --------------------------------------------------------- public booking */

export type BookingReceipt = {
  appointment: VisitorAppointment
  manageUrl: string
  roomUrl: string | null
  /** False when the confirmation email could not be sent; the page says so. */
  confirmationSent: boolean
}

const uniqueReference = async (): Promise<string> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const reference = newReference()

    if (!(await repo.referenceExists(reference))) return reference
  }

  throw new Error('Could not allocate a booking reference')
}

const receiptFor = async (row: repo.AppointmentRow, confirmationSent: boolean): Promise<BookingReceipt> => {
  const links = linksFor(row)

  return {
    appointment: await visitorView(row),
    manageUrl: links.manageUrl,
    roomUrl: row.method === 'video' ? links.roomUrl : null,
    confirmationSent,
  }
}

export const createPublicAppointment = async (
  input: {
    submissionId: string
    typeSlug: string
    method: BookingMethod
    startsAt: string
    timeZone: string
    language: BookingLanguage
    name: string
    email: string
    phone: string
    company: string
    subject: string | null
    budget: string | null
    note: string
  },
  now: Date = new Date(),
): Promise<BookingReceipt> => {
  const repeat = await repo.findBySubmission(input.submissionId)

  if (repeat) return receiptFor(repeat, true)

  const type = await repo.findTypeBySlug(input.typeSlug)

  if (!type || !type.enabled) throw notFound('That appointment type is not offered')

  if (!type.methods.includes(input.method)) {
    throw validationFailed('That way of meeting is not offered for this appointment', {
      issues: [{ field: 'method', message: 'Choose one of the offered ways to meet' }],
    })
  }

  const start = new Date(input.startsAt)
  const settings = await repo.readSettings()
  const window = visitorWindow(settings, now)

  refuseOutsideWindow(start, window)

  const outcome = await withTransaction(async () => {
    await repo.lockCalendar()

    // A second submit racing the first: it waited on the lock, and now finds it.
    const raced = await repo.findBySubmission(input.submissionId)

    if (raced) return { id: raced.id, created: false }

    if (!(await isOfferedStart({ start, slotType: slotTypeOf(type), window }))) throw slotUnavailable()

    const credential = newCredential()

    const created = await repo
      .insertAppointment({
        reference: await uniqueReference(),
        manageTokenHash: credential.hash,
        manageNonce: credential.nonce,
        typeId: type.id,
        typeName: typeNameIn(type, input.language),
        durationMinutes: type.duration_minutes,
        bufferMinutes: type.buffer_minutes,
        method: input.method,
        startsAt: start,
        endsAt: addMinutes(start, type.duration_minutes),
        source: 'public',
        outsideHours: false,
        visitorName: input.name,
        visitorEmail: input.email,
        visitorPhone: input.phone.trim() || null,
        company: input.company,
        subject: input.subject,
        budget: input.budget,
        note: input.note,
        language: input.language,
        visitorTimeZone: input.timeZone,
        submissionId: input.submissionId,
        ...reminderFor(start, settings, now),
      })
      .catch(asSlotError)

    await repo.addHistory({ appointmentId: created, actor: 'visitor', kind: 'created', details: { source: 'public' } })

    return { id: created, created: true }
  })

  // Only the request that made the appointment sends its confirmation.
  if (!outcome.created) return receiptFor((await repo.findAppointment(outcome.id))!, true)

  const sent = await emailVisitor({ appointmentId: outcome.id, kind: 'confirmation' })

  return receiptFor((await repo.findAppointment(outcome.id))!, sent === 'accepted')
}

/* --------------------------------------------------------- visitor changes */

const refusePastDeadline = (row: repo.AppointmentRow, settings: repo.SettingsRow, now: Date) => {
  if (row.status !== 'confirmed') throw conflict('This appointment is no longer active.')

  const deadline = addMinutes(new Date(row.starts_at), -settings.change_limit_hours * 60)

  if (now > deadline) throw changeDeadlinePassed()
}

export const getVisitorAppointment = async (reference: string, token: string): Promise<VisitorAppointment> =>
  visitorView(await authoriseVisitor(reference, token))

export const rescheduleByVisitor = async (
  input: { reference: string; token: string; startsAt: string; timeZone?: string },
  now: Date = new Date(),
): Promise<VisitorAppointment> => {
  const found = await authoriseVisitor(input.reference, input.token)
  const settings = await repo.readSettings()
  const start = new Date(input.startsAt)

  await withTransaction(async () => {
    await repo.lockCalendar()

    const row = (await repo.lockAppointment(found.id))!

    refusePastDeadline(row, settings, now)

    const window = visitorWindow(settings, now)

    refuseOutsideWindow(start, window)

    const type = row.type_id ? await repo.findType(row.type_id) : null
    const slotType = slotTypeOf(type, row)

    if (!(await isOfferedStart({ start, slotType, window, excludeId: row.id }))) throw slotUnavailable()

    const reminder = reminderFor(start, settings, now)

    await repo
      .updateAppointment(row.id, {
        starts_at: start,
        ends_at: addMinutes(start, row.duration_minutes),
        reminder_due_at: reminder.reminderDueAt,
        reminder_state: reminder.reminderState,
        reminder_sent_at: null,
        visitor_timezone: input.timeZone,
      })
      .catch(asSlotError)

    await repo.addHistory({
      appointmentId: row.id,
      actor: 'visitor',
      kind: 'rescheduled',
      details: { from: iso(row.starts_at), to: start.toISOString() },
    })
  })

  await emailVisitor({ appointmentId: found.id, kind: 'rescheduled' })

  return visitorView((await repo.findAppointment(found.id))!, now)
}

export const cancelByVisitor = async (
  input: { reference: string; token: string; reason: CancelReason; text: string },
  now: Date = new Date(),
): Promise<VisitorAppointment> => {
  const found = await authoriseVisitor(input.reference, input.token)
  const settings = await repo.readSettings()

  await withTransaction(async () => {
    const row = (await repo.lockAppointment(found.id))!

    refusePastDeadline(row, settings, now)

    await repo.updateAppointment(row.id, {
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: 'visitor',
      cancel_reason_code: input.reason,
      cancel_reason_text: input.text.trim() || null,
      reminder_state: row.reminder_state === 'sent' ? 'sent' : 'cancelled',
    })
    await repo.addHistory({ appointmentId: row.id, actor: 'visitor', kind: 'cancelled', details: { reason: input.reason } })
  })

  await emailVisitor({ appointmentId: found.id, kind: 'cancelled', cancelledBy: 'visitor' })

  return visitorView((await repo.findAppointment(found.id))!, now)
}

/* ------------------------------------------------------------ owner side */

export const listAppointments = async (input: {
  from?: string
  to?: string
  status?: string
  typeId?: string
  method?: string
  q?: string
  page: number
  pageSize: number
}): Promise<Page<AppointmentSummary>> => {
  const { rows, total } = await repo.listAppointments({
    ...input,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })

  return toPage({ items: rows.map(toSummary), page: input.page, pageSize: input.pageSize, total })
}

export const getAppointment = async (id: string): Promise<AppointmentDetail> => {
  const row = await repo.findAppointment(id)

  if (!row) throw notFound('That appointment does not exist')

  return toDetail(row)
}

const withinOwnerHours = async (start: Date, durationMinutes: number): Promise<boolean> => {
  const date = localParts(start, OWNER_TIME_ZONE).date
  const calendar = await loadCalendar(addDays(date, -1), addDays(date, 1))

  return isWithinHours({ start, durationMinutes, ...calendar })
}

/**
 * The owner's own appointment. The visitor limits do not apply — it may be a
 * minute from now, or outside normal hours with a warning — but it can never
 * overlap a confirmed appointment.
 */
export const createManualAppointment = async (
  input: {
    typeId: string
    method: BookingMethod
    startsAt: string
    language: BookingLanguage
    visitorTimeZone: string
    name: string
    email: string
    phone: string
    company: string
    subject: string | null
    budget: string | null
    note: string
    sendInvitation: boolean
  },
  now: Date = new Date(),
): Promise<AppointmentDetail & { invitation: 'accepted' | 'failed' | 'not_sent' }> => {
  const type = await repo.findType(input.typeId)

  if (!type) throw notFound('That appointment type does not exist')

  if (!type.methods.includes(input.method)) {
    throw validationFailed('This type does not allow that way of meeting', {
      issues: [{ field: 'method', message: 'Choose one of the ways this type allows' }],
    })
  }

  const start = new Date(input.startsAt)

  if (start <= now) {
    throw validationFailed('Choose a time in the future', { issues: [{ field: 'startsAt', message: 'Choose a time in the future' }] })
  }

  const settings = await repo.readSettings()
  const outsideHours = !(await withinOwnerHours(start, type.duration_minutes))

  const id = await withTransaction(async () => {
    await repo.lockCalendar()

    const end = addMinutes(start, type.duration_minutes)
    const clash = await repo.blockedBetween({ from: start, to: addMinutes(end, type.buffer_minutes) })

    if (clash.length > 0) throw slotUnavailable('That time overlaps a confirmed appointment.')

    const credential = newCredential()
    const created = await repo
      .insertAppointment({
        reference: await uniqueReference(),
        manageTokenHash: credential.hash,
        manageNonce: credential.nonce,
        typeId: type.id,
        typeName: typeNameIn(type, input.language),
        durationMinutes: type.duration_minutes,
        bufferMinutes: type.buffer_minutes,
        method: input.method,
        startsAt: start,
        endsAt: end,
        source: 'manual',
        outsideHours,
        visitorName: input.name,
        visitorEmail: input.email,
        visitorPhone: input.phone.trim() || null,
        company: input.company,
        subject: input.subject,
        budget: input.budget,
        note: input.note,
        language: input.language,
        visitorTimeZone: input.visitorTimeZone,
        submissionId: null,
        ...reminderFor(start, settings, now),
      })
      .catch(asSlotError)

    await repo.addHistory({ appointmentId: created, actor: 'owner', kind: 'created', details: { source: 'manual', outsideHours } })

    return created
  })

  const invitation = input.sendInvitation ? (await sendInvitation(id)).delivery : 'not_sent'

  return { ...(await getAppointment(id)), invitation }
}

/**
 * Sends a manual appointment's invitation, once. The claim is written under
 * the row lock before the email goes, so a double-click finds it claimed.
 */
export const sendInvitation = async (
  id: string,
  now: Date = new Date(),
): Promise<{ alreadySent: boolean; delivery: 'accepted' | 'failed' | 'not_sent' }> => {
  const claimed = await withTransaction(async () => {
    const row = await repo.lockAppointment(id)

    if (!row) throw notFound('That appointment does not exist')
    if (row.status !== 'confirmed' || new Date(row.ends_at) <= now) throw conflict('Only an upcoming appointment can be sent.')
    if (row.invitation_sent_at || row.source === 'public') return false

    await repo.updateAppointment(row.id, { invitation_sent_at: now })

    return true
  })

  if (!claimed) return { alreadySent: true, delivery: 'not_sent' }

  return { alreadySent: false, delivery: await emailVisitor({ appointmentId: id, kind: 'invitation' }) }
}

const refuseStale = (row: repo.AppointmentRow, revision: number) => {
  if (row.revision !== revision) {
    throw conflict('This appointment changed somewhere else. Reload it before saving.', { revision: row.revision })
  }
}

export const patchAppointment = async (
  id: string,
  input: {
    revision: number
    startsAt?: string
    name?: string
    email?: string
    phone?: string
    company?: string
    note?: string
    notify: boolean
  },
  now: Date = new Date(),
): Promise<AppointmentDetail> => {
  let rescheduled = false

  await withTransaction(async () => {
    await repo.lockCalendar()

    const row = await repo.lockAppointment(id)

    if (!row) throw notFound('That appointment does not exist')

    refuseStale(row, input.revision)

    const fields: Record<string, unknown> = {}

    if (input.name !== undefined) fields.visitor_name = input.name
    if (input.email !== undefined) fields.visitor_email = input.email
    if (input.company !== undefined) fields.company = input.company
    if (input.note !== undefined) fields.note = input.note
    if (input.phone !== undefined) {
      if (row.method === 'phone' && input.phone.trim() === '') {
        throw validationFailed('A phone call needs a phone number', { issues: [{ field: 'phone', message: 'Enter a phone number' }] })
      }

      fields.visitor_phone = input.phone.trim() || null
    }

    if (input.startsAt !== undefined && new Date(input.startsAt).getTime() !== new Date(row.starts_at).getTime()) {
      if (row.status !== 'confirmed') throw conflict('Only a confirmed appointment can be moved.')

      const start = new Date(input.startsAt)

      if (start <= now) {
        throw validationFailed('Choose a time in the future', { issues: [{ field: 'startsAt', message: 'Choose a time in the future' }] })
      }

      const end = addMinutes(start, row.duration_minutes)
      const clash = await repo.blockedBetween({ from: start, to: addMinutes(end, row.buffer_minutes), excludeId: row.id })

      if (clash.length > 0) throw slotUnavailable('That time overlaps a confirmed appointment.')

      const reminder = reminderFor(start, await repo.readSettings(), now)

      Object.assign(fields, {
        starts_at: start,
        ends_at: end,
        outside_hours: !(await withinOwnerHours(start, row.duration_minutes)),
        reminder_due_at: reminder.reminderDueAt,
        reminder_state: reminder.reminderState,
        reminder_sent_at: null,
      })
      rescheduled = true
    }

    if (Object.keys(fields).length === 0) return

    await repo.updateAppointment(row.id, fields).catch(asSlotError)
    await repo.addHistory({
      appointmentId: row.id,
      actor: 'owner',
      kind: rescheduled ? 'rescheduled' : 'details_changed',
      details: rescheduled ? { from: iso(row.starts_at), to: (fields.starts_at as Date).toISOString() } : { fields: Object.keys(fields) },
    })
  })

  const row = (await repo.findAppointment(id))!

  // A manual appointment the visitor has not been told about gets no change email.
  if (rescheduled && input.notify && (row.source === 'public' || row.invitation_sent_at)) {
    await emailVisitor({ appointmentId: id, kind: 'rescheduled' })
  }

  return getAppointment(id)
}

export const cancelByOwner = async (
  id: string,
  input: { reason: string; notify: boolean },
  now: Date = new Date(),
): Promise<AppointmentDetail> => {
  const row = await withTransaction(async () => {
    const found = await repo.lockAppointment(id)

    if (!found) throw notFound('That appointment does not exist')
    if (found.status !== 'confirmed') throw conflict('Only a confirmed appointment can be cancelled.')

    await repo.updateAppointment(found.id, {
      status: 'cancelled',
      cancelled_at: now,
      cancelled_by: 'owner',
      cancel_reason_code: null,
      cancel_reason_text: input.reason,
      reminder_state: found.reminder_state === 'sent' ? 'sent' : 'cancelled',
    })
    await repo.addHistory({ appointmentId: found.id, actor: 'owner', kind: 'cancelled', details: {} })

    return found
  })

  if (input.notify && (row.source === 'public' || row.invitation_sent_at)) {
    await emailVisitor({ appointmentId: id, kind: 'cancelled', cancelledBy: 'owner', reason: input.reason })
  }

  return getAppointment(id)
}

export const setOutcome = async (
  id: string,
  status: 'completed' | 'no_show',
  now: Date = new Date(),
): Promise<AppointmentDetail> => {
  await withTransaction(async () => {
    const row = await repo.lockAppointment(id)

    if (!row) throw notFound('That appointment does not exist')
    if (row.status === 'cancelled') throw conflict('A cancelled appointment cannot be marked.')
    if (new Date(row.starts_at) > now) throw conflict('An appointment can be marked only once it has started.')

    await repo.updateAppointment(row.id, { status })
    await repo.addHistory({ appointmentId: row.id, actor: 'owner', kind: status, details: {} })
  })

  return getAppointment(id)
}

/* --------------------------------------------------------------- reminders */

/**
 * Sends every reminder that is due. Safe to run from several places at once:
 * each appointment is claimed before its email goes, and a claimed reminder is
 * never sent again. Run by `bun run db2:booking:send-reminders`.
 */
export const sendDueReminders = async (now: Date = new Date()): Promise<{ sent: number; failed: number }> => {
  let sent = 0
  let failed = 0

  for (;;) {
    const ids = await withTransaction(() => repo.claimDueReminders(now, 25))

    if (ids.length === 0) break

    for (const id of ids) {
      const result = await emailVisitor({ appointmentId: id, kind: 'reminder' }).catch(() => 'failed' as const)

      if (result === 'accepted') sent += 1
      else {
        failed += 1
        await repo.setReminderState(id, 'failed')
      }
    }
  }

  return { sent, failed }
}
