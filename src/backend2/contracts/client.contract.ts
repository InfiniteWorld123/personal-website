import * as v from 'valibot'
import { type Country, CountryCodeSchema } from './country.contract'

/**
 * The Clients contract, shared by the server and the Dashboard.
 *
 * See `docs/v2/clients.md`. Pure — valibot and plain TypeScript — so the
 * TanStack Form in the Dashboard and the server enforce the identical rules.
 *
 * Billing address, tax numbers and payment details are deliberately absent:
 * they belong to the Invoices specification, and guessing them here would put
 * a requirement on every Client that the owner never agreed to.
 */

export const CLIENT_KINDS = ['person', 'company'] as const
export type ClientKind = (typeof CLIENT_KINDS)[number]

export const CLIENT_STATUSES = ['active', 'inactive'] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export const CLIENT_LIMITS = {
  name: 160,
  /** RFC 5321's practical ceiling for an address. */
  email: 254,
  phone: 40,
  companyName: 200,
  notes: 20_000,
  search: 120,
} as const

/** The directory, in pages of 25, at most 100. */
export const CLIENT_PAGE_SIZE = { min: 1, default: 25, max: 100 } as const

/** How many possible duplicates a warning names. Enough to choose from. */
export const CLIENT_DUPLICATE_LIMIT = 10

/* ------------------------------------------------------------ normalisation */

/**
 * The phone as a matching key: its digits, with `+` for an international
 * number and `00` read as `+`. Only for finding the same phone written two
 * ways — the owner's own spelling is what is stored and shown.
 */
export const phoneKey = (phone: string): string => {
  const trimmed = phone.trim()

  if (trimmed === '') return ''

  const digits = trimmed.replace(/\D/gu, '')

  if (trimmed.startsWith('+')) return `+${digits}`
  if (digits.startsWith('00')) return `+${digits.slice(2)}`

  return digits
}

export const emailKey = (email: string): string => email.trim().toLowerCase()

/* ------------------------------------------------------------------ fields */

const Name = v.pipe(
  v.string('Enter a name'),
  v.trim(),
  v.nonEmpty('Enter a name'),
  v.maxLength(CLIENT_LIMITS.name, `Keep the name under ${CLIENT_LIMITS.name} characters`),
)

const Email = v.pipe(
  v.string('Enter an email address'),
  v.trim(),
  v.nonEmpty('Enter an email address'),
  v.maxLength(CLIENT_LIMITS.email, 'That email address is too long'),
  v.email('Enter a valid email address'),
)

/**
 * Optional, but a phone that is there must look like one: the characters
 * people write in a phone number, and between 6 and 17 digits.
 */
const Phone = v.pipe(
  v.optional(v.string(), ''),
  v.trim(),
  v.maxLength(CLIENT_LIMITS.phone, 'That phone number is too long'),
  v.check(
    (value) => value === '' || /^\+?[\d\s().\-/]+$/u.test(value),
    'Use only digits, spaces and + ( ) - / .',
  ),
  v.check((value) => {
    if (value === '') return true

    const digits = value.replace(/\D/gu, '').length

    return digits >= 6 && digits <= 17
  }, 'Enter a complete phone number'),
)

const CompanyName = v.pipe(
  v.optional(v.string(), ''),
  v.trim(),
  v.maxLength(
    CLIENT_LIMITS.companyName,
    `Keep the company name under ${CLIENT_LIMITS.companyName} characters`,
  ),
)

const Notes = v.pipe(
  v.optional(v.string(), ''),
  v.maxLength(CLIENT_LIMITS.notes, `Keep the notes under ${CLIENT_LIMITS.notes} characters`),
)

/* -------------------------------------------------------------- the payload */

/**
 * One Client file's editable contents.
 *
 * `name` is the Person's own name, or the Company's primary contact. For a
 * Person, `companyName` is an optional affiliation; for a Company it is
 * required, and it is only a directory label — not a verified legal billing
 * identity, which Invoices will own.
 */
export type ClientFields = {
  kind: ClientKind
  name: string
  email: string
  phone: string
  country: string
  companyName: string
  /** The owner's niche for this Client — a salon, plumbers. Optional. */
  nicheId: string | null
  notes: string
}

/** Optional: a niche from the owner's list, or none. */
const NicheId = v.optional(
  v.nullable(v.pipe(v.string(), v.uuid('Choose a niche from the list'))),
  null,
)

const fieldEntries = {
  kind: v.picklist(CLIENT_KINDS, 'Choose Person or Company'),
  name: Name,
  email: Email,
  phone: Phone,
  country: CountryCodeSchema,
  companyName: CompanyName,
  nicheId: NicheId,
  notes: Notes,
}

/**
 * The rule that depends on two fields, reported on the field it is about so
 * the form shows it under the company name.
 */
const onCompanyName = <
  TSchema extends v.GenericSchema<unknown, { kind: ClientKind; companyName: string }>,
>(
  schema: TSchema,
) =>
  v.pipe(
    schema,
    v.rawCheck(({ dataset, addIssue }) => {
      if (!dataset.typed) return

      const value = dataset.value as { kind: ClientKind; companyName: string }

      if (value.kind === 'company' && value.companyName === '') {
        addIssue({
          message: 'Enter the company name',
          path: [
            {
              type: 'object',
              origin: 'value',
              input: value as Record<string, unknown>,
              key: 'companyName',
              value: value.companyName,
            },
          ],
        })
      }
    }),
  )

export const ClientFieldsSchema = onCompanyName(v.object(fieldEntries))

/**
 * Direct creation. `allowDuplicate` is the owner having looked at the likely
 * match and chosen to continue anyway; without it a match is a warning, not a
 * save.
 */
export const CreateClientSchema = onCompanyName(
  v.object({ ...fieldEntries, allowDuplicate: v.optional(v.boolean(), false) }),
)

/**
 * An edit: only what is sent changes, and it carries the revision the owner
 * was looking at. The whole file is validated again after the merge, so
 * switching a Person to Company without a company name is refused.
 */
export const ClientPatchSchema = v.object({
  revision: v.pipe(v.number('Send the revision you edited'), v.integer(), v.minValue(1)),
  kind: v.optional(fieldEntries.kind),
  name: v.optional(Name),
  email: v.optional(Email),
  phone: v.optional(Phone),
  country: v.optional(CountryCodeSchema),
  companyName: v.optional(CompanyName),
  nicheId: v.optional(v.nullable(v.pipe(v.string(), v.uuid('Choose a niche from the list')))),
  notes: v.optional(Notes),
})

export type ClientPatch = Omit<v.InferOutput<typeof ClientPatchSchema>, 'revision'>

export const ClientStatusSchema = v.object({
  status: v.picklist(CLIENT_STATUSES, 'Choose Active or Inactive'),
})

/** Permanent deletion asks for the Client's own id back. */
export const ClientDeleteSchema = v.object({
  confirm: v.string('Send the client id to confirm'),
})

/* ------------------------------------------------------------------- lists */

const IntFromQuery = (fallback: number, min: number, max: number) =>
  v.pipe(
    v.optional(v.union([v.string(), v.number()]), fallback),
    v.transform((value) => (typeof value === 'number' ? value : Number(value.trim()))),
    v.number('That is not a number'),
    v.integer('That is not a whole number'),
    v.minValue(min, 'That is below the smallest allowed value'),
    v.maxValue(max, 'That is above the largest allowed value'),
  )

export const CLIENT_KIND_FILTERS = ['all', ...CLIENT_KINDS] as const
export const CLIENT_STATUS_FILTERS = ['all', ...CLIENT_STATUSES] as const

export const ClientListQuerySchema = v.object({
  page: IntFromQuery(1, 1, 100_000),
  pageSize: IntFromQuery(CLIENT_PAGE_SIZE.default, CLIENT_PAGE_SIZE.min, CLIENT_PAGE_SIZE.max),
  search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(CLIENT_LIMITS.search)), ''),
  kind: v.optional(v.picklist(CLIENT_KIND_FILTERS), 'all'),
  /** One niche, by id. Absent or empty is every niche. */
  niche: v.optional(
    v.pipe(
      v.string(),
      v.transform((value) => value.trim()),
      v.check(
        (value) => value === '' || v.is(v.pipe(v.string(), v.uuid()), value),
        'That is not a niche',
      ),
    ),
    '',
  ),
  /** Active by default: Inactive Clients leave the default list. */
  status: v.optional(v.picklist(CLIENT_STATUS_FILTERS), 'active'),
  /** The directory, or Trash. Never both at once. */
  view: v.optional(v.picklist(['directory', 'trash'] as const), 'directory'),
})

export type ClientListQuery = v.InferOutput<typeof ClientListQuerySchema>

/** The live duplicate check the create form asks while the owner types. */
export const ClientDuplicateQuerySchema = v.object({
  email: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(CLIENT_LIMITS.email)), ''),
  phone: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(CLIENT_LIMITS.phone)), ''),
  excludeId: v.optional(v.pipe(v.string(), v.uuid('That is not a valid client id'))),
})

/* ------------------------------------------------------------------ replies */

export type ClientLeadLink = {
  leadId: string
  /** `created`: this Lead made the Client. `linked`: joined an existing one. */
  how: 'created' | 'linked'
  linkedAt: string
}

export type OwnerClient = {
  id: string
  kind: ClientKind
  /** Company name for a Company, the person's name for a Person. */
  displayName: string
  name: string
  email: string
  phone: string
  country: Country
  companyName: string
  niche: { id: string; name: string } | null
  notes: string
  status: ClientStatus
  trashedAt: string | null
  revision: number
  createdAt: string
  updatedAt: string
  /** The Leads this Client came from or was linked to, oldest first. */
  leads: ClientLeadLink[]
}

export type OwnerClientListItem = Omit<OwnerClient, 'notes' | 'leads'> & {
  /** Whether any Lead is linked, so the list can say where a Client came from. */
  fromLead: boolean
}

/** A possible duplicate, with enough to recognise it and open it. */
export type ClientCandidate = {
  id: string
  kind: ClientKind
  displayName: string
  name: string
  email: string
  phone: string
  status: ClientStatus
  inTrash: boolean
  /** What matched, so the warning can say why it is shown. */
  matchedOn: Array<'email' | 'phone'>
}

export const clientDisplayName = (client: {
  kind: ClientKind
  name: string
  companyName: string
}): string =>
  client.kind === 'company' && client.companyName !== '' ? client.companyName : client.name

/* ------------------------------------------------------- Lead `Won` handoff */

/**
 * What the Leads module hands over when a Lead moves to `Won`.
 *
 * Leads owns the transition; Clients owns what it creates. The operation runs
 * inside the Lead's own transaction, so both succeed together or neither does
 * (`docs/v2/clients.md`, "Lead `Won` → Client contract").
 */
export type LeadForClient = {
  id: string
  name: string
  email: string
  phone: string
  country: string
  company: string
  /** Copied onto a new Client; never onto an existing one on link. */
  nicheId?: string | null
  notes: string
}

/**
 * The owner's choice at `Won`. `create` makes a new Person Client and is
 * refused while a Client shares the Lead's email, unless the owner has looked
 * and chosen `allowDuplicate`. `link` joins the one existing Client the owner
 * picked. Never a merge by email alone.
 */
export type WonClientChoice =
  { mode: 'create'; allowDuplicate?: boolean } | { mode: 'link'; clientId: string }

export const WonClientChoiceSchema = v.variant('mode', [
  v.object({
    mode: v.literal('create'),
    allowDuplicate: v.optional(v.boolean(), false),
  }),
  v.object({
    mode: v.literal('link'),
    clientId: v.pipe(v.string(), v.uuid('Choose a client')),
  }),
])

export type WonClientResult = {
  clientId: string
  /**
   * `created` or `linked` the first time; `reused` when this Lead already had
   * its Client — a retry, or a return to `Won` after a reversal.
   */
  outcome: 'created' | 'linked' | 'reused'
}

/** The separator a linked Lead's notes are appended under, once. */
export const leadNotesHeading = (leadName: string, date: string): string =>
  `--- Notes from lead "${leadName}" (${date}) ---`
