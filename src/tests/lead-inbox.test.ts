import { describe, expect, it, vi } from 'vitest'

vi.mock('#/shared/env', () => ({
  env: {
    BASE_URL: 'https://yamanwarda.de',
    APP_NAME: 'Yaman Warda',
    RESEND_API_KEY: 're_test',
    EMAIL_FROM: 'hallo@yamanwarda.de',
    CONTACT_TO_EMAIL: 'owner@yamanwarda.de',
    INBOUND_MAIL_ADDRESS: 'reply@yamanwarda.de',
    INBOUND_MAIL_SECRET: 'inbound-secret',
  },
}))

import { createHmac } from 'node:crypto'
import {
  createReplyToken,
  inboundIsConfigured,
  replyAddressFor,
  stripQuotedReply,
  tokenFromAddress,
  tokenFromRecipients,
  verifyInboundSignature,
} from '#/backend/modules/leads/lead.inbound'
import { sendLeadNotificationMail, sendLeadReplyMail } from '#/backend/modules/leads/lead.mail'
import {
  DEFAULT_INBOX_PREFERENCES,
  INBOX_PREFERENCE_KEYS,
  readInboxPreferences,
} from '#/shared/validation/lead.validation'

const sign = (body: string) => createHmac('sha256', 'inbound-secret').update(body).digest('hex')

/** The one request Resend was sent, parsed. */
const captureMail = async (send: () => Promise<unknown>) => {
  const fetch = vi.fn(async () => new Response('{"id":"msg_1"}', { status: 200 }))
  vi.stubGlobal('fetch', fetch)

  await send()

  expect(fetch).toHaveBeenCalledTimes(1)
  const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]

  return JSON.parse(String(init.body)) as Record<string, string | string[]>
}

describe('reply addresses', () => {
  it('writes the token into the plus slot', () => {
    expect(replyAddressFor('abc123')).toBe('reply+abc123@yamanwarda.de')
  })

  it('reads the token back out of the address it was delivered to', () => {
    const token = createReplyToken()
    const address = replyAddressFor(token)

    expect(address).not.toBeNull()
    expect(tokenFromAddress(address as string)).toBe(token)
  })

  it('finds the token among every recipient of the letter', () => {
    expect(
      tokenFromRecipients(['team@partner.de', 'reply+deadbeef1234abcd@yamanwarda.de']),
    ).toBe('deadbeef1234abcd')
  })

  it('ignores a plus tag that is too short to be a token', () => {
    expect(tokenFromAddress('reply+privat@yamanwarda.de')).toBeNull()
  })

  it('has no token for an address that carries none', () => {
    expect(tokenFromAddress('hallo@yamanwarda.de')).toBeNull()
    expect(tokenFromRecipients([])).toBeNull()
  })

  it('knows inbound mail is set up', () => {
    expect(inboundIsConfigured()).toBe(true)
  })
})

describe('inbound signatures', () => {
  const body = JSON.stringify({ to: ['reply+abc@yamanwarda.de'], text: 'Ja, passt.' })

  it('accepts a letter signed with the shared secret', async () => {
    await expect(verifyInboundSignature(body, sign(body))).resolves.toBe(true)
  })

  it('accepts the sha256= prefix a forwarder may add', async () => {
    await expect(verifyInboundSignature(body, `sha256=${sign(body)}`)).resolves.toBe(true)
  })

  it('refuses a letter whose bytes changed after signing', async () => {
    await expect(verifyInboundSignature(`${body} `, sign(body))).resolves.toBe(false)
  })

  it('refuses a letter with no signature at all', async () => {
    await expect(verifyInboundSignature(body, null)).resolves.toBe(false)
  })
})

describe('quoted replies', () => {
  it('keeps only what the person typed above the quote', () => {
    const answer = stripQuotedReply(
      'Dienstag 10:00 passt.\n\nOn Fri, 12 Sep 2026 at 19:20, Yaman wrote:\n> Passt Dienstag?',
    )

    expect(answer).toBe('Dienstag 10:00 passt.')
  })

  it('cuts at a plain quote marker as well', () => {
    expect(stripQuotedReply('Ja gerne.\n> und die alte Frage')).toBe('Ja gerne.')
  })

  it('keeps a reply that is nothing but a quote rather than storing nothing', () => {
    expect(stripQuotedReply('> nur zitiert')).toBe('> nur zitiert')
  })
})

describe('inbox preferences', () => {
  it('defaults every switch on, as the owner asked', () => {
    expect(Object.values(DEFAULT_INBOX_PREFERENCES).every(Boolean)).toBe(true)
  })

  it('fills in a switch the stored row predates', () => {
    const stored = readInboxPreferences({ notes: false })

    expect(stored.notes).toBe(false)
    expect(Object.keys(stored)).toEqual([...INBOX_PREFERENCE_KEYS])
  })

  it('ignores a key the interface does not know', () => {
    expect(readInboxPreferences({ nonsense: true })).toEqual(DEFAULT_INBOX_PREFERENCES)
  })

  it('survives a row that is not an object at all', () => {
    expect(readInboxPreferences(null)).toEqual(DEFAULT_INBOX_PREFERENCES)
    expect(readInboxPreferences('broken')).toEqual(DEFAULT_INBOX_PREFERENCES)
  })
})

describe('the notification mail', () => {
  it('carries the facts, a link into the inbox, and the attachment', async () => {
    const mail = await captureMail(() =>
      sendLeadNotificationMail({
        id: '2f1c3b4e-0000-4000-8000-000000000000',
        source: 'CONTACT_FORM',
        name: 'Lena Brandt',
        email: 'l.brandt@brandt-soehne.de',
        company: 'Brandt & Söhne',
        phone: '+49 151 2233 4455',
        projectType: 'Website + Buchung',
        budget: '5–10k €',
        timeline: 'In 4 Wochen',
        message: 'Wir nehmen Termine noch telefonisch an.',
        language: 'de',
        attachment: { filename: 'brief.pdf', content: 'JVBERi0=' },
      }),
    )

    expect(mail.to).toEqual(['owner@yamanwarda.de'])
    expect(mail.reply_to).toBe('l.brandt@brandt-soehne.de')
    expect(mail.subject).toBe('Neue Anfrage: Lena Brandt (Brandt & Söhne)')
    expect(mail.html).toContain('/admin/inbox?lead=2f1c3b4e-0000-4000-8000-000000000000')
    expect(mail.html).toContain('Brandt &amp; Söhne')
    expect(mail.text).toContain('Wir nehmen Termine noch telefonisch an.')
    expect(mail.attachments).toEqual([{ filename: 'brief.pdf', content: 'JVBERi0=' }])
  })
})

describe('the reply mail', () => {
  it('answers in the visitor\'s language and threads their answer back', async () => {
    const mail = await captureMail(() =>
      sendLeadReplyMail({
        to: 'ahmad@alhasan-catering.ae',
        toName: 'أحمد الحسن',
        subject: 'بخصوص نظام الطلبات',
        body: 'أهلاً، نعم نعمل بالعربية.',
        doc: null,
        language: 'ar',
        replyToken: 'abc123',
        signature: 'تحياتي،\nيمان وردة',
      }),
    )

    expect(mail.to).toEqual(['ahmad@alhasan-catering.ae'])
    expect(mail.reply_to).toBe('reply+abc123@yamanwarda.de')
    expect(mail.html).toContain('dir="rtl"')
    expect(mail.html).toContain('أهلاً، نعم نعمل بالعربية.')
    expect(mail.html).toContain('يمان وردة')
    expect(mail.text).toContain('مرحباً أحمد الحسن,')
  })

  it('sends the formatted letter as HTML and the same words as text', async () => {
    const mail = await captureMail(() =>
      sendLeadReplyMail({
        to: 'l.brandt@brandt-soehne.de',
        toName: 'Lena Brandt',
        subject: 'Ihr Projekt',
        body: 'Guten Tag,\n\nzwei Punkte:\nTermin\nBudget',
        doc: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [
              { type: 'text', text: 'Guten Tag, ' },
              { type: 'text', text: 'zwei Punkte', marks: [{ type: 'bold' }] },
              { type: 'text', text: ':' },
            ] },
            { type: 'bulletList', content: [
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Termin' }] }] },
              { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Budget' }] }] },
            ] },
          ],
        },
        language: 'de',
        replyToken: null,
        signature: null,
      }),
    )

    expect(mail.html).toContain('<strong>zwei Punkte</strong>')
    expect(mail.html).toContain('<ul')
    expect(mail.html).toContain('<li')
    // The plain part is the same letter without the markup.
    expect(mail.text).toContain('Termin')
    expect(String(mail.text)).not.toContain('<strong>')
  })

  it('never lets a link the schema refuses reach the letter', async () => {
    const mail = await captureMail(() =>
      sendLeadReplyMail({
        to: 'x@example.com', toName: 'X', subject: 'S', body: 'klick',
        doc: { type:'doc', content:[{ type:'paragraph', content:[
          { type:'text', text:'klick', marks:[{ type:'link', attrs:{ href:'javascript:alert(1)' } }] }] }] },
        language: 'de', replyToken: null, signature: null,
      }),
    )

    expect(String(mail.html)).not.toContain('javascript:')
    expect(mail.html).toContain('klick')
  })

  it('leaves the signature off when that switch is off', async () => {
    const mail = await captureMail(() =>
      sendLeadReplyMail({
        to: 'tf@feldmann-elektro.de',
        toName: 'Tom Feldmann',
        subject: '',
        body: 'Dienstag 10:00 passt.',
        doc: null,
        language: 'de',
        replyToken: null,
        signature: null,
      }),
    )

    expect(mail.subject).toBe('Deine Anfrage')
    expect(mail.reply_to).toBeUndefined()
    expect(mail.html).not.toContain('Beste Grüße')
  })
})
