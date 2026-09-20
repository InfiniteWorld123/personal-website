import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { SPACE_GROTESK_BOLD } from '#/backend/modules/invoices/font-data'
import { draftRules, draftWord, stampBox } from '#/backend/modules/invoices/pdf.service'

/**
 * What stops a draft being mistaken for an invoice.
 *
 * A draft has always been downloadable, and it should be — he reads the paper
 * before he commits to a number he can never take back. What it must never do
 * is come out looking like a document that was issued.
 *
 * Until 20 Sep 2026 it did. The header was the same, the totals were the same,
 * the footer was the same, and a scannable payment code sat in the corner
 * addressed to a document that does not exist in the books. The only tell was
 * a dash where the number belonged — which nobody reads, least of all a client
 * opening an attachment.
 *
 * These are the four doors that closes, asserted here rather than left inside
 * eight hundred lines of PDF coordinates, because the failure mode of a silent
 * regression is a client transferring money against nothing.
 */

const draft = {
  status: 'DRAFT',
  kind: 'INVOICE' as const,
  number: null,
  language: 'de' as const,
  dueOn: null,
  totalCents: 149_000,
}

const issued = { ...draft, status: 'ISSUED', number: '2026-004', dueOn: '2026-10-04' }

describe('what a draft prints', () => {
  it('stamps itself, in the language the paper speaks', () => {
    expect(draftRules(draft).stamp).toBe('ENTWURF')
    expect(draftRules({ ...draft, language: 'en' }).stamp).toBe('DRAFT')
  })

  it('says the word where the number would be, not a dash', () => {
    // A dash reads as "missing". The word reads as "this is not one yet".
    expect(draftRules(draft).number).toBe('ENTWURF')
  })

  it('promises no due date, because nothing has been issued to be due', () => {
    expect(draftRules(draft).showDue).toBe(false)
  })

  it('never carries a payment code', () => {
    // The whole reason this file exists. A banking app will happily pay a QR
    // whose reference names an invoice that was never numbered, and no row in
    // `payments` could ever be matched against that transfer.
    expect(draftRules(draft).showQr).toBe(false)
  })

  it('says under the title that it is not one', () => {
    expect(draftRules(draft).notice).toContain('nicht zur Zahlung')
    expect(draftRules({ ...draft, language: 'en' }).notice).toContain('not payable')
  })

  it('leaves the payment instruction empty rather than repeating itself', () => {
    // That slot exists to tell a client what to do. A draft has nothing to
    // tell them, and printing the notice twice on one sheet read as noise.
    expect(draftRules(draft).payText).toBe('')
  })

  it('names itself the same way on the page and on disk', () => {
    // One source of truth: the stamp and the filename cannot drift apart.
    expect(draftRules(draft).stamp).toBe(draftWord('de'))
    expect(draftRules({ ...draft, language: 'en' }).stamp).toBe(draftWord('en'))
  })
})

describe('what an issued invoice prints', () => {
  it('carries its number, its due date and its payment code', () => {
    const paper = draftRules(issued)

    expect(paper.stamp).toBeNull()
    expect(paper.notice).toBeNull()
    expect(paper.number).toBe('2026-004')
    expect(paper.showDue).toBe(true)
    expect(paper.showQr).toBe(true)
    expect(paper.payText).toContain('04.10.2026')
    expect(paper.payText).toContain('2026-004')
  })

  it('drops the payment code when there is nothing to pay', () => {
    expect(draftRules({ ...issued, totalCents: 0 }).showQr).toBe(false)
  })

  it('asks for no money on a correction, and stamps nothing on it either', () => {
    // A cancellation is issued, numbered and frozen like any other document.
    // It owes nobody anything, so it carries neither a due date nor a code —
    // but it is a fact, and a fact is never stamped as a draft.
    const cancellation = draftRules({ ...issued, kind: 'CANCELLATION' as const })

    expect(cancellation.stamp).toBeNull()
    expect(cancellation.showDue).toBe(false)
    expect(cancellation.showQr).toBe(false)
    expect(cancellation.payText).toContain('erstattet')
  })
})

/**
 * The stamp has to be on the sheet.
 *
 * Not a cosmetic concern: a watermark whose first and last letters are sliced
 * off by the page edge reads as a printing artefact, and a printing artefact
 * is something a reader dismisses. Two earlier attempts at this sized the word
 * as a fraction of the page diagonal and did exactly that, and both looked
 * fine in a thumbnail — which is why the geometry is asserted here instead of
 * being looked at.
 */

const A4_WIDTH = (210 * 72) / 25.4
const A4_HEIGHT = (297 * 72) / 25.4

let bold: Awaited<ReturnType<PDFDocument['embedFont']>>

beforeAll(async () => {
  const document = await PDFDocument.create()

  document.registerFontkit(fontkit)

  const binary = atob(SPACE_GROTESK_BOLD)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)

  bold = await document.embedFont(bytes, { subset: false })
})

describe('where the stamp lands', () => {
  // Both words it will ever draw, because the German one is two letters longer
  // and a fit that only works for DRAFT is not a fit.
  for (const word of ['ENTWURF', 'DRAFT']) {
    it(`keeps ${word} inside the page`, () => {
      const box = stampBox(bold, word)

      expect(box.minX).toBeGreaterThanOrEqual(0)
      expect(box.maxX).toBeLessThanOrEqual(A4_WIDTH)
      expect(box.minY).toBeGreaterThanOrEqual(0)
      expect(box.maxY).toBeLessThanOrEqual(A4_HEIGHT)
    })

    it(`centres ${word} on the page`, () => {
      const box = stampBox(bold, word)

      // Half a point of slack, which is the arithmetic, not a tolerance for
      // being off-centre: a mark visibly higher on one side reads as a mistake.
      expect((box.minX + box.maxX) / 2).toBeCloseTo(A4_WIDTH / 2, 1)
      expect((box.minY + box.maxY) / 2).toBeCloseTo(A4_HEIGHT / 2, 1)
    })

    it(`draws ${word} large enough to be unmissable`, () => {
      // Across more than half the sheet. The whole point is that nobody has to
      // look for it.
      expect(stampBox(bold, word).maxX - stampBox(bold, word).minX).toBeGreaterThan(A4_WIDTH * 0.6)
    })
  }
})
