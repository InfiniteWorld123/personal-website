import PostalMime from 'postal-mime'
import { describe, expect, it } from 'vitest'
import { filesFrom } from '../../workers/inbound-email/src/files'

/** Standard base64, as the V2 Inbox decodes the Worker's files. */
const fromBase64 = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64'))

/**
 * A real letter, parsed by the real parser.
 *
 * `inbound-attachments.test.ts` feeds `filesFrom` hand-made parts; this one
 * feeds it what `postal-mime` actually produces from the bytes a mail client
 * sends — the field names, the disposition, whether `content` is a buffer or
 * a view. That is the layer nothing else exercised, and the one a wrong
 * assumption would silently break.
 */
const pdf = new TextEncoder().encode('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>')
const pdfBase64 = Buffer.from(pdf).toString('base64')

const raw = [
  'From: "Katrin Vogel" <katrin@example.com>',
  'To: info@yamanwarda.de',
  'Subject: Vertrag',
  'Message-ID: <abc@example.com>',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="B"',
  '',
  '--B',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Anbei der Vertrag.',
  '--B',
  'Content-Type: application/pdf; name="Vertrag.pdf"',
  'Content-Disposition: attachment; filename="Vertrag.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  pdfBase64,
  '--B',
  'Content-Type: image/png; name="logo.png"',
  'Content-Disposition: inline; filename="logo.png"',
  'Content-ID: <logo@company>',
  'Content-Transfer-Encoding: base64',
  '',
  Buffer.from(new Uint8Array(64)).toString('base64'),
  '--B--',
  '',
].join('\r\n')

describe('a client letter with a contract attached', () => {
  it('reaches the site as the same PDF, without the signature logo', async () => {
    const parsed = await PostalMime.parse(raw)
    const files = filesFrom(parsed.attachments ?? [])

    expect(files.map((file) => file.filename)).toEqual(['Vertrag.pdf'])
    expect(files[0]?.contentType).toBe('application/pdf')
    expect([...fromBase64(files[0]!.content)]).toEqual([...pdf])
    expect(parsed.text?.trim()).toBe('Anbei der Vertrag.')
    expect(parsed.from?.name).toBe('Katrin Vogel')
  })
})
