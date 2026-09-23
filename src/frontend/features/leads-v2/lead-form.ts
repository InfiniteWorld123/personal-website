import * as v from 'valibot'
import {
  type FollowUp,
  type LeadCandidate,
  type LeadFields,
  LeadFieldsSchema,
  type OwnerLead,
  type StageKind,
} from '#/backend2/contracts/lead.contract'
import { ApiRequestError } from '#/frontend/api/response'

/**
 * The Lead form's values and rules — the server's own schema, run in the
 * browser, so a field the form accepts is one the server accepts. Errors are
 * keyed by field and worded for the field they sit under.
 */

export type LeadFormValues = {
  name: string
  email: string
  phone: string
  country: string
  sourceId: string
  company: string
  nicheId: string | null
  notes: string
}

export type LeadFormField = keyof LeadFormValues

export type LeadPrefill = Partial<Pick<LeadFormValues, 'name' | 'email' | 'phone' | 'company' | 'notes'>>

/** Empty, or filled from an owner-clicked "Create lead" in Inbox or Booking — for the owner to check. */
export const emptyLeadForm = (prefill: LeadPrefill = {}): LeadFormValues => ({
  name: prefill.name ?? '',
  email: prefill.email ?? '',
  phone: prefill.phone ?? '',
  country: '',
  sourceId: '',
  company: prefill.company ?? '',
  nicheId: null,
  notes: prefill.notes ?? '',
})

export const leadToForm = (lead: OwnerLead): LeadFormValues => ({
  name: lead.name,
  email: lead.email,
  phone: lead.phone,
  country: lead.country.code,
  sourceId: lead.source.id,
  company: lead.company,
  nicheId: lead.niche?.id ?? null,
  notes: lead.notes,
})

export const formToFields = (values: LeadFormValues): LeadFields => v.parse(LeadFieldsSchema, values)

const reword = (field: string, message: string): string => {
  if (field === 'country') return 'Choose a country from the list'
  if (field === 'sourceId') return 'Choose a source — Unknown is fine if you are not sure'

  return message
}

/** The first problem per field, or an empty object when the form is sendable. */
export const leadFormErrors = (values: LeadFormValues): Partial<Record<LeadFormField, string>> => {
  const result = v.safeParse(LeadFieldsSchema, values)

  if (result.success) return {}

  const errors: Partial<Record<LeadFormField, string>> = {}

  for (const issue of result.issues) {
    const field = v.getDotPath(issue) as LeadFormField | null

    if (field && !errors[field]) errors[field] = reword(field, issue.message)
  }

  return errors
}

/** The server's field refusals, keyed like the form's own (`lost.reasonText` stays as it is). */
export const serverFieldErrors = (error: unknown): Record<string, string> => {
  if (!(error instanceof ApiRequestError)) return {}

  const issues = (error.details as { issues?: Array<{ field?: string; message: string }> } | undefined)?.issues
  const errors: Record<string, string> = {}

  for (const issue of issues ?? []) {
    if (issue.field && !errors[issue.field]) errors[issue.field] = issue.message
  }

  return errors
}

export const leadCandidates = (error: unknown): LeadCandidate[] | null =>
  error instanceof ApiRequestError && error.code === 'LEAD_DUPLICATE'
    ? ((error.details as { candidates?: LeadCandidate[] } | undefined)?.candidates ?? [])
    : null

/* ------------------------------------------------------------------ words */

export const isTerminal = (kind: StageKind): boolean => kind === 'won' || kind === 'lost'

export const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  })

/** "Thu 25 Sept · 10:00" — a follow-up as the owner reads it, in Berlin. */
export const formatFollowUp = (followUp: Pick<FollowUp, 'date' | 'time'>): string => {
  const [year, month, day] = followUp.date.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(year, month - 1, day, 12))

  return `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })} · ${followUp.time}`
}

/** Today in Berlin as YYYY-MM-DD, for a date field's default and minimum. */
export const berlinToday = (): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()

/** A fresh idempotency key for one confirmed CSV import. */
export const newImportKey = (): string => crypto.randomUUID()
