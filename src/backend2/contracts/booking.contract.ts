import * as v from 'valibot'

/**
 * The Booking contract, shared by Backend2, the Dashboard and the public
 * booking pages. See `docs/v2/booking.md`.
 *
 * Pure: valibot and plain TypeScript. Times cross the wire as ISO 8601
 * instants; the owner's schedule is Europe/Berlin local minutes.
 */

export const OWNER_TIME_ZONE = 'Europe/Berlin'

export const BOOKING_LANGUAGES = ['de', 'en', 'ar'] as const
export type BookingLanguage = (typeof BOOKING_LANGUAGES)[number]

export const BOOKING_METHODS = ['video', 'in_person', 'phone'] as const
export type BookingMethod = (typeof BOOKING_METHODS)[number]

export const APPOINTMENT_STATUSES = ['confirmed', 'completed', 'cancelled', 'no_show'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

/**
 * The optional "What is it about?" and "Budget range" answers.
 * Removed from Contact by owner decision — never from Booking.
 */
export const SUBJECT_CHOICES = ['unsure', 'website', 'shop', 'software'] as const
export const BUDGET_CHOICES = ['unsure', 'lt1500', '1500-3000', '3000-6000', 'gt6000'] as const

/** English labels, for the owner's Dashboard and Inbox. */
export const SUBJECT_LABELS: Record<(typeof SUBJECT_CHOICES)[number], string> = {
  unsure: 'Not sure yet',
  website: 'Website',
  shop: 'Online store',
  software: 'Custom web application or software',
}

export const BUDGET_LABELS: Record<(typeof BUDGET_CHOICES)[number], string> = {
  unsure: 'Not sure yet',
  lt1500: 'up to €1,500',
  '1500-3000': '€1,500 to €3,000',
  '3000-6000': '€3,000 to €6,000',
  gt6000: 'over €6,000',
}

export const METHOD_LABELS: Record<BookingMethod, string> = {
  video: 'Video call',
  in_person: 'In person',
  phone: 'Phone call',
}

/**
 * Why a visitor cancelled. Radio buttons plus Other with typed text; the
 * wording is approved with the Design Lab.
 */
export const CANCEL_REASONS = ['time_conflict', 'no_longer_needed', 'found_other', 'booked_by_mistake', 'other'] as const
export type CancelReason = (typeof CANCEL_REASONS)[number]

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  time_conflict: 'The time no longer works for me',
  no_longer_needed: 'I no longer need the appointment',
  found_other: 'I found another solution',
  booked_by_mistake: 'I booked by mistake',
  other: 'Other',
}

export const BOOKING_LIMITS = {
  name: 200,
  email: 254,
  phone: 40,
  company: 200,
  note: 2_000,
  cancelText: 1_000,
  ownerReason: 1_000,
  typeName: 120,
  typeDescription: 1_000,
  slug: 80,
  /** Days of slots one request may ask for. */
  maxSlotDays: 14,
  /** The widest calendar range one list request may cover. */
  maxRangeDays: 62,
  maxExceptions: 200,
  searchQuery: 120,
} as const

/** The bounds the Dashboard settings enforce, and the database repeats. */
export const SETTINGS_BOUNDS = {
  minNoticeMinutes: { min: 0, max: 43_200 },
  windowDays: { min: 1, max: 365 },
  changeLimitHours: { min: 0, max: 168 },
  reminderMinutes: { min: 60, max: 20_160 },
} as const

/** Fresh joins stop this long after the scheduled end, even mid-call. */
export const VIDEO_JOIN_GRACE_MINUTES = 60
/** How early the owner may open the room. The visitor waits for the start. */
export const OWNER_EARLY_JOIN_MINUTES = 15

/* ------------------------------------------------------------------ shapes */

export type TypeTexts = Record<BookingLanguage, { name: string; description: string }>

export type BookingType = {
  id: string
  slug: string
  position: number
  enabled: boolean
  durationMinutes: number
  bufferMinutes: number
  slotStepMinutes: number
  methods: BookingMethod[]
  texts: TypeTexts
  /** What must change before it can be switched on. Empty when it can. */
  enableBlockers: string[]
  upcomingCount: number
  updatedAt: string
}

export type PublicBookingType = {
  slug: string
  name: string
  description: string
  durationMinutes: number
  methods: BookingMethod[]
  /** Video when allowed — the agreed default — otherwise the first allowed. */
  defaultMethod: BookingMethod
}

export type Slot = {
  startsAt: string
  endsAt: string
  /** In the requested time zone, so the page does not have to convert. */
  localDate: string
  localTime: string
}

export type SlotDay = { date: string; slots: Slot[] }

export type SlotsResult = {
  timeZone: string
  days: SlotDay[]
  /** The first date with anything free after this window, if any is known. */
  nextAvailableDate: string | null
}

export type BookingSettings = {
  minNoticeMinutes: number
  windowDays: number
  changeLimitHours: number
  reminderMinutes: number
  timeZone: typeof OWNER_TIME_ZONE
}

export type WeeklyRange = { weekday: number; startMinute: number; endMinute: number }
export type AvailabilityException = { date: string; ranges: Array<{ startMinute: number; endMinute: number }>; note: string }
export type Availability = { weekly: WeeklyRange[]; exceptions: AvailabilityException[] }

export type AppointmentSummary = {
  id: string
  reference: string
  typeId: string | null
  typeName: string
  method: BookingMethod
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  source: 'public' | 'manual'
  outsideHours: boolean
  visitorName: string
  visitorEmail: string
  language: BookingLanguage
  reminderState: 'pending' | 'sent' | 'skipped' | 'failed' | 'cancelled'
  inboxConversationId: string | null
  invitationSentAt: string | null
}

export type AppointmentHistoryEntry = {
  at: string
  actor: 'visitor' | 'owner' | 'system'
  kind: string
  details: Record<string, unknown>
}

export type AppointmentDetail = AppointmentSummary & {
  visitorPhone: string | null
  visitorTimeZone: string
  company: string
  subject: string | null
  budget: string | null
  note: string
  durationMinutes: number
  bufferMinutes: number
  cancelledAt: string | null
  cancelledBy: 'visitor' | 'owner' | null
  cancelReason: string | null
  reminderDueAt: string | null
  reminderSentAt: string | null
  videoEndedAt: string | null
  revision: number
  history: AppointmentHistoryEntry[]
}

/** What a visitor sees through their private link. Nothing else about the owner's calendar. */
export type VisitorAppointment = {
  reference: string
  typeName: string
  typeSlug: string | null
  method: BookingMethod
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  language: BookingLanguage
  visitorName: string
  canChange: boolean
  /** The last moment a visitor may cancel or reschedule. */
  changeDeadline: string
}

export type VideoAccess = {
  token: string
  role: 'host' | 'guest'
  startsAt: string
  endsAt: string
  /** After this, nobody new may join; a call already running continues. */
  joinClosesAt: string
}

export type VideoPreflight = {
  state: 'early' | 'open' | 'closed' | 'ended' | 'cancelled'
  startsAt: string
  endsAt: string
  joinClosesAt: string
  serverTime: string
}

/* ----------------------------------------------------------------- schemas */

const Uuid = v.pipe(v.string(), v.uuid('That is not a valid id'))

export const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })

    return true
  } catch {
    return false
  }
}

export const TimeZoneSchema = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(64),
  v.check(isValidTimeZone, 'That is not a time zone'),
)

const DateSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/u, 'Use a date like 2026-09-29'),
  v.check((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'That date does not exist'),
)

const InstantSchema = v.pipe(
  v.string(),
  v.isoTimestamp('Use an ISO date and time'),
)

const Name = v.pipe(v.string('Enter your name'), v.trim(), v.minLength(1, 'Enter your name'), v.maxLength(BOOKING_LIMITS.name))
const Email = v.pipe(
  v.string('Enter your email address'),
  v.trim(),
  v.toLowerCase(),
  v.maxLength(BOOKING_LIMITS.email),
  v.email('Enter a valid email address'),
)
const Phone = v.pipe(
  v.string(),
  v.trim(),
  v.maxLength(BOOKING_LIMITS.phone),
  v.check((value) => value === '' || /^[+()\d\s./-]{5,}$/u.test(value), 'Enter a valid phone number'),
)
const OptionalText = (max: number) => v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)), '')

const CountFromQuery = (fallback: number, min: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(value.trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(min),
    v.maxValue(max),
  )

export const SlotsQuerySchema = v.object({
  method: v.picklist(BOOKING_METHODS),
  from: DateSchema,
  days: CountFromQuery(7, 1, BOOKING_LIMITS.maxSlotDays),
  timeZone: v.optional(TimeZoneSchema, OWNER_TIME_ZONE),
  language: v.optional(v.picklist(BOOKING_LANGUAGES), 'en'),
})

export const PublicTypesQuerySchema = v.object({
  language: v.optional(v.picklist(BOOKING_LANGUAGES), 'en'),
})

/** The visitor details both forms share. Phone is required only for a phone call. */
const VisitorFields = {
  name: Name,
  email: Email,
  phone: v.optional(Phone, ''),
  company: OptionalText(BOOKING_LIMITS.company),
  subject: v.optional(v.nullable(v.picklist(SUBJECT_CHOICES)), null),
  budget: v.optional(v.nullable(v.picklist(BUDGET_CHOICES)), null),
  note: OptionalText(BOOKING_LIMITS.note),
}

const phoneWhenPhone = (input: { method: BookingMethod; phone: string }) =>
  input.method !== 'phone' || input.phone.trim() !== ''

export const PublicBookingSchema = v.pipe(
  v.object({
    submissionId: Uuid,
    typeSlug: v.pipe(v.string(), v.trim(), v.maxLength(BOOKING_LIMITS.slug)),
    method: v.picklist(BOOKING_METHODS),
    startsAt: InstantSchema,
    timeZone: TimeZoneSchema,
    language: v.picklist(BOOKING_LANGUAGES),
    ...VisitorFields,
    turnstileToken: v.optional(v.pipe(v.string(), v.maxLength(4096)), ''),
    /** The honeypot: hidden from people, so anything in it came from a bot. */
    website: v.optional(v.pipe(v.string(), v.maxLength(500)), ''),
  }),
  v.forward(v.partialCheck([['method'], ['phone']], phoneWhenPhone, 'Enter a phone number for a phone call'), ['phone']),
)

export const ManualAppointmentSchema = v.pipe(
  v.object({
    typeId: Uuid,
    method: v.picklist(BOOKING_METHODS),
    startsAt: InstantSchema,
    language: v.picklist(BOOKING_LANGUAGES),
    visitorTimeZone: v.optional(TimeZoneSchema, OWNER_TIME_ZONE),
    ...VisitorFields,
    /** Save only, or Save & send invitation. */
    sendInvitation: v.optional(v.boolean(), false),
  }),
  v.forward(v.partialCheck([['method'], ['phone']], phoneWhenPhone, 'Enter a phone number for a phone call'), ['phone']),
)

export const OwnerAppointmentPatchSchema = v.object({
  revision: v.pipe(v.number(), v.integer(), v.minValue(1)),
  startsAt: v.optional(InstantSchema),
  name: v.optional(Name),
  email: v.optional(Email),
  phone: v.optional(Phone),
  company: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(BOOKING_LIMITS.company))),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(BOOKING_LIMITS.note))),
  /** Whether a reschedule emails the visitor. On unless the owner turns it off. */
  notify: v.optional(v.boolean(), true),
})

export const OwnerCancelSchema = v.object({
  reason: v.pipe(v.string('Give a reason'), v.trim(), v.minLength(1, 'Give a reason'), v.maxLength(BOOKING_LIMITS.ownerReason)),
  notify: v.optional(v.boolean(), true),
})

export const StatusSchema = v.object({ status: v.picklist(['completed', 'no_show'] as const) })

export const VisitorRescheduleSchema = v.object({ startsAt: InstantSchema, timeZone: v.optional(TimeZoneSchema) })

export const VisitorCancelSchema = v.pipe(
  v.object({
    reason: v.picklist(CANCEL_REASONS, 'Choose a reason'),
    text: OptionalText(BOOKING_LIMITS.cancelText),
  }),
  v.forward(
    v.check((input) => input.reason !== 'other' || input.text.trim() !== '', 'Tell us briefly why'),
    ['text'],
  ),
)

export const AppointmentListQuerySchema = v.pipe(
  v.object({
    from: v.optional(InstantSchema),
    to: v.optional(InstantSchema),
    status: v.optional(v.picklist(APPOINTMENT_STATUSES)),
    typeId: v.optional(Uuid),
    method: v.optional(v.picklist(BOOKING_METHODS)),
    q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(BOOKING_LIMITS.searchQuery))),
    page: CountFromQuery(1, 1, 100_000),
    pageSize: CountFromQuery(25, 1, 100),
  }),
  v.check(
    (input) =>
      !input.from ||
      !input.to ||
      (Date.parse(input.to) > Date.parse(input.from) &&
        Date.parse(input.to) - Date.parse(input.from) <= BOOKING_LIMITS.maxRangeDays * 86_400_000),
    `A calendar range must run forwards and cover at most ${BOOKING_LIMITS.maxRangeDays} days`,
  ),
)

const TypeTextSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.maxLength(BOOKING_LIMITS.typeName)),
  description: v.pipe(v.string(), v.trim(), v.maxLength(BOOKING_LIMITS.typeDescription)),
})

export const TypeInputSchema = v.object({
  slug: v.pipe(
    v.string('Give it a web address'),
    v.trim(),
    v.toLowerCase(),
    v.maxLength(BOOKING_LIMITS.slug),
    v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/u, 'Use lowercase letters, numbers and single hyphens'),
  ),
  enabled: v.optional(v.boolean(), false),
  durationMinutes: v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(480)),
  bufferMinutes: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(240)), 0),
  slotStepMinutes: v.optional(v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(240)), 30),
  methods: v.pipe(
    v.array(v.picklist(BOOKING_METHODS)),
    v.minLength(1, 'Allow at least one way to meet'),
    v.maxLength(3),
    v.check((methods) => new Set(methods).size === methods.length, 'Each way to meet once'),
  ),
  texts: v.object({ de: TypeTextSchema, en: TypeTextSchema, ar: TypeTextSchema }),
})

export const TypePatchSchema = v.partial(TypeInputSchema)

export const TypeListQuerySchema = v.object({
  page: CountFromQuery(1, 1, 100_000),
  pageSize: CountFromQuery(25, 1, 100),
})

const Minute = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(1440))

const RangeSchema = v.pipe(
  v.object({ startMinute: Minute, endMinute: Minute }),
  v.check((range) => range.startMinute < range.endMinute, 'A range must end after it starts'),
)

const noOverlaps = (ranges: Array<{ startMinute: number; endMinute: number }>) =>
  [...ranges]
    .sort((a, b) => a.startMinute - b.startMinute)
    .every((range, index, all) => index === 0 || all[index - 1]!.endMinute <= range.startMinute)

export const AvailabilitySchema = v.object({
  weekly: v.pipe(
    v.array(v.object({ weekday: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7)), startMinute: Minute, endMinute: Minute })),
    v.maxLength(70),
    v.check((ranges) => ranges.every((range) => range.startMinute < range.endMinute), 'A range must end after it starts'),
    v.check(
      (ranges) => [1, 2, 3, 4, 5, 6, 7].every((day) => noOverlaps(ranges.filter((range) => range.weekday === day))),
      'Hours on the same day may not overlap',
    ),
  ),
  exceptions: v.pipe(
    v.array(
      v.object({
        date: DateSchema,
        ranges: v.pipe(v.array(RangeSchema), v.maxLength(10), v.check(noOverlaps, 'Hours on the same day may not overlap')),
        note: OptionalText(200),
      }),
    ),
    v.maxLength(BOOKING_LIMITS.maxExceptions),
    v.check((items) => new Set(items.map((item) => item.date)).size === items.length, 'One exception per date'),
  ),
})

export const SettingsSchema = v.object({
  minNoticeMinutes: v.pipe(v.number(), v.integer(), v.minValue(SETTINGS_BOUNDS.minNoticeMinutes.min), v.maxValue(SETTINGS_BOUNDS.minNoticeMinutes.max)),
  windowDays: v.pipe(v.number(), v.integer(), v.minValue(SETTINGS_BOUNDS.windowDays.min), v.maxValue(SETTINGS_BOUNDS.windowDays.max)),
  changeLimitHours: v.pipe(v.number(), v.integer(), v.minValue(SETTINGS_BOUNDS.changeLimitHours.min), v.maxValue(SETTINGS_BOUNDS.changeLimitHours.max)),
  reminderMinutes: v.pipe(v.number(), v.integer(), v.minValue(SETTINGS_BOUNDS.reminderMinutes.min), v.maxValue(SETTINGS_BOUNDS.reminderMinutes.max)),
})

/** The request header a visitor's private link sends. Never a query string. */
export const MANAGE_TOKEN_HEADER = 'x-booking-token'
