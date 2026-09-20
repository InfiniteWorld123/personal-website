import { getDb } from '#/backend/db/client'
import { badRequestError, notFoundError } from '#/backend/shared/error'
import type { Client } from '#/shared/types/invoice.types'
import type { ClientWriteInput } from '#/shared/validation/invoice.validation'
import { CLIENT_COLUMNS, COUNTS, OWED, projectClient, type ClientShape } from './invoice.sql'

/**
 * Clients — the people he actually bills.
 *
 * Kept apart from `leads` on his instruction (question 6, option B). The two
 * answer different questions: a lead is anyone who wrote, and holds a mailbox;
 * a client holds a postal address and a legal name, which mean nothing on a
 * stranger who sent one enquiry. `lead_id` keeps the thread between them
 * without making either depend on the other.
 */

/**
 * What each client still has out with him, alongside their name.
 *
 * Two correlated subqueries rather than a join with `GROUP BY`: an invoice may
 * have several payments, and a join across both tables multiplies rows before
 * it sums them — the classic way a client's balance quietly doubles.
 *
 * `COUNTS` and `OWED` are the same two strings the figures on the invoice
 * list are built from, and that is not a tidiness: until 20 Sep this summed
 * `total − paid` over every issued row, and a *cancellation* is an issued row
 * carrying the original's total. Cancel a 990 € invoice and this client read
 * "990 € open" — for a debt that had just been voided — while the list said
 * nothing was owed. Credit notes were the same wrong twice: not subtracted
 * from the invoice, and added as documents of their own.
 */
const WITH_TOTALS = `(SELECT COUNT(*) FROM invoices i WHERE i.client_id = c.id) AS invoice_count,
        (SELECT COALESCE(SUM(${OWED}), 0)
           FROM invoices i WHERE i.client_id = c.id AND ${COUNTS}) AS open_cents`

export const listClients = async (search: string): Promise<Client[]> => {
  const term = search.trim()

  const result = await getDb().query<ClientShape>(
    `SELECT ${CLIENT_COLUMNS}, ${WITH_TOTALS}
       FROM clients c
      WHERE $1 = ''
         OR c.company ILIKE '%' || $1 || '%'
         OR c.contact_name ILIKE '%' || $1 || '%'
         OR c.email ILIKE '%' || $1 || '%'
         OR c.city ILIKE '%' || $1 || '%'
      ORDER BY COALESCE(NULLIF(btrim(c.company), ''), c.contact_name)
      LIMIT 300;`,
    [term],
  )

  return result.rows.map(projectClient)
}

export const getClient = async (clientId: string): Promise<Client> => {
  const result = await getDb().query<ClientShape>(
    `SELECT ${CLIENT_COLUMNS}, ${WITH_TOTALS} FROM clients c WHERE c.id = $1;`,
    [clientId],
  )

  const row = result.rows[0]

  if (!row) throw notFoundError('That client is not here')

  return projectClient(row)
}

const VALUES = `company = $2, contact_name = $3, email = $4, phone = $5,
        street = $6, street_extra = $7, postcode = $8, city = $9, country = $10,
        vat_id = $11, language = $12, notes = $13, lead_id = $14`

const parametersOf = (input: ClientWriteInput): unknown[] => [
  input.company,
  input.contactName,
  input.email,
  input.phone,
  input.street,
  input.streetExtra,
  input.postcode,
  input.city,
  input.country,
  input.vatId,
  input.language,
  input.notes,
  input.leadId ?? null,
]

export const createClient = async (input: ClientWriteInput): Promise<Client> => {
  const result = await getDb().query<{ id: string }>(
    `INSERT INTO clients
       (company, contact_name, email, phone, street, street_extra, postcode, city,
        country, vat_id, language, notes, lead_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING id;`,
    parametersOf(input),
  )

  return getClient(result.rows[0]!.id)
}

/**
 * Editing a client.
 *
 * The address on an **issued** invoice does not move with it, and cannot: the
 * PDF was frozen with the address it was sent to, and that file is the
 * document. Changing a client here changes where the *next* invoice goes,
 * which is the only thing anybody ever means by it.
 */
export const updateClient = async (
  clientId: string,
  input: ClientWriteInput,
): Promise<Client> => {
  const result = await getDb().query(
    `UPDATE clients SET ${VALUES}, updated_at = CURRENT_TIMESTAMP WHERE id = $1;`,
    [clientId, ...parametersOf(input)],
  )

  if (result.rowCount === 0) throw notFoundError('That client is not here')

  return getClient(clientId)
}

/**
 * Removing a client.
 *
 * Refused while anything has ever been billed to them. `ON DELETE RESTRICT` on
 * `invoices.client_id` would refuse it anyway, with a foreign-key error nobody
 * can read; this says the same thing in a sentence, and says how many.
 */
export const deleteClient = async (clientId: string): Promise<void> => {
  const client = await getClient(clientId)

  if (client.invoiceCount > 0) {
    throw badRequestError(
      `${client.invoiceCount === 1 ? 'An invoice was' : `${client.invoiceCount} invoices were`} issued to this client, so they stay in the books.`,
    )
  }

  /*
   * A subscription that has not written its first invoice yet holds the
   * client just as firmly — `subscriptions.client_id` is `RESTRICT` too — but
   * the count above does not see it, so the delete reached the database and
   * came back as a foreign-key error with a constraint name in it.
   */
  const subscribed = await getDb().query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM subscriptions WHERE client_id = $1;',
    [clientId],
  )

  if (Number(subscribed.rows[0]?.count ?? 0) > 0) {
    throw badRequestError(
      'This client has a subscription. Stop or remove the subscription first, then the client can go.',
    )
  }

  await getDb().query('DELETE FROM clients WHERE id = $1;', [clientId])
}

/**
 * The client a person in the inbox already is, or a new one made from them.
 *
 * His answer to question 3 was "both doors": an invoice can start from a won
 * deal, and a won deal belongs to a person, not a client. This is the bridge —
 * it never creates a duplicate, because a second invoice for the same person
 * finds the client the first one made.
 */
export const clientForLead = async (leadId: string): Promise<Client> => {
  const existing = await getDb().query<ClientShape>(
    `SELECT ${CLIENT_COLUMNS}, ${WITH_TOTALS} FROM clients c WHERE c.lead_id = $1 LIMIT 1;`,
    [leadId],
  )

  const row = existing.rows[0]

  if (row) return projectClient(row)

  const person = await getDb().query<{ name: string; email: string; company: string | null }>(
    'SELECT name, email, company FROM leads WHERE id = $1;',
    [leadId],
  )

  const found = person.rows[0]

  if (!found) throw notFoundError('That person is not here')

  return createClient({
    company: found.company ?? '',
    contactName: found.name,
    email: found.email,
    phone: '',
    street: '',
    streetExtra: '',
    postcode: '',
    city: '',
    country: 'DE',
    vatId: '',
    language: 'de',
    notes: '',
    leadId,
  })
}
