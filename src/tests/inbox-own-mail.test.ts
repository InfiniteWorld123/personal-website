import { describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({
  env: {
    BASE_URL: 'https://yamanwarda.de',
    APP_NAME: 'Yaman Warda',
    EMAIL_FROM: 'info@yamanwarda.de',
    CONTACT_TO_EMAIL: 'info@yamanwarda.de',
    INBOUND_MAIL_ADDRESS: 'reply@yamanwarda.de',
  },
}))

const queries: Array<{ sql: string; values: unknown[] }> = []

vi.mock('#/backend/db/client', () => ({
  getDb: () => ({
    query: async (sql: string, values: unknown[] = []) => {
      queries.push({ sql, values })

      if (/INSERT INTO leads/i.test(sql)) return { rows: [{ id: 'person-1' }] }
      if (/INSERT INTO lead_messages/i.test(sql)) return { rows: [{ id: 'message-1' }] }

      return { rows: [] }
    },
  }),
}))

import { recordMail } from '#/backend/modules/inbox/message.service'

/**
 * The letter the site wrote to itself.
 *
 * The contact form notifies the owner at `CONTACT_TO_EMAIL`, which is his own
 * `info@`. On 18 Sep 2026 `info@` was pointed at the mail Worker so that real
 * client mail would reach the inbox — and that notification immediately came
 * back in, matched no conversation, and was filed as a new person named after
 * the provider's per-message bounce address. One junk row per enquiry, sitting
 * beside the client it was announcing.
 *
 * These pin the guard. The envelope sender is checked by *domain*, because a
 * provider never sends from the `From:` header a reader sees.
 */
const letter = (from: string) => ({
  from,
  fromName: '',
  to: 'info@yamanwarda.de',
  subject: 'New message — Testkunde',
  text: 'Somebody wrote through the contact form.',
  messageId: null,
  inReplyTo: null,
})

const wrote = () => queries.some(({ sql }) => /INSERT INTO/i.test(sql))

describe('mail the site sent to itself never becomes a person', () => {
  it.each([
    ['the provider bounce address', '010201a0b37-0000@send.yamanwarda.de'],
    ['the site address itself', 'info@yamanwarda.de'],
    ['the reply address', 'reply@yamanwarda.de'],
    ['a shouted spelling of it', 'Info@YamanWarda.de'],
  ])('drops %s without writing anything', async (_label, from) => {
    queries.length = 0

    await expect(recordMail(letter(from))).resolves.toEqual({ recorded: false })
    expect(wrote()).toBe(false)
  })

  it('still records a real client, who is the whole point of the door', async () => {
    queries.length = 0

    await expect(recordMail(letter('katrin@example.com'))).resolves.toEqual({ recorded: true })
    expect(queries.some(({ sql }) => /INSERT INTO leads/i.test(sql))).toBe(true)
    expect(queries.some(({ sql }) => /INSERT INTO lead_messages/i.test(sql))).toBe(true)
  })

  it('does not mistake a lookalike domain for our own', async () => {
    queries.length = 0

    await expect(recordMail(letter('kunde@notyamanwarda.de'))).resolves.toEqual({ recorded: true })
    expect(queries.some(({ sql }) => /INSERT INTO leads/i.test(sql))).toBe(true)
  })
})
