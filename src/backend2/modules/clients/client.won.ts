import { getDb, withTransaction } from '../../db/client'
import {
  CLIENT_LIMITS,
  type LeadForClient,
  type WonClientChoice,
  type WonClientResult,
  leadNotesHeading,
} from '../../contracts/client.contract'
import { clientDuplicate, clientInTrash, notFound, validationFailed } from '../../http/error'
import { assertNicheChoice } from '../niches/niche.service'
import * as repo from './client.repo'
import { toFields } from './client.mapper'
import { findDuplicates, validateFields } from './client.service'

/**
 * The narrow operation Leads calls when a Lead moves to `Won`.
 *
 * `docs/v2/clients.md`, "Lead `Won` → Client contract". Leads owns the stage
 * change; this owns what it does to the directory, and nothing else may
 * create a Client on another module's behalf.
 *
 * It **joins** the caller's transaction (`withTransaction` does that on its
 * own), so the Lead's move to `Won` and the Client's creation or link commit
 * together or not at all. A throw from here leaves the Lead where it was.
 *
 * Idempotent per Lead. The link row is keyed by the Lead, so a retry, a
 * double click or a return to `Won` after a reversal finds the Client it
 * already has: no second Client, and no second copy of the notes.
 */

/** Today in the owner's timezone, for the heading over appended notes. */
const berlinDate = (now: Date): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

/**
 * Appends a Lead's notes to a Client's, once, under a clear separator. The
 * Client's own text is kept exactly as it was, above.
 */
export const appendLeadNotes = (input: {
  clientNotes: string
  leadName: string
  leadNotes: string
  now: Date
}): string => {
  const addition = input.leadNotes.trim()

  if (addition === '') return input.clientNotes

  const block = `${leadNotesHeading(input.leadName, berlinDate(input.now))}\n${addition}`
  const existing = input.clientNotes.replace(/\s+$/u, '')

  return existing === '' ? block : `${existing}\n\n${block}`
}

/** One conversion at a time per Lead, even from two tabs. */
const lockLead = async (leadId: string): Promise<void> => {
  await getDb().query(`SELECT pg_advisory_xact_lock(hashtext('v2_client_lead_links:' || $1))`, [
    leadId,
  ])
}

export const convertLeadToClient = (input: {
  lead: LeadForClient
  choice: WonClientChoice
  now?: Date
}): Promise<WonClientResult> =>
  withTransaction(async () => {
    const { lead, choice } = input

    await lockLead(lead.id)

    /*
     * Already converted: reuse, whatever the owner chose this time. A Client
     * waiting in Trash is not silently brought back — the owner restores it
     * on purpose, and the Lead stays where it was until then.
     */
    const existing = await repo.findLeadLink(lead.id)

    if (existing) {
      const client = await repo.lockClient(existing.client_id)

      if (!client) throw notFound('The client this lead was linked to no longer exists')
      if (client.trashed_at) {
        throw clientInTrash('This lead’s client is in Trash. Restore it first, then try again.', {
          clientId: client.id,
        })
      }

      return { clientId: client.id, outcome: 'reused' }
    }

    if (choice.mode === 'link') {
      const client = await repo.lockClient(choice.clientId)

      if (!client) throw notFound('That client does not exist')
      if (client.trashed_at) {
        throw clientInTrash('That client is in Trash. Restore it before linking it.', {
          clientId: client.id,
        })
      }

      const notes = appendLeadNotes({
        clientNotes: client.notes,
        leadName: lead.name,
        leadNotes: lead.notes,
        now: input.now ?? new Date(),
      })

      if (notes.length > CLIENT_LIMITS.notes) {
        throw validationFailed('The combined notes would be too long for this client', {
          issues: [
            {
              field: 'notes',
              message: 'The combined notes would be too long',
            },
          ],
          missing: [],
        })
      }

      if (notes !== client.notes) await repo.writeClient(client.id, { ...toFields(client), notes })

      await repo.insertLeadLink({
        leadId: lead.id,
        clientId: client.id,
        how: 'linked',
      })

      return { clientId: client.id, outcome: 'linked' }
    }

    /*
     * A new Person, always — even when the Lead has a company. Becoming a
     * Company later is the owner's explicit edit, never inferred.
     */
    const fields = validateFields({
      kind: 'person',
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      country: lead.country,
      companyName: lead.company,
      nicheId: lead.nicheId ?? null,
      notes: lead.notes,
    })

    // The Lead's own niche travels with it, even one hidden since.
    await assertNicheChoice({ nicheId: fields.nicheId, allowHidden: true })

    if (!choice.allowDuplicate) {
      const candidates = (await findDuplicates({ email: fields.email, phone: '' })).filter((c) =>
        c.matchedOn.includes('email'),
      )

      if (candidates.length > 0) {
        throw clientDuplicate('A client with this email is already on file. Link it instead?', {
          candidates,
        })
      }
    }

    const clientId = await repo.insertClient(fields)

    await repo.insertLeadLink({ leadId: lead.id, clientId, how: 'created' })

    return { clientId, outcome: 'created' }
  })

/** The Client a Lead is linked to, if any. For the Lead's own file. */
export const clientForLead = async (leadId: string): Promise<string | null> =>
  (await repo.findLeadLink(leadId))?.client_id ?? null
