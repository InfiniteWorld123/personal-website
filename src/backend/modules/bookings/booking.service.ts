import { getDb, withTransaction, type Db } from '#/backend/db/client'
import {
  conflictError,
  internalError,
  notFoundError,
  validationError,
} from '#/backend/shared/error'
import { enforceRateLimit } from '#/backend/shared/rate-limit'
import type {
  AdminAvailability,
  AdminBookingDetail,
  AdminBookingList,
  AdminBookingType,
  PublicBooking,
  PublicBookingType,
  BookingSlotResponse,
} from '#/shared/types/booking.types'
import {
  BOOKING_LANGUAGES,
  BOOKING_PAGE_SIZE,
  OWNER_TIMEZONE,
  type AdminBookingCancelInput,
  type AdminBookingCreateInput,
  type AvailabilityExceptionWriteInput,
  type AvailabilityRulesWriteInput,
  type BookingCancelInput,
  type BookingCreateInput,
  type BookingFilterInput,
  type BookingLanguage,
  type BookingRescheduleInput,
  type BookingStatusWriteInput,
  type BookingTypeWriteInput,
  type SlotQueryInput,
} from '#/shared/validation/booking.validation'
import {
  dayInZone,
  eachDay,
  generateSlots,
  groupByVisitorDay,
  instantForWallTime,
  shiftDay,
  type ExistingBooking,
  type ScheduleException,
  type ScheduleRule,
  type SlotGenerationInput,
} from './availability.service'
import {
  sendOwnerBookingMail,
  sendVisitorBookingMail,
  type BookingMailInput,
} from './booking.mail'
import { createBookingReference, createManageToken, hashManageToken } from './booking.token'

/** Postgres' unique-violation code. A taken slug is a conflict, not a 500. */
const UNIQUE_VIOLATION = '23505'

/**
 * Postgres' exclusion-violation code. This is what `bookings_no_overlap`
 * raises, and translating it is the whole double-booking defence: two
 * visitors who pressed the button at the same instant reach here, and exactly
 * one of them is told the time was taken.
 */
const EXCLUSION_VIOLATION = '23P01'

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null ? (error as { code?: string }).code : undefined

const errorConstraint = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null ? (error as { constraint?: string }).constraint : undefined

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000

/** How many bookings one address may make in a day before it is refused. */
const MAX_BOOKINGS_PER_EMAIL_PER_DAY = 3
const MAX_BOOKINGS_PER_IP_PER_WINDOW = 12
const MAX_MANAGEMENT_ACTIONS_PER_WINDOW = 10

type BookingCreateContext = { clientIp?: string }
type BookingCreateServiceInput = Omit<BookingCreateInput, 'turnstileToken'>

/**
 * Serializes business decisions that cannot be expressed as a simple table
 * constraint. The names are stable and sorted, which keeps two concurrent
 * requests from taking the same pair in a different order and deadlocking.
 */
const lockKeys = async (db: Db, keys: string[]): Promise<void> => {
  for (const key of [...new Set(keys)].sort()) {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0));', [key])
  }
}

/* -------------------------------------------------------------------------- */
/* Booking types                                                              */
/* -------------------------------------------------------------------------- */

type TypeRow = {
  id: string
  slug: string
  duration_minutes: number
  buffer_before_minutes: number
  buffer_after_minutes: number
  minimum_notice_minutes: number
  booking_window_days: number
  slot_interval_minutes: number
  max_per_day: number | null
  location_kind: 'VIDEO' | 'PHONE' | 'IN_PERSON'
  location_value: string | null
  price_cents: number
  currency: string
  is_active: boolean
  sort_order: number
}

const TYPE_COLUMNS = `
  bt.id, bt.slug, bt.duration_minutes, bt.buffer_before_minutes, bt.buffer_after_minutes,
  bt.minimum_notice_minutes, bt.booking_window_days, bt.slot_interval_minutes, bt.max_per_day,
  bt.location_kind, bt.location_value, bt.price_cents, bt.currency, bt.is_active, bt.sort_order
`

const loadActiveType = async (slug: string): Promise<TypeRow> => {
  const result = await getDb().query<TypeRow>(
    `SELECT ${TYPE_COLUMNS} FROM booking_types bt WHERE bt.slug = $1 AND bt.is_active;`,
    [slug],
  )

  const row = result.rows[0]
  if (!row) throw notFoundError('That kind of call cannot be booked')

  return row
}

/** Active call types in one language, for the public chooser. */
export const listPublicBookingTypes = async (
  language: BookingLanguage,
): Promise<PublicBookingType[]> => {
  const result = await getDb().query<{
    slug: string
    name: string
    description: string
    duration_minutes: number
    location_kind: PublicBookingType['locationKind']
    price_cents: number
    currency: string
  }>(
    `SELECT bt.slug, t.name, t.description, bt.duration_minutes, bt.location_kind,
            bt.price_cents, bt.currency
       FROM booking_types bt
       JOIN booking_type_translations t
         ON t.booking_type_id = bt.id AND t.language = $1
      WHERE bt.is_active
      ORDER BY bt.sort_order, bt.duration_minutes, bt.id;`,
    [language],
  )

  return result.rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    description: row.description,
    durationMinutes: row.duration_minutes,
    locationKind: row.location_kind,
    priceCents: row.price_cents,
    currency: row.currency,
  }))
}

/* -------------------------------------------------------------------------- */
/* Slots                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Everything the generator needs, read for one range of the owner's days.
 *
 * The confirmed bookings are read across *every* call type on purpose: one
 * person cannot be on two calls at once, whatever kind they are. The rules and
 * exceptions are narrowed to this type plus the ones that apply to all types.
 */
const loadGenerationInput = async (
  type: TypeRow,
  fromDate: string,
  toDate: string,
  now: number,
): Promise<SlotGenerationInput> => {
  const db = getDb()

  // A day either side, so a visitor far enough east or west still sees the
  // edges of their own day filled in.
  const scanFrom = shiftDay(fromDate, -1)
  const scanTo = shiftDay(toDate, 1)

  const [rules, exceptions, existing] = await Promise.all([
    db.query<ScheduleRule>(
      `SELECT weekday, starts_at_minute AS "startsAtMinute", ends_at_minute AS "endsAtMinute"
         FROM availability_rules
        WHERE booking_type_id IS NULL OR booking_type_id = $1;`,
      [type.id],
    ),
    db.query<ScheduleException>(
      `SELECT to_char(on_date, 'YYYY-MM-DD') AS "onDate",
              kind,
              starts_at_minute AS "startsAtMinute",
              ends_at_minute AS "endsAtMinute"
         FROM availability_exceptions
        WHERE (booking_type_id IS NULL OR booking_type_id = $1)
          AND on_date BETWEEN $2::date AND $3::date;`,
      [type.id, scanFrom, scanTo],
    ),
    db.query<{ starts_at: Date; blocked_starts_at: Date; blocked_ends_at: Date }>(
      `SELECT starts_at, blocked_starts_at, blocked_ends_at
         FROM bookings
        WHERE status = 'CONFIRMED'
          AND blocked_ends_at > $1::timestamptz
          AND blocked_starts_at < $2::timestamptz;`,
      [`${scanFrom}T00:00:00Z`, `${shiftDay(scanTo, 1)}T00:00:00Z`],
    ),
  ])

  const existingBookings: ExistingBooking[] = existing.rows.map((row) => ({
    startsAt: row.starts_at.getTime(),
    blockedStartsAt: row.blocked_starts_at.getTime(),
    blockedEndsAt: row.blocked_ends_at.getTime(),
  }))

  return {
    rules: rules.rows,
    exceptions: exceptions.rows,
    existing: existingBookings,
    durationMinutes: type.duration_minutes,
    bufferBeforeMinutes: type.buffer_before_minutes,
    bufferAfterMinutes: type.buffer_after_minutes,
    slotIntervalMinutes: type.slot_interval_minutes,
    minimumNoticeMinutes: type.minimum_notice_minutes,
    maxPerDay: type.max_per_day,
    ownerTimezone: OWNER_TIMEZONE,
    fromDate: scanFrom,
    toDate: scanTo,
    latestStart: now + type.booking_window_days * MS_PER_DAY,
    now,
  }
}

/**
 * The calendar a visitor sees. The requested range is clamped to the type's
 * own booking window rather than rejected, so a hand-edited URL narrows what
 * is shown and never produces an error page.
 */
export const getSlots = async (
  slug: string,
  language: BookingLanguage,
  query: SlotQueryInput,
): Promise<BookingSlotResponse> => {
  const type = await loadActiveType(slug)
  const now = Date.now()

  const ownerToday = dayInZone(now, OWNER_TIMEZONE)
  const ownerLastBookableDate = dayInZone(
    now + type.booking_window_days * MS_PER_DAY,
    OWNER_TIMEZONE,
  )
  // The calendar is labelled on the visitor's clock, while availability lives
  // on the owner's clock. Convert the visible range to a slightly wider owner
  // range before generating; filtering owner dates directly loses Sunday/Monday
  // edge slots for Honolulu, Tokyo, and every zone in between.
  const visitorToday = dayInZone(now, query.timezone)
  const lastBookableDate = dayInZone(now + type.booking_window_days * MS_PER_DAY, query.timezone)
  const visibleFrom = query.from < visitorToday ? visitorToday : query.from
  const visibleTo = query.to > lastBookableDate ? lastBookableDate : query.to

  const visitorStart = instantForWallTime(visibleFrom, 0, query.timezone)
  const visitorEnd = instantForWallTime(visibleTo, 1440, query.timezone)
  const requestedOwnerFrom = dayInZone(
    (visitorStart ?? Date.parse(`${visibleFrom}T00:00:00.000Z`)) - MS_PER_DAY,
    OWNER_TIMEZONE,
  )
  const requestedOwnerTo = dayInZone(
    (visitorEnd ?? Date.parse(`${visibleTo}T23:59:59.999Z`)) + MS_PER_DAY,
    OWNER_TIMEZONE,
  )
  const fromDate = requestedOwnerFrom < ownerToday ? ownerToday : requestedOwnerFrom
  const toDate = requestedOwnerTo > ownerLastBookableDate ? ownerLastBookableDate : requestedOwnerTo

  const translation = await getDb().query<{ name: string; description: string }>(
    `SELECT name, description FROM booking_type_translations
      WHERE booking_type_id = $1 AND language = $2;`,
    [type.id, language],
  )

  const bookingType: PublicBookingType = {
    slug: type.slug,
    name: translation.rows[0]?.name ?? type.slug,
    description: translation.rows[0]?.description ?? '',
    durationMinutes: type.duration_minutes,
    locationKind: type.location_kind,
    priceCents: type.price_cents,
    currency: type.currency,
  }

  // A range that ends before it starts is an empty calendar, not a failure.
  if (eachDay(fromDate, toDate).length === 0) {
    return { bookingType, timezone: query.timezone, lastBookableDate, days: [] }
  }

  const input = await loadGenerationInput(type, fromDate, toDate, now)
  const slots = generateSlots(input)

  // Generation scanned a day either side; only hand back the days that were
  // asked for, as they read where the visitor is.
  const days = groupByVisitorDay(slots, type.duration_minutes, query.timezone).filter(
    (day) => day.date >= visibleFrom && day.date <= visibleTo,
  )

  return { bookingType, timezone: query.timezone, lastBookableDate, days }
}

/* -------------------------------------------------------------------------- */
/* Creating a booking                                                         */
/* -------------------------------------------------------------------------- */

type BookingRow = {
  id: string
  reference: string
  starts_at: Date
  ends_at: Date
  visitor_name: string
  visitor_email: string
  visitor_timezone: string
  visitor_note: string
  language: BookingLanguage
  status: PublicBooking['status']
  location_kind: PublicBooking['locationKind']
  location_value: string | null
}

const LOCATION_FALLBACK: Record<TypeRow['location_kind'], string> = {
  VIDEO: 'Video call',
  PHONE: 'Phone call',
  IN_PERSON: 'In person',
}

const mailInputFor = (
  booking: BookingRow,
  durationMinutes: number,
  typeName: string,
  manageToken?: string,
): BookingMailInput => ({
  reference: booking.reference,
  startsAt: booking.starts_at,
  endsAt: booking.ends_at,
  durationMinutes,
  visitorName: booking.visitor_name,
  visitorEmail: booking.visitor_email,
  visitorTimezone: booking.visitor_timezone,
  visitorNote: booking.visitor_note,
  language: booking.language,
  typeName,
  locationLabel: booking.location_value ?? LOCATION_FALLBACK[booking.location_kind],
  manageToken,
})

/**
 * One address may only book so often. Cheap, and it is the difference between
 * a public write endpoint and an open invitation to fill the calendar.
 */
const assertWithinRateLimit = async (
  db: Db,
  email: string,
): Promise<void> => {
  await enforceRateLimit({
    db,
    scope: 'booking-email',
    identity: email.toLowerCase(),
    limit: MAX_BOOKINGS_PER_EMAIL_PER_DAY,
    windowSeconds: 24 * 60 * 60,
    message: 'That is a lot of bookings for one day. Write to me instead.',
  })

}

/** Finds the person behind this address, or records them as a new lead. */
const attachLead = async (input: BookingCreateServiceInput): Promise<string> => {
  const db = getDb()

  const existing = await db.query<{ id: string }>(
    'SELECT id FROM leads WHERE lower(email) = lower($1) ORDER BY created_at LIMIT 1;',
    [input.email],
  )

  const found = existing.rows[0]?.id

  if (found) {
    // Only fills gaps. A lead that has been worked on in the admin must not be
    // overwritten by a form, and its status is never touched here.
    await db.query(
      `UPDATE leads
          SET name = CASE WHEN name = '' THEN $2 ELSE name END,
              phone = COALESCE(NULLIF(phone, ''), NULLIF($3, '')),
              company = COALESCE(NULLIF(company, ''), NULLIF($4, '')),
              service_interest = CASE WHEN service_interest = '' THEN $5 ELSE service_interest END,
              budget_band = CASE WHEN budget_band = '' THEN $6 ELSE budget_band END,
              timeline = CASE WHEN timeline = '' THEN $7 ELSE timeline END,
              -- Back to the top of the inbox (B4). Someone who books is
              -- waiting for an answer, even if their last message was filed.
              read_at = NULL,
              archived_at = NULL,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1;`,
      [
        found,
        input.name,
        input.phone ?? '',
        input.company,
        input.serviceInterest,
        input.budgetBand,
        input.timeline,
      ],
    )

    return found
  }

  const created = await db.query<{ id: string }>(
    `INSERT INTO leads
       (source, name, email, phone, company, service_interest, budget_band, timeline,
        message, language)
     VALUES ('BOOKING', $1, $2, NULLIF($3, ''), NULLIF($4, ''), $5, $6, $7, $8, $9)
     RETURNING id;`,
    [
      input.name,
      input.email,
      input.phone ?? '',
      input.company,
      input.serviceInterest,
      input.budgetBand,
      input.timeline,
      input.note,
      input.language,
    ],
  )

  const id = created.rows[0]?.id
  if (!id) throw internalError('The booking could not be recorded')

  return id
}

type InsertBookingInput = {
  type: TypeRow
  /** Null only if a lead was deleted out from under an existing booking. */
  leadId: string | null
  startsAt: number
  visitor: {
    name: string
    email: string
    phone: string
    timezone: string
    note: string
    language: BookingLanguage
  }
  rescheduledFromId?: string
}

/**
 * The insert itself, with the reference retried on collision. Anything else —
 * and in particular the overlap — is handed back to the caller.
 */
const insertBooking = async (
  input: InsertBookingInput,
  cancelTokenHash: string,
): Promise<BookingRow> => {
  const { type, startsAt } = input
  const endsAt = startsAt + type.duration_minutes * MS_PER_MINUTE
  const blockedStartsAt = startsAt - type.buffer_before_minutes * MS_PER_MINUTE
  const blockedEndsAt = endsAt + type.buffer_after_minutes * MS_PER_MINUTE

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const result = await getDb().query<BookingRow>(
        `INSERT INTO bookings
           (booking_type_id, lead_id, reference, starts_at, ends_at,
            buffer_before_minutes, buffer_after_minutes, blocked_starts_at, blocked_ends_at,
            visitor_name, visitor_email, visitor_phone, visitor_timezone, visitor_note,
            language, cancel_token_hash, rescheduled_from_id,
            manage_token_expires_at, price_cents, currency, location_kind, location_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULLIF($12, ''), $13, $14, $15,
                 $16, $17, $18, $19, $20, $21, $22)
         RETURNING id, reference, starts_at, ends_at, visitor_name, visitor_email,
                   visitor_timezone, visitor_note, language, status, location_kind, location_value;`,
        [
          type.id,
          input.leadId,
          createBookingReference(),
          new Date(startsAt),
          new Date(endsAt),
          type.buffer_before_minutes,
          type.buffer_after_minutes,
          new Date(blockedStartsAt),
          new Date(blockedEndsAt),
          input.visitor.name,
          input.visitor.email,
          input.visitor.phone,
          input.visitor.timezone,
          input.visitor.note,
          input.visitor.language,
          cancelTokenHash,
          input.rescheduledFromId ?? null,
          new Date(startsAt),
          type.price_cents,
          type.currency,
          type.location_kind,
          type.location_value,
        ],
      )

      const row = result.rows[0]
      if (!row) throw internalError('The booking could not be created')

      return row
    } catch (error: unknown) {
      if (errorCode(error) === EXCLUSION_VIOLATION) {
        throw conflictError('Somebody just took that time. Pick another one.')
      }

      // Only a reference collision is worth another try, and it is one in
      // millions. Every other unique violation is a real problem.
      const retryable =
        errorCode(error) === UNIQUE_VIOLATION && errorConstraint(error) === 'bookings_reference_key'

      if (!retryable || attempt === 3) throw error
    }
  }

  throw internalError('The booking could not be created')
}

/**
 * Checks that the instant the visitor sent is one this schedule would have
 * offered. The calendar was drawn minutes ago and anything can have changed
 * since — and a request that never opened the calendar at all reaches the same
 * check. This is the rules defence; `bookings_no_overlap` is the race defence,
 * and neither replaces the other.
 */
const assertSlotIsOffered = async (type: TypeRow, startsAt: number, now: number): Promise<void> => {
  const day = dayInZone(startsAt, OWNER_TIMEZONE)
  const input = await loadGenerationInput(type, day, day, now)

  if (!generateSlots(input).includes(startsAt)) {
    throw conflictError('That time is not available any more')
  }
}

export const createBooking = async (
  input: BookingCreateServiceInput,
  context: BookingCreateContext = {},
): Promise<PublicBooking> => {
  // The hidden field. A person never sees it, so a person never fills it.
  if (input.website.trim() !== '') {
    throw validationError('That booking could not be accepted')
  }

  const startsAt = Date.parse(input.startsAt)

  if (Number.isNaN(startsAt)) throw validationError('That is not a valid time')

  const token = createManageToken()
  const tokenHash = await hashManageToken(token)

  // This is an attempt limit, so it must commit independently even when the
  // requested slot or a later business check fails and rolls back.
  if (context.clientIp) {
    await enforceRateLimit({
      scope: 'booking-ip',
      identity: context.clientIp,
      limit: MAX_BOOKINGS_PER_IP_PER_WINDOW,
      windowSeconds: 15 * 60,
      message: 'Please wait a few minutes before trying again.',
    })
  }

  const { booking, type, typeName } = await withTransaction(async (db) => {
    const ownerDay = dayInZone(startsAt, OWNER_TIMEZONE)
    // The email lock makes lead attachment and the per-email limit atomic. The
    // owner-day lock makes maxPerDay atomic across different visitor emails.
    await lockKeys(db, [`booking-day:${ownerDay}`, `booking-email:${input.email.toLowerCase()}`])
    await assertWithinRateLimit(db, input.email)

    const type = await loadActiveType(input.bookingTypeSlug)
    await assertSlotIsOffered(type, startsAt, Date.now())
    const leadId = await attachLead(input)

    const created = await insertBooking(
      {
        type,
        leadId,
        startsAt,
        visitor: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? '',
          timezone: input.timezone,
          note: input.note,
          language: input.language,
        },
      },
      tokenHash,
    )

    const translation = await getDb().query<{ name: string }>(
      'SELECT name FROM booking_type_translations WHERE booking_type_id = $1 AND language = $2;',
      [type.id, input.language],
    )

    return { booking: created, type, typeName: translation.rows[0]?.name ?? type.slug }
  })

  // After the commit, never inside it: the record is the thing that matters,
  // and a mail failure must not roll a confirmed booking back.
  const mail = mailInputFor(booking, type.duration_minutes, typeName, token)

  await Promise.all([sendVisitorBookingMail(mail, false), sendOwnerBookingMail(mail, false)])

  return toPublicBooking(booking, type, typeName, token)
}

const toPublicBooking = (
  row: BookingRow,
  type: Pick<TypeRow, 'slug' | 'duration_minutes'>,
  typeName: string,
  manageToken?: string,
): PublicBooking => ({
  reference: row.reference,
  status: row.status,
  startsAt: row.starts_at.toISOString(),
  endsAt: row.ends_at.toISOString(),
  timezone: row.visitor_timezone,
  language: row.language,
  visitorName: row.visitor_name,
  visitorEmail: row.visitor_email,
  locationKind: row.location_kind,
  locationValue: row.location_value,
  bookingType: { slug: type.slug, name: typeName, durationMinutes: type.duration_minutes },
  ...(manageToken ? { manageToken } : {}),
})

/* -------------------------------------------------------------------------- */
/* Managing a booking through the emailed link                                */
/* -------------------------------------------------------------------------- */

const loadTypeById = async (id: string): Promise<TypeRow> => {
  const result = await getDb().query<TypeRow>(
    `SELECT ${TYPE_COLUMNS} FROM booking_types bt WHERE bt.id = $1;`,
    [id],
  )

  const row = result.rows[0]
  if (!row) throw internalError('That booking points at a call type that is gone')

  return row
}

type ManagedBooking = {
  row: BookingRow
  leadId: string | null
  tokenHash: string
  type: TypeRow
  typeName: string
}

/**
 * Looks a booking up by its reference *and* the token's fingerprint. Both have
 * to match: the reference appears in an email subject line and is not a
 * secret, and the token is never stored in a form anybody can read back.
 *
 * The call type is fetched separately rather than joined. Both tables carry an
 * `id` and a `location_kind`, and one flat row would quietly hand back the
 * type's values under the booking's names.
 */
const loadByToken = async (
  reference: string,
  token: string,
  { forUpdate = false }: { forUpdate?: boolean } = {},
): Promise<ManagedBooking> => {
  const hash = await hashManageToken(token)

  const result = await getDb().query<BookingRow & { booking_type_id: string; lead_id: string | null }>(
    `SELECT b.id, b.reference, b.starts_at, b.ends_at, b.visitor_name, b.visitor_email,
            b.visitor_timezone, b.visitor_note, b.language, b.status,
            b.location_kind, b.location_value, b.booking_type_id, b.lead_id
       FROM bookings b
      WHERE b.reference = $1
        AND b.cancel_token_hash = $2
        AND b.manage_token_expires_at > CURRENT_TIMESTAMP
      ${forUpdate ? 'FOR UPDATE' : ''};`,
    [reference, hash],
  )

  const row = result.rows[0]
  if (!row) throw notFoundError('That booking does not exist, or the link has expired')

  const type = await loadTypeById(row.booking_type_id)

  const translation = await getDb().query<{ name: string }>(
    'SELECT name FROM booking_type_translations WHERE booking_type_id = $1 AND language = $2;',
    [type.id, row.language],
  )

  return {
    row,
    leadId: row.lead_id,
    tokenHash: hash,
    type,
    typeName: translation.rows[0]?.name ?? type.slug,
  }
}

export const getBookingByToken = async (
  reference: string,
  token: string,
): Promise<PublicBooking> => {
  const { row, type, typeName } = await loadByToken(reference, token)

  return toPublicBooking(row, type, typeName)
}

export const cancelBookingByToken = async (
  reference: string,
  token: string,
  input: BookingCancelInput,
): Promise<PublicBooking> => {
  await enforceRateLimit({
    scope: 'booking-manage',
    identity: await hashManageToken(token),
    limit: MAX_MANAGEMENT_ACTIONS_PER_WINDOW,
    windowSeconds: 15 * 60,
    message: 'Please wait a few minutes before trying again.',
  })

  const { row, type, typeName } = await withTransaction(async (db) => {
    const managed = await loadByToken(reference, token, { forUpdate: true })

    if (managed.row.status !== 'CONFIRMED') {
      throw conflictError('That call can no longer be cancelled')
    }
    if (managed.row.starts_at.getTime() < Date.now()) {
      throw conflictError('That call has already happened')
    }

    const cancelled = await db.query<{ id: string }>(
      `UPDATE bookings
          SET status = 'CANCELLED',
              cancelled_at = CURRENT_TIMESTAMP,
              cancelled_by = 'VISITOR',
              cancellation_reason = $2,
              manage_token_expires_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'CONFIRMED'
        RETURNING id;`,
      [managed.row.id, input.reason],
    )

    if (!cancelled.rows[0]) throw conflictError('That call can no longer be cancelled')

    return managed
  })

  const mail = { ...mailInputFor(row, type.duration_minutes, typeName), cancellationReason: input.reason }

  await Promise.all([sendVisitorBookingMail(mail, true), sendOwnerBookingMail(mail, true)])

  return { ...toPublicBooking(row, type, typeName), status: 'CANCELLED' }
}

/**
 * Rescheduling is a cancellation and a new booking, linked by
 * `rescheduled_from_id`. The old row keeps its own history rather than being
 * edited, for the reason an issued invoice is never edited: what happened,
 * happened.
 */
export const rescheduleBookingByToken = async (
  reference: string,
  manageToken: string,
  input: BookingRescheduleInput,
): Promise<PublicBooking> => {
  const startsAt = Date.parse(input.startsAt)
  if (Number.isNaN(startsAt)) throw validationError('That is not a valid time')

  const token = createManageToken()
  const tokenHash = await hashManageToken(token)

  await enforceRateLimit({
    scope: 'booking-manage',
    identity: await hashManageToken(manageToken),
    limit: MAX_MANAGEMENT_ACTIONS_PER_WINDOW,
    windowSeconds: 15 * 60,
    message: 'Please wait a few minutes before trying again.',
  })

  const { previous, created, type, typeName } = await withTransaction(async (db) => {
    const managed = await loadByToken(reference, manageToken, { forUpdate: true })

    if (managed.row.status !== 'CONFIRMED') throw conflictError('That call can no longer be moved')
    if (managed.row.starts_at.getTime() < Date.now()) {
      throw conflictError('That call has already happened')
    }

    await lockKeys(db, [`booking-day:${dayInZone(startsAt, OWNER_TIMEZONE)}`])

    // Released first, inside the transaction, so the new time may touch the
    // old one's buffers — moving a call by fifteen minutes is the common case.
    // If the insert then fails, the rollback puts the original back untouched.
    const cancelled = await db.query<{ id: string }>(
      `UPDATE bookings
          SET status = 'CANCELLED',
              cancelled_at = CURRENT_TIMESTAMP,
              cancelled_by = 'VISITOR',
              cancellation_reason = 'Rescheduled',
              manage_token_expires_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND status = 'CONFIRMED'
        RETURNING id;`,
      [managed.row.id],
    )

    if (!cancelled.rows[0]) throw conflictError('That call can no longer be moved')

    await assertSlotIsOffered(managed.type, startsAt, Date.now())

    const created = await insertBooking(
      {
        type: managed.type,
        leadId: managed.leadId,
        startsAt,
        visitor: {
          name: managed.row.visitor_name,
          email: managed.row.visitor_email,
          phone: '',
          timezone: input.timezone,
          note: managed.row.visitor_note,
          language: managed.row.language,
        },
        rescheduledFromId: managed.row.id,
      },
      tokenHash,
    )

    return { previous: managed, created, type: managed.type, typeName: managed.typeName }
  })

  const oldMail = mailInputFor(previous.row, type.duration_minutes, typeName)
  const mail = mailInputFor(created, type.duration_minutes, typeName, token)

  // The note is for the owner only: the visitor is the one who moved it, and
  // is about to read the new time in the very next mail — in their own
  // language, which this German line is not.
  await Promise.all([
    sendVisitorBookingMail(oldMail, true),
    sendOwnerBookingMail(
      { ...oldMail, cancellationReason: 'Verschoben — der neue Termin steht in der nächsten Mail.' },
      true,
    ),
  ])
  await Promise.all([sendVisitorBookingMail(mail, false), sendOwnerBookingMail(mail, false)])

  return toPublicBooking(created, type, typeName, token)
}

/**
 * A call the owner places himself: on the phone with somebody who would
 * rather be sent a time than look for one, or after an email that ended in
 * "just book me in".
 *
 * It is the same booking as any other — same record, same reference, same
 * confirmation with the calendar file and the link to move or cancel it — so
 * the client can manage it without ever writing to him again. What it skips
 * is what the public form needs and the owner does not: the bot check, the
 * rate limits, the honeypot, and, when he says so, the published hours.
 */
export const createBookingAsAdmin = async (
  input: AdminBookingCreateInput,
): Promise<PublicBooking> => {
  const startsAt = Date.parse(input.startsAt)

  if (Number.isNaN(startsAt)) throw validationError('That is not a valid time')
  if (startsAt < Date.now()) throw validationError('That time has already passed')

  const token = createManageToken()
  const tokenHash = await hashManageToken(token)

  const { booking, type, typeName } = await withTransaction(async (db) => {
    const ownerDay = dayInZone(startsAt, OWNER_TIMEZONE)
    await lockKeys(db, [`booking-day:${ownerDay}`, `booking-email:${input.email.toLowerCase()}`])

    const type = await loadActiveType(input.bookingTypeSlug)

    // Off-hours is the owner's call to make; a double booking never is. That
    // one is held by `bookings_no_overlap`, which this cannot reach past.
    if (!input.anyTime) await assertSlotIsOffered(type, startsAt, Date.now())

    const leadId = await attachLead({
      ...input,
      phone: input.phone ?? '',
      serviceInterest: '',
      budgetBand: '',
      timeline: '',
      website: '',
    })

    const created = await insertBooking(
      {
        type,
        leadId,
        startsAt,
        visitor: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? '',
          timezone: input.timezone,
          note: input.note,
          language: input.language,
        },
      },
      tokenHash,
    )

    const translation = await getDb().query<{ name: string }>(
      'SELECT name FROM booking_type_translations WHERE booking_type_id = $1 AND language = $2;',
      [type.id, input.language],
    )

    return { booking: created, type, typeName: translation.rows[0]?.name ?? type.slug }
  })

  // Only the client is written to: the owner is the one who just made this,
  // and a notification about his own action is noise in the inbox that the
  // real ones have to compete with.
  await sendVisitorBookingMail(mailInputFor(booking, type.duration_minutes, typeName, token), false)

  return toPublicBooking(booking, type, typeName, token)
}

/* -------------------------------------------------------------------------- */
/* Booking types — admin                                                      */
/* -------------------------------------------------------------------------- */

/** Postgres' foreign-key violation. Raised by `ON DELETE RESTRICT`. */
const FOREIGN_KEY_VIOLATION = '23503'

type AdminTypeRow = TypeRow & {
  translations: Array<{ language: BookingLanguage; name: string; description: string }> | null
  upcoming_count: string
  created_at: Date
  updated_at: Date
}

const toAdminBookingType = (row: AdminTypeRow): AdminBookingType => ({
  id: row.id,
  slug: row.slug,
  durationMinutes: row.duration_minutes,
  bufferBeforeMinutes: row.buffer_before_minutes,
  bufferAfterMinutes: row.buffer_after_minutes,
  minimumNoticeMinutes: row.minimum_notice_minutes,
  bookingWindowDays: row.booking_window_days,
  slotIntervalMinutes: row.slot_interval_minutes,
  maxPerDay: row.max_per_day,
  locationKind: row.location_kind,
  locationValue: row.location_value,
  priceCents: row.price_cents,
  currency: row.currency,
  isActive: row.is_active,
  sortOrder: row.sort_order,
  translations: {
    de: { name: '', description: '' },
    en: { name: '', description: '' },
    ar: { name: '', description: '' },
    ...Object.fromEntries(
      (row.translations ?? []).map((entry) => [
        entry.language,
        { name: entry.name, description: entry.description },
      ]),
    ),
  } as AdminBookingType['translations'],
  upcomingCount: Number(row.upcoming_count),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
})

const ADMIN_TYPE_SELECT = `
  SELECT ${TYPE_COLUMNS},
         (
           SELECT json_agg(json_build_object(
             'language', t.language, 'name', t.name, 'description', t.description))
             FROM booking_type_translations t WHERE t.booking_type_id = bt.id
         ) AS translations,
         (
           SELECT count(*)::text FROM bookings b
            WHERE b.booking_type_id = bt.id
              AND b.status = 'CONFIRMED'
              AND b.starts_at >= CURRENT_TIMESTAMP
         ) AS upcoming_count,
         bt.created_at, bt.updated_at
    FROM booking_types bt
`

export const listBookingTypes = async (): Promise<AdminBookingType[]> => {
  const result = await getDb().query<AdminTypeRow>(
    `${ADMIN_TYPE_SELECT} ORDER BY bt.sort_order, bt.duration_minutes, bt.id;`,
  )

  return result.rows.map(toAdminBookingType)
}

export const getBookingType = async (id: string): Promise<AdminBookingType> => {
  const result = await getDb().query<AdminTypeRow>(`${ADMIN_TYPE_SELECT} WHERE bt.id = $1;`, [id])

  const row = result.rows[0]
  if (!row) throw notFoundError('That call type does not exist')

  return toAdminBookingType(row)
}

/** Replaced wholesale on every save, as post translations are. */
const writeTypeTranslations = async (
  typeId: string,
  translations: BookingTypeWriteInput['translations'],
) => {
  const db = getDb()

  await db.query('DELETE FROM booking_type_translations WHERE booking_type_id = $1;', [typeId])

  for (const language of BOOKING_LANGUAGES) {
    const copy = translations[language]

    await db.query(
      `INSERT INTO booking_type_translations (booking_type_id, language, name, description)
       VALUES ($1, $2, $3, $4);`,
      [typeId, language, copy.name, copy.description],
    )
  }
}

const TYPE_WRITE_VALUES = (input: BookingTypeWriteInput) => [
  input.slug,
  input.durationMinutes,
  input.bufferBeforeMinutes,
  input.bufferAfterMinutes,
  input.minimumNoticeMinutes,
  input.bookingWindowDays,
  input.slotIntervalMinutes,
  input.maxPerDay,
  input.locationKind,
  input.locationValue === '' ? null : input.locationValue,
  input.priceCents,
  input.currency,
  input.isActive,
  input.sortOrder,
]

export const createBookingType = async (input: BookingTypeWriteInput): Promise<AdminBookingType> => {
  const id = await withTransaction(async (db) => {
    const created = await db
      .query<{ id: string }>(
        `INSERT INTO booking_types
           (slug, duration_minutes, buffer_before_minutes, buffer_after_minutes,
            minimum_notice_minutes, booking_window_days, slot_interval_minutes, max_per_day,
            location_kind, location_value, price_cents, currency, is_active, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id;`,
        TYPE_WRITE_VALUES(input),
      )
      .catch((error: unknown) => {
        if (errorCode(error) === UNIQUE_VIOLATION) {
          throw conflictError('A call type with that slug already exists')
        }
        throw error
      })

    const typeId = created.rows[0]?.id
    if (!typeId) throw internalError('The call type could not be created')

    await writeTypeTranslations(typeId, input.translations)

    return typeId
  })

  return getBookingType(id)
}

export const updateBookingType = async (
  id: string,
  input: BookingTypeWriteInput,
): Promise<AdminBookingType> => {
  await withTransaction(async (db) => {
    const updated = await db
      .query<{ id: string }>(
        `UPDATE booking_types
            SET slug = $2, duration_minutes = $3, buffer_before_minutes = $4,
                buffer_after_minutes = $5, minimum_notice_minutes = $6,
                booking_window_days = $7, slot_interval_minutes = $8, max_per_day = $9,
                location_kind = $10, location_value = $11, price_cents = $12, currency = $13,
                is_active = $14, sort_order = $15, updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING id;`,
        [id, ...TYPE_WRITE_VALUES(input)],
      )
      .catch((error: unknown) => {
        if (errorCode(error) === UNIQUE_VIOLATION) {
          throw conflictError('A call type with that slug already exists')
        }
        throw error
      })

    if (!updated.rows[0]) throw notFoundError('That call type does not exist')

    await writeTypeTranslations(id, input.translations)
  })

  return getBookingType(id)
}

export const deleteBookingType = async (id: string): Promise<void> => {
  const result = await getDb()
    .query('DELETE FROM booking_types WHERE id = $1;', [id])
    .catch((error: unknown) => {
      // The bookings held with this type reference it with ON DELETE RESTRICT.
      // Deactivating is what the owner actually wants here; deleting the record
      // of calls that happened is not.
      if (errorCode(error) === FOREIGN_KEY_VIOLATION) {
        throw conflictError('Calls have been booked with this type. Deactivate it instead.')
      }
      throw error
    })

  if (result.rowCount === 0) throw notFoundError('That call type does not exist')
}

/* -------------------------------------------------------------------------- */
/* Availability — admin                                                       */
/* -------------------------------------------------------------------------- */

export const getAvailability = async (): Promise<AdminAvailability> => {
  const db = getDb()

  const [rules, exceptions] = await Promise.all([
    db.query<{ id: string; weekday: number; starts_at_minute: number; ends_at_minute: number }>(
      `SELECT id, weekday, starts_at_minute, ends_at_minute
         FROM availability_rules
        WHERE booking_type_id IS NULL
        ORDER BY weekday, starts_at_minute;`,
    ),
    db.query<{
      id: string
      booking_type_id: string | null
      on_date: string
      kind: 'BLOCK' | 'OPEN'
      starts_at_minute: number | null
      ends_at_minute: number | null
      reason: string
    }>(
      `SELECT id, booking_type_id, to_char(on_date, 'YYYY-MM-DD') AS on_date, kind,
              starts_at_minute, ends_at_minute, reason
         FROM availability_exceptions
        WHERE on_date >= CURRENT_DATE - interval '30 days'
        ORDER BY on_date, starts_at_minute NULLS FIRST;`,
    ),
  ])

  return {
    timezone: OWNER_TIMEZONE,
    rules: rules.rows.map((row) => ({
      id: row.id,
      weekday: row.weekday,
      startsAtMinute: row.starts_at_minute,
      endsAtMinute: row.ends_at_minute,
    })),
    exceptions: exceptions.rows.map((row) => ({
      id: row.id,
      bookingTypeId: row.booking_type_id,
      onDate: row.on_date,
      kind: row.kind,
      startsAtMinute: row.starts_at_minute,
      endsAtMinute: row.ends_at_minute,
      reason: row.reason,
    })),
  }
}

/**
 * The whole weekly grid is replaced at once. It is one small thing the owner
 * edits as a unit, and replacing it cannot leave the week half-applied the way
 * a sequence of row edits can.
 */
export const saveAvailabilityRules = async (
  input: AvailabilityRulesWriteInput,
): Promise<AdminAvailability> => {
  await withTransaction(async (db) => {
    if (input.bookingTypeId === null) {
      await db.query('DELETE FROM availability_rules WHERE booking_type_id IS NULL;')
    } else {
      await db.query('DELETE FROM availability_rules WHERE booking_type_id = $1;', [
        input.bookingTypeId,
      ])
    }

    for (const rule of input.rules) {
      await db.query(
        `INSERT INTO availability_rules
           (booking_type_id, weekday, starts_at_minute, ends_at_minute)
         VALUES ($1, $2, $3, $4);`,
        [input.bookingTypeId, rule.weekday, rule.startsAtMinute, rule.endsAtMinute],
      )
    }
  })

  return getAvailability()
}

export const createAvailabilityException = async (
  input: AvailabilityExceptionWriteInput,
): Promise<AdminAvailability> => {
  await getDb().query(
    `INSERT INTO availability_exceptions
       (booking_type_id, on_date, kind, starts_at_minute, ends_at_minute, reason)
     VALUES ($1, $2::date, $3, $4, $5, $6);`,
    [
      input.bookingTypeId,
      input.onDate,
      input.kind,
      // A block with no window is a whole day off, whatever the form sent.
      input.kind === 'BLOCK' ? null : input.startsAtMinute,
      input.kind === 'BLOCK' ? null : input.endsAtMinute,
      input.reason,
    ],
  )

  return getAvailability()
}

export const deleteAvailabilityException = async (id: string): Promise<void> => {
  const result = await getDb().query('DELETE FROM availability_exceptions WHERE id = $1;', [id])

  if (result.rowCount === 0) throw notFoundError('That entry does not exist')
}

/* -------------------------------------------------------------------------- */
/* Bookings — admin                                                           */
/* -------------------------------------------------------------------------- */

/** The WHERE clause shared by the list and its count, so both see the same rows. */
const buildBookingFilter = (filter: BookingFilterInput) => {
  const conditions: string[] = []
  const values: unknown[] = []

  if (filter.search) {
    values.push(`%${filter.search}%`)
    conditions.push(
      `(b.visitor_name ILIKE $${values.length}
        OR b.visitor_email ILIKE $${values.length}
        OR b.reference ILIKE $${values.length})`,
    )
  }

  if (filter.status !== 'all') {
    values.push(filter.status)
    conditions.push(`b.status = $${values.length}`)
  }

  if (filter.range === 'upcoming') conditions.push('b.starts_at >= CURRENT_TIMESTAMP')
  if (filter.range === 'past') conditions.push('b.starts_at < CURRENT_TIMESTAMP')

  return { where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', values }
}

type AdminBookingRow = {
  id: string
  reference: string
  starts_at: Date
  ends_at: Date
  status: AdminBookingDetail['status']
  visitor_name: string
  visitor_email: string
  visitor_timezone: string
  booking_type_name: string
  lead_id: string | null
}

/** Prefer German, then English, then Arabic for the one name the admin lists. */
const ADMIN_TYPE_NAME = `(
  SELECT t.name FROM booking_type_translations t
   WHERE t.booking_type_id = b.booking_type_id
   ORDER BY CASE t.language WHEN 'de' THEN 1 WHEN 'en' THEN 2 ELSE 3 END
   LIMIT 1
)`

export const listBookingsForAdmin = async (
  filter: BookingFilterInput,
): Promise<AdminBookingList> => {
  const db = getDb()
  const { where, values } = buildBookingFilter(filter)

  const totalResult = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM bookings b ${where};`,
    values,
  )

  const total = Number(totalResult.rows[0]?.count ?? 0)
  const pageCount = Math.max(1, Math.ceil(total / BOOKING_PAGE_SIZE))
  // A filter that shrinks the list must not strand the owner on a page that no
  // longer exists, so the requested page is clamped rather than empty.
  const page = Math.min(filter.page, pageCount)

  // Upcoming reads forwards from now; everything else reads newest first.
  const order = filter.range === 'upcoming' ? 'b.starts_at ASC' : 'b.starts_at DESC'

  const rows = await db.query<AdminBookingRow>(
    `SELECT b.id, b.reference, b.starts_at, b.ends_at, b.status, b.visitor_name,
            b.visitor_email, b.visitor_timezone, b.lead_id,
            COALESCE(${ADMIN_TYPE_NAME}, '') AS booking_type_name
       FROM bookings b
       ${where}
      ORDER BY ${order}, b.id
      LIMIT $${values.length + 1} OFFSET $${values.length + 2};`,
    [...values, BOOKING_PAGE_SIZE, (page - 1) * BOOKING_PAGE_SIZE],
  )

  return {
    items: rows.rows.map((row) => ({
      id: row.id,
      reference: row.reference,
      startsAt: row.starts_at.toISOString(),
      endsAt: row.ends_at.toISOString(),
      status: row.status,
      visitorName: row.visitor_name,
      visitorEmail: row.visitor_email,
      visitorTimezone: row.visitor_timezone,
      bookingTypeName: row.booking_type_name,
      leadId: row.lead_id,
    })),
    total,
    page,
    pageCount,
  }
}

export const getBookingForAdmin = async (id: string): Promise<AdminBookingDetail> => {
  const result = await getDb().query<
    AdminBookingRow & {
      visitor_phone: string | null
      visitor_note: string
      language: BookingLanguage
      buffer_before_minutes: number
      buffer_after_minutes: number
      blocked_starts_at: Date
      blocked_ends_at: Date
      location_kind: AdminBookingDetail['locationKind']
      location_value: string | null
      price_cents: number
      currency: string
      cancelled_at: Date | null
      cancelled_by: 'VISITOR' | 'ADMIN' | null
      cancellation_reason: string
      rescheduled_from_reference: string | null
      created_at: Date
      lead_company: string | null
      lead_service_interest: string | null
      lead_budget_band: string | null
      lead_timeline: string | null
    }
  >(
    `SELECT b.id, b.reference, b.starts_at, b.ends_at, b.status, b.visitor_name,
            b.visitor_email, b.visitor_timezone, b.lead_id, b.visitor_phone, b.visitor_note,
            b.language, b.buffer_before_minutes, b.buffer_after_minutes,
            b.blocked_starts_at, b.blocked_ends_at, b.location_kind, b.location_value,
            b.price_cents, b.currency, b.cancelled_at, b.cancelled_by, b.cancellation_reason,
            b.created_at,
            COALESCE(${ADMIN_TYPE_NAME}, '') AS booking_type_name,
            (SELECT prev.reference FROM bookings prev WHERE prev.id = b.rescheduled_from_id)
              AS rescheduled_from_reference,
            l.company AS lead_company, l.service_interest AS lead_service_interest,
            l.budget_band AS lead_budget_band, l.timeline AS lead_timeline
       FROM bookings b
       LEFT JOIN leads l ON l.id = b.lead_id
      WHERE b.id = $1;`,
    [id],
  )

  const row = result.rows[0]
  if (!row) throw notFoundError('That booking does not exist')

  return {
    id: row.id,
    reference: row.reference,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
    visitorName: row.visitor_name,
    visitorEmail: row.visitor_email,
    visitorTimezone: row.visitor_timezone,
    bookingTypeName: row.booking_type_name,
    leadId: row.lead_id,
    visitorPhone: row.visitor_phone,
    visitorNote: row.visitor_note,
    language: row.language,
    bufferBeforeMinutes: row.buffer_before_minutes,
    bufferAfterMinutes: row.buffer_after_minutes,
    blockedStartsAt: row.blocked_starts_at.toISOString(),
    blockedEndsAt: row.blocked_ends_at.toISOString(),
    locationKind: row.location_kind,
    locationValue: row.location_value,
    priceCents: row.price_cents,
    currency: row.currency,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    cancelledBy: row.cancelled_by,
    cancellationReason: row.cancellation_reason,
    rescheduledFromReference: row.rescheduled_from_reference,
    createdAt: row.created_at.toISOString(),
    lead: row.lead_id
      ? {
          company: row.lead_company ?? '',
          serviceInterest: row.lead_service_interest ?? '',
          budgetBand: row.lead_budget_band ?? '',
          timeline: row.lead_timeline ?? '',
        }
      : null,
  }
}

export const cancelBookingAsAdmin = async (
  id: string,
  input: AdminBookingCancelInput,
): Promise<AdminBookingDetail> => {
  const result = await getDb().query<{ id: string }>(
    `UPDATE bookings
        SET status = 'CANCELLED',
            cancelled_at = CURRENT_TIMESTAMP,
            cancelled_by = 'ADMIN',
            cancellation_reason = $2,
            manage_token_expires_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND status = 'CONFIRMED'
      RETURNING id;`,
    [id, input.reason],
  )

  // Either it is gone, or it was not confirmed. Telling the two apart costs a
  // second query and changes nothing the owner would do about it.
  if (!result.rows[0]) throw conflictError('That booking is not open to cancel')

  const detail = await getBookingForAdmin(id)

  const mail: BookingMailInput = {
    reference: detail.reference,
    startsAt: new Date(detail.startsAt),
    endsAt: new Date(detail.endsAt),
    durationMinutes: Math.round(
      (Date.parse(detail.endsAt) - Date.parse(detail.startsAt)) / MS_PER_MINUTE,
    ),
    visitorName: detail.visitorName,
    visitorEmail: detail.visitorEmail,
    visitorTimezone: detail.visitorTimezone,
    visitorNote: detail.visitorNote,
    language: detail.language,
    typeName: detail.bookingTypeName,
    locationLabel: detail.locationValue ?? LOCATION_FALLBACK[detail.locationKind],
    cancellationReason: input.reason,
  }

  await sendVisitorBookingMail(mail, true)

  return detail
}

/**
 * Marking a past call as held or missed. Never reaches CANCELLED — that has
 * its own endpoint, because it is the one that writes to the visitor.
 */
export const setBookingStatus = async (
  id: string,
  input: BookingStatusWriteInput,
): Promise<AdminBookingDetail> => {
  const result = await getDb()
    .query<{ id: string }>(
      `UPDATE bookings
          SET status = $2,
              manage_token_expires_at = CASE
                WHEN $2 = 'CONFIRMED' THEN manage_token_expires_at
                ELSE CURRENT_TIMESTAMP
              END,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND status <> 'CANCELLED'
          AND ($2 = 'CONFIRMED' OR starts_at <= CURRENT_TIMESTAMP)
        RETURNING id;`,
      [id, input.status],
    )
    .catch((error: unknown) => {
      // Putting a call back to CONFIRMED can collide with whatever took its
      // place in the meantime.
      if (errorCode(error) === EXCLUSION_VIOLATION) {
        throw conflictError('Another booking now holds that time')
      }
      throw error
    })

  if (!result.rows[0]) throw conflictError('A cancelled booking cannot be marked')

  return getBookingForAdmin(id)
}
