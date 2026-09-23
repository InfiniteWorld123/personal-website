import * as v from 'valibot'
import { type Country, CountryCodeSchema } from './country.contract'
import { WonClientChoiceSchema } from './client.contract'

/**
 * The Leads contract, shared by the server and the Dashboard.
 *
 * See `docs/v2/leads.md`. Pure — valibot and plain TypeScript — so the forms
 * and the server enforce the identical rules.
 */

export const LEAD_LIMITS = {
  name: 160,
  email: 254,
  phone: 40,
  company: 200,
  notes: 20_000,
  search: 120,
  choiceName: 60,
  followUpNote: 200,
  lostText: 200,
  lostNotes: 2000,
} as const

/** The list and each Board column, in pages of 25, at most 100. */
export const LEAD_PAGE_SIZE = { min: 1, default: 25, max: 100 } as const

export const LEAD_DUPLICATE_LIMIT = 10

/**
 * The CSV ceilings, from the runtime rather than from hope: one request body
 * is at most 2 MB (`http/body.ts`), and a Worker should finish an import in
 * one request. Five thousand rows is far more than a typical list and still
 * a few seconds of inserts.
 */
export const LEAD_IMPORT_LIMITS = {
  bytes: 2 * 1024 * 1024,
  rows: 5000,
  columns: 50,
  previewRows: 20,
} as const

export const STAGE_KINDS = ['new', 'contacted', 'won', 'lost', 'custom'] as const
export type StageKind = (typeof STAGE_KINDS)[number]

/** The permanent stages. Their names and places are fixed. */
export const PERMANENT_STAGES: Record<Exclude<StageKind, 'custom'>, string> = {
  new: 'New',
  contacted: 'Contacted',
  won: 'Won',
  lost: 'Lost',
}

/** Seeded once, then the owner's to rename, hide or delete. */
export const DEFAULT_SOURCES = [
  'WhatsApp',
  'Instagram',
  'Facebook',
  'Inbox',
  'Booking',
  'Cold outreach',
  'SEO',
  'Google Maps',
  'AI',
  'Purchased list',
] as const

export const UNKNOWN_SOURCE = 'Unknown'

export const DEFAULT_LOSS_REASONS = [
  'Not interested',
  'No reply',
  'Price',
  'Chose someone else',
  'Poor fit',
  'I do not wish to work with this person',
] as const

export const OTHER_REASON = 'Other'

/* ------------------------------------------------------------------ fields */

const Name = v.pipe(
  v.string('Enter a name'),
  v.trim(),
  v.nonEmpty('Enter a name'),
  v.maxLength(LEAD_LIMITS.name, `Keep the name under ${LEAD_LIMITS.name} characters`),
)

const Email = v.pipe(
  v.string('Enter an email address'),
  v.trim(),
  v.nonEmpty('Enter an email address'),
  v.maxLength(LEAD_LIMITS.email, 'That email address is too long'),
  v.email('Enter a valid email address'),
)

/** Required for a Lead, unlike a Client: the owner's rule for every entry and CSV row. */
const Phone = v.pipe(
  v.string('Enter a phone number'),
  v.trim(),
  v.nonEmpty('Enter a phone number'),
  v.maxLength(LEAD_LIMITS.phone, 'That phone number is too long'),
  v.check((value) => /^\+?[\d\s().\-/]+$/u.test(value), 'Use only digits, spaces and + ( ) - / .'),
  v.check((value) => {
    const digits = value.replace(/\D/gu, '').length

    return digits >= 6 && digits <= 17
  }, 'Enter a complete phone number'),
)

const Company = v.pipe(
  v.optional(v.string(), ''),
  v.trim(),
  v.maxLength(LEAD_LIMITS.company, `Keep the company under ${LEAD_LIMITS.company} characters`),
)

const Notes = v.pipe(
  v.optional(v.string(), ''),
  v.maxLength(LEAD_LIMITS.notes, `Keep the notes under ${LEAD_LIMITS.notes} characters`),
)

const Uuid = (message: string) => v.pipe(v.string(message), v.uuid(message))

export type LeadFields = {
  name: string
  email: string
  phone: string
  country: string
  sourceId: string
  company: string
  nicheId: string | null
  notes: string
}

const fieldEntries = {
  name: Name,
  email: Email,
  phone: Phone,
  country: CountryCodeSchema,
  sourceId: Uuid('Choose a source'),
  company: Company,
  nicheId: v.optional(v.nullable(Uuid('Choose a niche from the list')), null),
  notes: Notes,
}

export const LeadFieldsSchema = v.object(fieldEntries)

export const CreateLeadSchema = v.object({
  ...fieldEntries,
  /** The owner looked at the likely duplicate and chose to continue. */
  allowDuplicate: v.optional(v.boolean(), false),
})

export const LeadPatchSchema = v.object({
  revision: v.pipe(v.number('Send the revision you edited'), v.integer(), v.minValue(1)),
  allowDuplicate: v.optional(v.boolean(), false),
  name: v.optional(Name),
  email: v.optional(Email),
  phone: v.optional(Phone),
  country: v.optional(CountryCodeSchema),
  sourceId: v.optional(Uuid('Choose a source')),
  company: v.optional(Company),
  nicheId: v.optional(v.nullable(Uuid('Choose a niche from the list'))),
  notes: v.optional(Notes),
})

export type LeadPatch = Omit<v.InferOutput<typeof LeadPatchSchema>, 'revision' | 'allowDuplicate'>

/* ------------------------------------------------------------ stage change */

/**
 * Moving a Lead. `lost` is required to reach Lost, `won` to reach Won; both
 * are ignored for any other stage. The List and the Board send the same thing.
 */
export const StageChangeSchema = v.object({
  stageId: Uuid('Choose a stage'),
  lost: v.optional(
    v.object({
      reasonId: Uuid('Choose a reason'),
      /** Required when the reason is Other. */
      reasonText: v.optional(
        v.pipe(v.string(), v.trim(), v.maxLength(LEAD_LIMITS.lostText, 'Keep the reason short')),
        '',
      ),
      notes: v.optional(
        v.pipe(
          v.string(),
          v.maxLength(
            LEAD_LIMITS.lostNotes,
            `Keep the notes under ${LEAD_LIMITS.lostNotes} characters`,
          ),
        ),
        '',
      ),
    }),
  ),
  won: v.optional(WonClientChoiceSchema),
})

export type StageChange = v.InferOutput<typeof StageChangeSchema>

/* --------------------------------------------------------------- choices */

const ChoiceName = v.pipe(
  v.string('Enter a name'),
  v.trim(),
  v.nonEmpty('Enter a name'),
  v.maxLength(LEAD_LIMITS.choiceName, `Keep it under ${LEAD_LIMITS.choiceName} characters`),
)

export const CreateChoiceSchema = v.object({ name: ChoiceName })

export const ChoicePatchSchema = v.object({
  name: v.optional(ChoiceName),
  hidden: v.optional(v.boolean()),
})

export const StagePatchSchema = v.object({
  name: v.optional(ChoiceName),
  /** 1-based place among the active stages (Contacted and custom ones). */
  position: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1000))),
})

/* -------------------------------------------------------------- follow-up */

const LocalDate = v.pipe(
  v.string('Choose a date'),
  v.regex(/^\d{4}-\d{2}-\d{2}$/u, 'Choose a date'),
  v.check((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), 'Choose a real date'),
)
const LocalTime = v.pipe(
  v.string('Choose a time'),
  v.regex(/^([01]\d|2[0-3]):[0-5]\d$/u, 'Choose a time'),
)

/** A date and time as the owner reads them in Berlin — never a raw instant. */
export const FollowUpSchema = v.object({
  date: LocalDate,
  time: LocalTime,
  note: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(
        LEAD_LIMITS.followUpNote,
        `Keep the note under ${LEAD_LIMITS.followUpNote} characters`,
      ),
    ),
    '',
  ),
})

export const FollowUpPatchSchema = v.object({
  date: v.optional(LocalDate),
  time: v.optional(LocalTime),
  note: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(LEAD_LIMITS.followUpNote))),
})

/* ------------------------------------------------------------------ lists */

const IntFromQuery = (fallback: number, min: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(value.trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(min, 'That is below the smallest allowed value'),
    v.maxValue(max, 'That is above the largest allowed value'),
  )

const OptionalId = v.optional(
  v.pipe(
    v.string(),
    v.transform((value) => value.trim()),
    v.check(
      (value) => value === '' || v.is(v.pipe(v.string(), v.uuid()), value),
      'That is not a valid id',
    ),
  ),
  '',
)

/**
 * `active` is every Lead that is neither Won nor Lost; `won` and `lost` are
 * their own lists; `trash` is Trash. `stage` narrows to one column — the
 * Board asks once per column with its own page.
 */
export const LEAD_VIEWS = ['active', 'won', 'lost', 'all', 'trash'] as const

export const LeadListQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(LEAD_PAGE_SIZE.default, LEAD_PAGE_SIZE.min, LEAD_PAGE_SIZE.max),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(LEAD_LIMITS.search)), ''),
  view: v.optional(v.picklist(LEAD_VIEWS), 'active'),
  stage: OptionalId,
  source: OptionalId,
  niche: OptionalId,
  country: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.toUpperCase(),
      v.check((value) => value === '' || /^[A-Z]{2}$/u.test(value), 'Choose a country'),
    ),
    '',
  ),
})

export type LeadListQuery = v.InferOutput<typeof LeadListQuerySchema>

export const ChoiceListQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(50, 1, 100),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(LEAD_LIMITS.choiceName)), ''),
  hidden: v.optional(v.picklist(['include', 'exclude'] as const), 'include'),
})

export type ChoiceListQuery = v.InferOutput<typeof ChoiceListQuerySchema>

export const FollowUpListQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(LEAD_PAGE_SIZE.default, LEAD_PAGE_SIZE.min, LEAD_PAGE_SIZE.max),
  /** `due`: due now or overdue. `upcoming`: later. `all`: every open one. */
  when: v.optional(v.picklist(['due', 'upcoming', 'all'] as const), 'all'),
})

export const LeadDuplicateQuerySchema = v.object({
  email: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(LEAD_LIMITS.email)), ''),
  phone: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(LEAD_LIMITS.phone)), ''),
  excludeId: v.optional(v.pipe(v.string(), v.uuid('That is not a valid lead id'))),
})

export const LeadDeleteSchema = v.object({ confirm: v.string('Send the lead id to confirm') })

/* ------------------------------------------------------------------ import */

/** Which file column holds each field, by 0-based index. */
export const IMPORT_FIELDS = [
  'name',
  'email',
  'phone',
  'country',
  'source',
  'company',
  'niche',
  'notes',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

const ColumnIndex = v.optional(
  v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(LEAD_IMPORT_LIMITS.columns - 1)),
  ),
  null,
)

export const ImportMappingSchema = v.object({
  name: ColumnIndex,
  email: ColumnIndex,
  phone: ColumnIndex,
  country: ColumnIndex,
  source: ColumnIndex,
  company: ColumnIndex,
  niche: ColumnIndex,
  notes: ColumnIndex,
})

export type ImportMapping = v.InferOutput<typeof ImportMappingSchema>

const ImportBody = {
  csv: v.pipe(v.string('Send the file contents'), v.nonEmpty('The file is empty')),
  fileName: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ''),
  /** Absent in a first preview, which then suggests one from the header. */
  mapping: v.optional(ImportMappingSchema),
  /**
   * Used for every row when the file has no country or source column. A
   * column, when mapped, always wins: a row whose own value cannot be
   * matched is rejected rather than quietly given the default.
   */
  countryDefault: v.optional(v.pipe(v.string(), v.trim(), v.toUpperCase()), ''),
  sourceDefaultId: v.optional(v.pipe(v.string(), v.trim()), ''),
}

export const ImportPreviewSchema = v.object(ImportBody)

export const ImportCommitSchema = v.object({
  ...ImportBody,
  mapping: ImportMappingSchema,
  /** One per confirmed import, generated by the browser. */
  idempotencyKey: Uuid('Send an import key'),
})

export type ImportPreviewInput = v.InferOutput<typeof ImportPreviewSchema>
export type ImportCommitInput = v.InferOutput<typeof ImportCommitSchema>

/* ------------------------------------------------------------------ replies */

export type LeadStage = {
  id: string
  kind: StageKind
  name: string
  /** Active stages only: 1-based among Contacted and custom ones. */
  position: number | null
  leadCount: number
}

export type LeadChoice = {
  id: string
  name: string
  hidden: boolean
  /** `Unknown` or `Other`: cannot be renamed, hidden or deleted. */
  locked: boolean
  leadCount: number
}

export type FollowUp = {
  id: string
  /** The instant, and the same moment as the owner reads it in Berlin. */
  dueAt: string
  date: string
  time: string
  note: string
  status: 'open' | 'done' | 'cancelled'
  closedHow: 'completed' | 'cancelled' | 'lost' | 'won' | null
  closedAt: string | null
  isDue: boolean
}

export type OwnerLead = {
  id: string
  name: string
  email: string
  phone: string
  country: Country
  company: string
  notes: string
  source: { id: string; name: string }
  niche: { id: string; name: string } | null
  stage: { id: string; kind: StageKind; name: string }
  stageChangedAt: string
  /** The latest loss, kept as history after a Lead is reopened. */
  lastLoss: { reason: string; notes: string; at: string } | null
  wonAt: string | null
  /** The Client this Lead became or joined, if any (and if it still exists). */
  client: { id: string; displayName: string; inTrash: boolean } | null
  followUp: FollowUp | null
  /** The last closed follow-ups, newest first — a short record, not a log. */
  followUpHistory: FollowUp[]
  fromImport: boolean
  trashedAt: string | null
  revision: number
  createdAt: string
  updatedAt: string
}

export type OwnerLeadListItem = Omit<
  OwnerLead,
  'notes' | 'followUpHistory' | 'lastLoss' | 'client'
> & {
  lostReason: string | null
}

export type LeadCandidate = {
  id: string
  name: string
  email: string
  phone: string
  stage: string
  inTrash: boolean
  matchedOn: Array<'email' | 'phone'>
}

export type FollowUpListItem = {
  lead: { id: string; name: string; company: string; stage: string }
  followUp: FollowUp
}

export type ImportRowVerdict = {
  /** In the file, counting the header as row 1. */
  row: number
  accepted: boolean
  reason: string | null
  lead: { name: string; email: string; phone: string; country: string; source: string } | null
}

export type ImportPreview = {
  header: string[]
  mapping: ImportMapping
  /** Required fields with no column (and, for country and source, no default). */
  missing: Array<'name' | 'email' | 'phone' | 'country' | 'source'>
  totalRows: number
  accepted: number
  rejected: number
  /** The first rows, each with its verdict, so the owner sees the mapping work. */
  rows: ImportRowVerdict[]
  /** Up to 50 rejections, so the owner can fix the file before importing. */
  rejections: Array<{ row: number; reason: string }>
}

export type ImportResult = {
  id: string
  fileName: string
  totalRows: number
  accepted: number
  rejected: number
  createdAt: string
}

/* ------------------------------------------------------------- Berlin time */

export const OWNER_TIME_ZONE = 'Europe/Berlin'

/** The Berlin wall-clock date and time of an instant. */
export const toBerlin = (instant: Date): { date: string; time: string } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OWNER_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'

  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  }
}

/**
 * The instant a Berlin wall-clock time names.
 *
 * Daylight saving handled on purpose: a time that does not exist (02:30 on
 * the spring morning) moves forward an hour, as a clock would; a time that
 * happens twice (02:30 on the autumn morning) is the first of the two.
 */
export const fromBerlin = (date: string, time: string): Date => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const [hour, minute] = time.split(':').map(Number) as [number, number]
  const wall = Date.UTC(year, month - 1, day, hour, minute)

  const offsetAt = (instant: number): number => {
    const seen = toBerlin(new Date(instant))
    const [sy, sm, sd] = seen.date.split('-').map(Number) as [number, number, number]
    const [sh, smin] = seen.time.split(':').map(Number) as [number, number]

    return Date.UTC(sy, sm - 1, sd, sh, smin) - instant
  }

  // Try the earlier offset first, so an ambiguous autumn time is the first one.
  const candidates = [
    wall - offsetAt(wall - 3 * 3600_000),
    wall - offsetAt(wall + 3 * 3600_000),
  ].sort((a, b) => a - b)

  for (const candidate of candidates) {
    const seen = toBerlin(new Date(candidate))

    if (seen.date === date && seen.time === time) return new Date(candidate)
  }

  // The skipped spring hour: the same wall time an hour later.
  // Read with the offset from before the jump, that is one hour later on the clock.
  return new Date(wall - offsetAt(wall - 3 * 3600_000))
}
