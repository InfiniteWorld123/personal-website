import * as v from 'valibot'
import {
  type ClientCandidate,
  type ClientFields,
  ClientFieldsSchema,
  type ClientKind,
  type OwnerClient,
} from '#/backend2/contracts/client.contract'
import { ApiRequestError } from '#/frontend/api/response'

/**
 * The Client form's values and rules.
 *
 * The rules are the server's own schema, run in the browser, so a field the
 * form accepts is a field the server accepts. Errors are keyed by field and
 * worded for the field they sit under.
 */

export type ClientFormValues = {
  kind: ClientKind
  name: string
  email: string
  phone: string
  country: string
  /** A Company's name, or a Person's optional company. One field, two labels. */
  companyName: string
  nicheId: string | null
  notes: string
}

export type ClientFormField = keyof ClientFormValues

export const emptyClientForm = (): ClientFormValues => ({
  kind: 'person',
  name: '',
  email: '',
  phone: '',
  country: '',
  companyName: '',
  nicheId: null,
  notes: '',
})

export const clientToForm = (client: OwnerClient): ClientFormValues => ({
  kind: client.kind,
  name: client.name,
  email: client.email,
  phone: client.phone,
  country: client.country.code,
  companyName: client.companyName,
  nicheId: client.niche?.id ?? null,
  notes: client.notes,
})

export const formToFields = (values: ClientFormValues): ClientFields => v.parse(ClientFieldsSchema, values)

/** A Company's contact is still a name; only the message changes. */
const reword = (field: string, message: string, kind: ClientKind): string => {
  if (field === 'name' && kind === 'company' && message === 'Enter a name') {
    return 'Enter the primary contact’s name'
  }

  if (field === 'country') return 'Choose a country from the list'

  return message
}

/** The first problem per field, or an empty object when the form is sendable. */
export const clientFormErrors = (values: ClientFormValues): Partial<Record<ClientFormField, string>> => {
  const result = v.safeParse(ClientFieldsSchema, values)

  if (result.success) return {}

  const errors: Partial<Record<ClientFormField, string>> = {}

  for (const issue of result.issues) {
    const field = v.getDotPath(issue) as ClientFormField | null

    if (field && !errors[field]) errors[field] = reword(field, issue.message, values.kind)
  }

  return errors
}

/** The server's field refusals, keyed the same way as the form's own. */
export const serverFieldErrors = (error: unknown): Partial<Record<ClientFormField, string>> => {
  if (!(error instanceof ApiRequestError)) return {}

  const issues = (error.details as { issues?: Array<{ field?: string; message: string }> } | undefined)?.issues

  const errors: Partial<Record<ClientFormField, string>> = {}

  for (const issue of issues ?? []) {
    if (issue.field && !errors[issue.field as ClientFormField]) {
      errors[issue.field as ClientFormField] = issue.message
    }
  }

  return errors
}

export const duplicateCandidates = (error: unknown): ClientCandidate[] | null =>
  error instanceof ApiRequestError && error.code === 'CLIENT_DUPLICATE'
    ? ((error.details as { candidates?: ClientCandidate[] } | undefined)?.candidates ?? [])
    : null

/* ------------------------------------------------------------------ words */

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()

export const formatDay = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  })

/** The line under a Client's name: who they are, not how they are stored. */
export const clientSubline = (client: { kind: ClientKind; name: string; companyName: string }): string => {
  if (client.kind === 'company') return `Contact: ${client.name}`
  if (client.companyName) return `At ${client.companyName}`

  return 'Person'
}
