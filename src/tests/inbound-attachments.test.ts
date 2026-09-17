import { describe, expect, it, vi } from 'vitest'

// The service is imported for one pure function; the module it lives in also
// reaches for the mail configuration at load, which a test has no business
// carrying.
vi.mock('#/shared/env', () => ({
  env: { BASE_URL: 'https://yamanwarda.de', APP_NAME: 'Yaman Warda' },
}))

import { filesFrom, type ParsedAttachment } from '../../workers/inbound-email/src/files'
import { fromBase64 } from '#/backend/modules/inbox/message.service'

/**
 * The two halves of an arriving attachment, checked against each other.
 *
 * The mail Worker and the site are separate deployables: one base64-encodes
 * the bytes into a signed JSON payload, the other decodes them back out, and
 * nothing but this test ever runs the pair over the same file. A mistake here
 * does not throw — it stores a PDF that will not open, weeks later, on a
 * document a client needed.
 */

const attachment = (overrides: Partial<ParsedAttachment> & { content: ArrayBuffer }) =>
  ({ filename: 'Angebot.pdf', mimeType: 'application/pdf', ...overrides }) as ParsedAttachment

const bytes = (values: number[]) => new Uint8Array(values).buffer

describe('an attachment crossing from the mail Worker to the site', () => {
  it('arrives as the same bytes it left as', () => {
    // Every byte value, so a signed/unsigned slip or a lost high bit shows up.
    const original = new Uint8Array(256).map((_, index) => index)

    const [file] = filesFrom([attachment({ content: original.buffer })])

    expect(file).toBeDefined()
    expect([...fromBase64(file!.content)]).toEqual([...original])
  })

  it('survives a file large enough to break the naive encoder', () => {
    /*
     * `String.fromCharCode(...bytes)` spreads one argument per byte, and the
     * stack gives out somewhere above a hundred thousand of them — on exactly
     * the large attachment the feature exists to carry. Both sides chunk.
     */
    const original = new Uint8Array(300_000).map((_, index) => index % 256)

    const [file] = filesFrom([attachment({ content: original.buffer })])
    const decoded = fromBase64(file!.content)

    expect(decoded.byteLength).toBe(original.byteLength)
    expect(decoded[299_999]).toBe(original[299_999])
  })

  it('keeps the name and the type the sender used', () => {
    const [file] = filesFrom([
      attachment({ filename: 'Vertrag 2026.docx', mimeType: 'application/msword', content: bytes([1, 2]) }),
    ])

    expect(file).toEqual({
      filename: 'Vertrag 2026.docx',
      contentType: 'application/msword',
      content: expect.any(String),
    })
  })
})

describe('what the Worker leaves behind', () => {
  /** A logo on every letter they ever send is not a document he wants filed. */
  it('drops a small embedded image', () => {
    expect(
      filesFrom([
        attachment({
          filename: 'logo.png',
          mimeType: 'image/png',
          disposition: 'inline',
          contentId: '<logo@company>',
          content: new ArrayBuffer(4 * 1024),
        }),
      ]),
    ).toEqual([])
  })

  /** A photograph dragged into the body is inline too, and *is* the letter. */
  it('keeps a large inline image', () => {
    expect(
      filesFrom([
        attachment({
          filename: 'baustelle.jpg',
          mimeType: 'image/jpeg',
          disposition: 'inline',
          contentId: '<img@phone>',
          content: new ArrayBuffer(400 * 1024),
        }),
      ]),
    ).toHaveLength(1)
  })

  it('drops an empty part and one over ten megabytes', () => {
    expect(
      filesFrom([
        attachment({ content: new ArrayBuffer(0) }),
        attachment({ content: new ArrayBuffer(11 * 1024 * 1024) }),
      ]),
    ).toEqual([])
  })

  /** The letter matters more than the twentieth file, so it stops rather than fails. */
  it('stops once the letter is too heavy to carry', () => {
    const heavy = () => attachment({ content: new ArrayBuffer(9 * 1024 * 1024) })

    expect(filesFrom([heavy(), heavy(), heavy()])).toHaveLength(2)
  })

  it('gives a nameless part a name, because the table refuses an empty one', () => {
    const [file] = filesFrom([attachment({ filename: '   ', content: bytes([1]) })])

    expect(file?.filename).toBe('attachment')
  })
})
