import { withTransaction } from '../../db/client'
import type { Page } from '../../contracts/pagination.contract'
import {
  CLIENT_DUPLICATE_LIMIT,
  type ClientCandidate,
  type ClientFields,
  ClientFieldsSchema,
  type ClientListQuery,
  type ClientPatch,
  type ClientStatus,
  type OwnerClient,
  type OwnerClientListItem,
  emailKey,
  phoneKey,
} from '../../contracts/client.contract'
import {
  badRequest,
  clientDeleteBlocked,
  clientDuplicate,
  clientInTrash,
  conflict,
  notFound,
} from '../../http/error'
import { parseInput } from '../../http/validate'
import { assertNicheChoice } from '../niches/niche.service'
import * as repo from './client.repo'
import { toCandidate, toFields, toListItem, toOwnerClient } from './client.mapper'

/**
 * What a Clients request actually does. See `docs/v2/clients.md`.
 *
 * The directory stands on its own: nothing here reads Inbox, Booking,
 * Services or Projects, and nothing here is attached to a Client because two
 * rows share an email address. The one other module that may create a Client
 * is Leads, at `Won`, through `client.won.ts`.
 */

const missing = () => notFound('That client does not exist')

/* ------------------------------------------------------------------ reading */

export const getClient = async (id: string): Promise<OwnerClient> => {
  const row = await repo.findClient(id)

  if (!row) throw missing()

  return toOwnerClient(row, await repo.leadLinksFor(id))
}

export const listClients = async (query: ClientListQuery): Promise<Page<OwnerClientListItem>> => {
  const first = await repo.listClients(query)
  const pageCount = Math.max(1, Math.ceil(first.total / query.pageSize))

  // A page past the end is clamped: a narrower filter must not strand the
  // owner on page 4 of 2.
  const page = Math.min(query.page, pageCount)
  const result = page === query.page ? first : await repo.listClients({ ...query, page })
  const withLeads = await repo.clientsWithLeads(result.rows.map((row) => row.id))

  return {
    items: result.rows.map((row) => toListItem(row, withLeads.has(row.id))),
    page,
    pageSize: query.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
  }
}

/**
 * Likely duplicates by email or phone. A warning to act on, never a merge:
 * the owner opens the match, or continues anyway.
 */
export const findDuplicates = async (input: {
  email: string
  phone: string
  excludeId?: string
}): Promise<ClientCandidate[]> => {
  const keys = {
    emailKey: emailKey(input.email),
    phoneKey: phoneKey(input.phone),
  }

  // A fragment of a phone is not a phone; do not warn on "+49".
  if (keys.phoneKey.replace(/\D/gu, '').length < 6) keys.phoneKey = ''

  const rows = await repo.findMatches({
    ...keys,
    excludeId: input.excludeId,
    limit: CLIENT_DUPLICATE_LIMIT,
  })

  return rows.map((row) => toCandidate(row, keys))
}

/* ----------------------------------------------------------------- creating */

export const createClient = async (
  input: ClientFields & { allowDuplicate: boolean },
): Promise<OwnerClient> => {
  const { allowDuplicate, ...fields } = input

  if (!allowDuplicate) {
    const candidates = await findDuplicates({
      email: fields.email,
      phone: fields.phone,
    })

    if (candidates.length > 0) {
      throw clientDuplicate('A client with this email or phone is already on file', { candidates })
    }
  }

  await assertNicheChoice({ nicheId: fields.nicheId })

  const id = await repo.insertClient(fields)

  return getClient(id)
}

/* ------------------------------------------------------------------ editing */

const staleRevision = () =>
  conflict('This client was changed somewhere else. Reload to see the newer version.')

/**
 * Only what is sent changes, laid over the file and then checked as a whole.
 *
 * Changing the type is just another field: the person's name, email, phone
 * and notes stay in the same columns, so a Person becoming a Company loses
 * nothing. A save that changes nothing writes nothing and keeps the revision.
 */
export const patchClient = async (input: {
  clientId: string
  revision: number
  patch: ClientPatch
}): Promise<OwnerClient> => {
  await withTransaction(async () => {
    const row = await repo.lockClient(input.clientId)

    if (!row) throw missing()
    if (row.trashed_at) throw clientInTrash('Restore this client from Trash before editing it')
    if (row.revision !== input.revision) throw staleRevision()

    const current = toFields(row)
    const defined = Object.fromEntries(
      Object.entries(input.patch).filter(([, value]) => value !== undefined),
    ) as Partial<ClientFields>
    const next = parseInput(ClientFieldsSchema, { ...current, ...defined })

    if (JSON.stringify(next) === JSON.stringify(current)) return

    // A hidden niche the Client already has stays; a new choice must be visible.
    await assertNicheChoice({ nicheId: next.nicheId, currentNicheId: current.nicheId })
    await repo.writeClient(row.id, next)
  })

  return getClient(input.clientId)
}

/* ---------------------------------------------------------------- lifecycle */

export const setClientStatus = async (input: {
  clientId: string
  status: ClientStatus
}): Promise<OwnerClient> => {
  await withTransaction(async () => {
    const row = await repo.lockClient(input.clientId)

    if (!row) throw missing()
    if (row.trashed_at) throw clientInTrash('Restore this client from Trash first')

    await repo.setStatus(row.id, input.status)
  })

  return getClient(input.clientId)
}

/**
 * Into Trash, keeping everything — including Active or Inactive, which it
 * returns with. Idempotent: trashing twice keeps the first date.
 */
export const trashClient = async (clientId: string): Promise<OwnerClient> => {
  await withTransaction(async () => {
    const row = await repo.lockClient(clientId)

    if (!row) throw missing()

    await repo.setTrashed(row.id, true)
  })

  return getClient(clientId)
}

export const restoreClient = async (clientId: string): Promise<OwnerClient> => {
  await withTransaction(async () => {
    const row = await repo.lockClient(clientId)

    if (!row) throw missing()

    await repo.setTrashed(row.id, false)
  })

  return getClient(clientId)
}

/**
 * PostgreSQL's "another row still points at this one": `23001` from an
 * ON DELETE RESTRICT key, `23503` from a plain one.
 */
const isForeignKeyViolation = (error: unknown): boolean => {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : null

  return code === '23001' || code === '23503'
}

/**
 * Permanent, from Trash only, and it asks for the Client's own id back.
 *
 * Removes the Client and its Lead links — never the Lead, a conversation, an
 * appointment, a project, a file or an invoice. A Client an invoice points at
 * cannot go: the Invoices tables will hold that key with ON DELETE RESTRICT,
 * and the database's refusal is reported here as a reason the owner can act
 * on (keep the Client Inactive instead).
 */
export const deleteClientPermanently = async (input: {
  clientId: string
  confirm: string
}): Promise<{ id: string; deleted: true }> => {
  if (input.confirm !== input.clientId) {
    throw badRequest('Send the client id to confirm the permanent deletion')
  }

  try {
    await withTransaction(async () => {
      const row = await repo.lockClient(input.clientId)

      if (!row) throw missing()
      if (!row.trashed_at)
        throw conflict('Move this client to Trash before deleting it permanently')

      await repo.deleteClient(row.id)
    })
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw clientDeleteBlocked(
        'This client has invoices, so it cannot be deleted. Mark it Inactive instead.',
      )
    }

    throw error
  }

  return { id: input.clientId, deleted: true }
}

/** For the Won handoff: the fields a Lead's copy must satisfy. */
export const validateFields = (fields: ClientFields): ClientFields =>
  parseInput(ClientFieldsSchema, fields)
