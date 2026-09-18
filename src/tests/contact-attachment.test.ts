import { describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({
  env: {
    BASE_URL: 'https://yamanwarda.de',
    APP_NAME: 'Yaman Warda',
    EMAIL_FROM: 'info@yamanwarda.de',
    CONTACT_TO_EMAIL: 'info@yamanwarda.de',
  },
}))

const queries: Array<{ sql: string; values: unknown[] }> = []
let knownPerson: string | null = null

vi.mock('#/backend/db/client', () => ({
  getDb: () => ({
    query: async (sql: string, values: unknown[] = []) => {
      queries.push({ sql, values })

      if (/SELECT id FROM leads/i.test(sql)) {
        return { rows: knownPerson ? [{ id: knownPerson }] : [] }
      }
      if (/INSERT INTO leads/i.test(sql)) return { rows: [{ id: 'person-1' }] }
      if (/INSERT INTO lead_messages/i.test(sql)) return { rows: [{ id: 'message-1' }] }

      return { rows: [] }
    },
  }),
}))

const stored: Array<Record<string, unknown>> = []
let storeFails = false

vi.mock('#/backend/modules/inbox/attachment.service', () => ({
  storeAttachmentBytes: async (input: Record<string, unknown>) => {
    if (storeFails) throw new Error('Files can only be stored on the live site')

    stored.push(input)

    return { id: 'file-1' }
  },
}))

vi.mock('#/backend/shared/mail', () => ({
  sendMail: async () => ({ accepted: true }),
  layout: () => '',
  plainText: () => '',
  button: () => '',
  escapeHtml: (value: string) => value,
}))

import { recordContactMessage } from '#/backend/modules/inbox/contact.service'

/**
 * The document a stranger attaches to the contact form.
 *
 * Until 18 Sep 2026 the bytes were read once to check the file was really a
 * PDF or an image, and then dropped: only the name and the size survived, on
 * a column nothing displayed. A client could send a signed contract through
 * the form and the inbox showed no sign a file had ever existed. Proven by
 * sending one through the live form and finding nothing.
 */
const enquiry = {
  name: 'Testkunde',
  email: 'kunde@example.com',
  company: '',
  phone: '',
  projectType: 'website',
  budget: '',
  timeline: '',
  message: 'Anbei mein Vertrag.',
  language: 'de',
} as Parameters<typeof recordContactMessage>[0]

const file = () => ({
  name: 'Vertrag.pdf',
  bytes: 4,
  contentType: 'application/pdf',
  content: new Uint8Array([1, 2, 3, 4]) as Uint8Array<ArrayBuffer>,
})

const reset = (existing: string | null = null) => {
  queries.length = 0
  stored.length = 0
  storeFails = false
  knownPerson = existing
}

describe('a file sent through the contact form is kept', () => {
  it('stores the real bytes for a first-time sender, filed against the person', async () => {
    reset()

    await recordContactMessage(enquiry, file())

    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({
      personId: 'person-1',
      filename: 'Vertrag.pdf',
      contentType: 'application/pdf',
      direction: 'IN',
    })
    // A first enquiry has no letter of its own, so the file hangs off nothing.
    expect(stored[0]?.messageId).toBeUndefined()
    expect((stored[0]?.bytes as Uint8Array).byteLength).toBe(4)
  })

  it('ties the file to the letter when the person has written before', async () => {
    reset('person-9')

    await recordContactMessage(enquiry, file())

    expect(stored[0]).toMatchObject({ personId: 'person-9', messageId: 'message-1' })
  })

  it('says so in the letter rather than losing the message when the store refuses', async () => {
    reset()
    storeFails = true

    await expect(recordContactMessage(enquiry, file())).resolves.toMatchObject({
      personId: 'person-1',
    })

    const note = queries.find(({ sql }) => /UPDATE leads SET message/i.test(sql))

    expect(note?.values[1]).toContain('[Could not be kept: Vertrag.pdf]')
  })

  it('stores nothing at all when no file was attached', async () => {
    reset()

    await recordContactMessage(enquiry, null)

    expect(stored).toHaveLength(0)
  })
})
