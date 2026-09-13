import * as v from 'valibot'

/**
 * The three languages the rest of the site publishes. Written out here rather
 * than imported from another module so this contract reads on its own; the
 * database enforces the same list in a CHECK.
 */
export const BOOKING_LANGUAGES = ['de', 'en', 'ar'] as const

export type BookingLanguage = (typeof BOOKING_LANGUAGES)[number]

/**
 * The clock the weekly schedule is written on. A market assumption fixed in
 * `AGENTS.md`, so it is a constant rather than a column; the day it stops
 * being true it becomes a setting, which is a three-line migration.
 */
export const OWNER_TIMEZONE = 'Europe/Berlin'

export const BOOKING_STATUSES = ['CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'] as const

export type BookingStatus = (typeof BOOKING_STATUSES)[number]

export const LOCATION_KINDS = ['VIDEO', 'PHONE', 'IN_PERSON'] as const

export type LocationKind = (typeof LOCATION_KINDS)[number]

export const EXCEPTION_KINDS = ['BLOCK', 'OPEN'] as const

export type ExceptionKind = (typeof EXCEPTION_KINDS)[number]

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST'] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_SOURCES = ['CONTACT_FORM', 'BOOKING', 'MANUAL'] as const

export type LeadSource = (typeof LEAD_SOURCES)[number]

/** Minutes in a day, the upper bound of every window in the schedule. */
export const MINUTES_PER_DAY = 1440

const trimmed = (message: string, max: number) =>
  v.pipe(v.string(message), v.trim(), v.nonEmpty(message), v.maxLength(max, 'That text is too long'))

const optionalText = (max: number) =>
  v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(max, 'That text is too long'))

const minuteOfDay = v.pipe(
  v.number('A time is required'),
  v.integer('A time is required'),
  v.minValue(0, 'A time cannot be before midnight'),
  v.maxValue(MINUTES_PER_DAY, 'A time cannot be past midnight'),
)

/**
 * An IANA zone name. Asked of the runtime rather than matched against a list:
 * the zone database gains and loses names, and a regex would either reject a
 * real zone or accept a typo. `Intl` is the same source the browser and the
 * Worker both format with, so whatever it accepts here it can render later.
 */
export const TimezoneSchema = v.pipe(
  v.string('A timezone is required'),
  v.trim(),
  v.nonEmpty('A timezone is required'),
  v.maxLength(64, 'That is not a timezone name'),
  v.check((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value })

      return true
    } catch {
      return false
    }
  }, 'That is not a timezone name'),
)

/** An instant, always sent and stored in UTC. Never a wall-clock string. */
const InstantSchema = v.pipe(
  v.string('A time is required'),
  v.trim(),
  v.isoTimestamp('That is not a valid time'),
)

export const BookingSlugSchema = v.pipe(
  v.string('A slug is required'),
  v.trim(),
  v.toLowerCase(),
  v.nonEmpty('A slug is required'),
  v.maxLength(100, 'That slug is too long'),
  v.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and single hyphens'),
)

/* -------------------------------------------------------------------------- */
/* Booking types — admin                                                      */
/* -------------------------------------------------------------------------- */

/** One language of a call type. All three are required: it is a few words. */
const BookingTypeTranslationSchema = v.object({
  name: trimmed('A name is required', 120),
  description: optionalText(600),
})

export type BookingTypeTranslationInput = v.InferOutput<typeof BookingTypeTranslationSchema>

export const BookingTypeWriteSchema = v.pipe(
  v.object({
    slug: BookingSlugSchema,
    durationMinutes: v.pipe(
      v.number('A duration is required'),
      v.integer(),
      v.minValue(5, 'Five minutes is the shortest call worth holding'),
      v.maxValue(480, 'Eight hours is not a call'),
    ),
    bufferBeforeMinutes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(240)),
    bufferAfterMinutes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(240)),
    minimumNoticeMinutes: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(43_200)),
    bookingWindowDays: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(365)),
    slotIntervalMinutes: v.pipe(v.number(), v.integer(), v.minValue(5), v.maxValue(120)),
    maxPerDay: v.nullish(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)), null),
    locationKind: v.picklist(LOCATION_KINDS, 'Pick where the call happens'),
    locationValue: v.nullish(
      v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(500)),
      '',
    ),
    priceCents: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10_000_000)),
    currency: v.pipe(v.optional(v.string(), 'EUR'), v.trim(), v.toUpperCase(), v.length(3)),
    isActive: v.boolean(),
    sortOrder: v.pipe(v.optional(v.number(), 0), v.integer(), v.minValue(0), v.maxValue(999)),
    translations: v.object({
      de: BookingTypeTranslationSchema,
      en: BookingTypeTranslationSchema,
      ar: BookingTypeTranslationSchema,
    }),
  }),
  /**
   * A slot has to fit the grid it is offered on. A 30-minute call on a
   * 45-minute interval would offer times that overlap each other, and every
   * second one would be refused at insert with no explanation the visitor
   * could act on.
   */
  v.check(
    (input) => input.durationMinutes % input.slotIntervalMinutes === 0,
    'The duration has to be a whole number of slot intervals',
  ),
)

export type BookingTypeWriteInput = v.InferOutput<typeof BookingTypeWriteSchema>

/* -------------------------------------------------------------------------- */
/* Availability — admin                                                       */
/* -------------------------------------------------------------------------- */

const AvailabilityRuleSchema = v.pipe(
  v.object({
    weekday: v.pipe(
      v.number('A weekday is required'),
      v.integer(),
      v.minValue(0),
      v.maxValue(6),
    ),
    startsAtMinute: minuteOfDay,
    endsAtMinute: minuteOfDay,
  }),
  v.check((rule) => rule.endsAtMinute > rule.startsAtMinute, 'A window has to end after it starts'),
)

export type AvailabilityRuleInput = v.InferOutput<typeof AvailabilityRuleSchema>

/**
 * The whole week is saved at once. The weekly schedule is one small thing the
 * owner edits as a grid, so replacing it wholesale is both simpler than
 * per-row edits and impossible to leave half-applied.
 */
export const AvailabilityRulesWriteSchema = v.object({
  bookingTypeId: v.nullish(v.pipe(v.string(), v.uuid('That is not a booking type id')), null),
  rules: v.pipe(
    v.array(AvailabilityRuleSchema),
    v.maxLength(50, 'That is more windows than a week has room for'),
  ),
})

export type AvailabilityRulesWriteInput = v.InferOutput<typeof AvailabilityRulesWriteSchema>

/** A plain calendar day on the owner's clock, like `2026-12-24`. */
const DaySchema = v.pipe(
  v.string('A date is required'),
  v.trim(),
  v.isoDate('Use a date like 2026-09-12'),
)

export const AvailabilityExceptionWriteSchema = v.pipe(
  v.object({
    bookingTypeId: v.nullish(v.pipe(v.string(), v.uuid('That is not a booking type id')), null),
    onDate: DaySchema,
    kind: v.picklist(EXCEPTION_KINDS, 'Pick whether this blocks or opens time'),
    startsAtMinute: v.nullish(minuteOfDay, null),
    endsAtMinute: v.nullish(minuteOfDay, null),
    reason: optionalText(200),
  }),
  v.check(
    (input) =>
      input.kind === 'BLOCK'
        ? true
        : input.startsAtMinute !== null && input.endsAtMinute !== null,
    'An opening needs a start and an end',
  ),
  v.check(
    (input) =>
      input.startsAtMinute === null ||
      input.endsAtMinute === null ||
      input.endsAtMinute > input.startsAtMinute,
    'A window has to end after it starts',
  ),
)

export type AvailabilityExceptionWriteInput = v.InferOutput<typeof AvailabilityExceptionWriteSchema>

/* -------------------------------------------------------------------------- */
/* Slots and booking — public                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Query-string values, so every field coerces and falls back rather than
 * rejecting: a hand-edited URL narrows the range, it never produces an error
 * page. The service clamps the range to the type's own booking window.
 */
export const SlotQuerySchema = v.object({
  from: DaySchema,
  to: DaySchema,
  timezone: TimezoneSchema,
})

export type SlotQueryInput = v.InferOutput<typeof SlotQuerySchema>

/**
 * What the public form sends. The qualifying answers are here rather than in a
 * table of their own because `data-model.md` puts them on the lead: the point
 * of asking is that the call is never entered cold.
 */
export const BookingCreateSchema = v.object({
  turnstileToken: v.pipe(
    v.string('Security verification is required'),
    v.trim(),
    v.nonEmpty('Security verification is required'),
    v.maxLength(2048, 'Security verification is invalid'),
  ),
  bookingTypeSlug: BookingSlugSchema,
  /** The instant the visitor picked, as the slot endpoint returned it. */
  startsAt: InstantSchema,
  timezone: TimezoneSchema,
  language: v.optional(v.picklist(BOOKING_LANGUAGES), 'de'),
  name: trimmed('Your name is required', 120),
  email: v.pipe(
    v.string('An email address is required'),
    v.trim(),
    v.toLowerCase(),
    v.nonEmpty('An email address is required'),
    v.email('That does not look like an email address'),
    v.maxLength(254, 'That email address is too long'),
  ),
  phone: v.nullish(v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(40)), ''),
  company: optionalText(160),
  serviceInterest: optionalText(120),
  budgetBand: optionalText(60),
  timeline: optionalText(60),
  note: optionalText(2000),
  /**
   * Left empty by a person and filled in by a bot. Not a captcha: solving one
   * is not something this site asks of anybody, and a hidden field costs the
   * visitor nothing.
   */
  website: v.optional(v.string(), ''),
})

export type BookingCreateInput = v.InferOutput<typeof BookingCreateSchema>

/** The opaque token from the emailed link, not the booking id. */
export const BookingTokenSchema = v.pipe(
  v.string('A link token is required'),
  v.trim(),
  v.nonEmpty('A link token is required'),
  v.maxLength(200, 'That is not a valid link'),
)

export const BookingCancelSchema = v.object({
  reason: optionalText(500),
})

export type BookingCancelInput = v.InferOutput<typeof BookingCancelSchema>

export const BookingRescheduleSchema = v.object({
  startsAt: InstantSchema,
  timezone: TimezoneSchema,
})

export type BookingRescheduleInput = v.InferOutput<typeof BookingRescheduleSchema>

/* -------------------------------------------------------------------------- */
/* Admin list                                                                 */
/* -------------------------------------------------------------------------- */

export const BOOKING_RANGE_FILTERS = ['upcoming', 'past', 'all'] as const

export type BookingRangeFilter = (typeof BOOKING_RANGE_FILTERS)[number]

export const BOOKING_STATUS_FILTERS = ['all', ...BOOKING_STATUSES] as const

export const BOOKING_PAGE_SIZE = 20

export const BookingFilterSchema = v.object({
  search: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(120)),
  status: v.optional(v.picklist(BOOKING_STATUS_FILTERS), 'all'),
  range: v.optional(v.picklist(BOOKING_RANGE_FILTERS), 'upcoming'),
  page: v.pipe(
    v.optional(v.union([v.string(), v.number()]), 1),
    v.transform((value) => Number(value)),
    v.number(),
    v.integer(),
    v.minValue(1),
  ),
})

export type BookingFilterInput = v.InferOutput<typeof BookingFilterSchema>

export const BookingStatusWriteSchema = v.object({
  status: v.picklist(['COMPLETED', 'NO_SHOW', 'CONFIRMED'] as const, 'That is not a status'),
})

export type BookingStatusWriteInput = v.InferOutput<typeof BookingStatusWriteSchema>

export const AdminBookingCancelSchema = v.object({ reason: optionalText(500) })

export type AdminBookingCancelInput = v.InferOutput<typeof AdminBookingCancelSchema>
