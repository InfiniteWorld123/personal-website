import fontkit from '@pdf-lib/fontkit'
import { PDFDocument } from 'pdf-lib'
import { beforeAll, describe, expect, it } from 'vitest'
import { SPACE_GROTESK_BOLD } from '#/backend/modules/invoices/font-data'
import { draftWord, paperRules, stampBox } from '#/backend/modules/invoices/pdf.service'

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

/** Details that are real, which is what every case below assumes unless it says otherwise. */
const real = { isTest: false }

describe('what a draft prints', () => {
  it('stamps itself, in the language the paper speaks', () => {
    expect(paperRules(draft, real).stamp).toBe('ENTWURF')
    expect(paperRules({ ...draft, language: 'en' }, real).stamp).toBe('DRAFT')
  })

  it('says the word where the number would be, not a dash', () => {
    // A dash reads as "missing". The word reads as "this is not one yet".
    expect(paperRules(draft, real).number).toBe('ENTWURF')
  })

  it('promises no due date, because nothing has been issued to be due', () => {
    expect(paperRules(draft, real).showDue).toBe(false)
  })

  it('never carries a payment code', () => {
    // The whole reason this file exists. A banking app will happily pay a QR
    // whose reference names an invoice that was never numbered, and no row in
    // `payments` could ever be matched against that transfer.
    expect(paperRules(draft, real).showQr).toBe(false)
  })

  it('says under the title that it is not one', () => {
    expect(paperRules(draft, real).notice).toContain('nicht zur Zahlung')
    expect(paperRules({ ...draft, language: 'en' }, real).notice).toContain('not payable')
  })

  it('leaves the payment instruction empty rather than repeating itself', () => {
    // That slot exists to tell a client what to do. A draft has nothing to
    // tell them, and printing the notice twice on one sheet read as noise.
    expect(paperRules(draft, real).payText).toBe('')
  })

  it('names itself the same way on the page and on disk', () => {
    // One source of truth: the stamp and the filename cannot drift apart.
    expect(paperRules(draft, real).stamp).toBe(draftWord('de'))
    expect(paperRules({ ...draft, language: 'en' }, real).stamp).toBe(draftWord('en'))
  })
})

describe('what an issued invoice prints', () => {
  it('carries its number, its due date and its payment code', () => {
    const paper = paperRules(issued, real)

    expect(paper.stamp).toBeNull()
    expect(paper.notice).toBeNull()
    expect(paper.number).toBe('2026-004')
    expect(paper.showDue).toBe(true)
    expect(paper.showQr).toBe(true)
    expect(paper.payText).toContain('04.10.2026')
    expect(paper.payText).toContain('2026-004')
  })

  it('drops the payment code when there is nothing to pay', () => {
    expect(paperRules({ ...issued, totalCents: 0 }, real).showQr).toBe(false)
  })

  it('asks for no money on a correction, and stamps nothing on it either', () => {
    // A cancellation is issued, numbered and frozen like any other document.
    // It owes nobody anything, so it carries neither a due date nor a code —
    // but it is a fact, and a fact is never stamped as a draft.
    const cancellation = paperRules({ ...issued, kind: 'CANCELLATION' as const }, real)

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

/**
 * A document drawn from invented seller details.
 *
 * Everything about it is real — it has a number, it is in the books, it counts
 * towards what he is owed. What is not real is the account printed at the foot
 * of it. That only happens on his own machine, and it is still stamped,
 * because a PDF can outlive the machine that drew it.
 */

const test = { isTest: true }

describe('a document drawn from invented details', () => {
  it('is stamped, and says which parts are invented', () => {
    const paper = paperRules(issued, test)

    expect(paper.stamp).toBe('TEST')
    expect(paper.notice).toContain('erfunden')
  })

  it('still carries its number, its due date and its payment code', () => {
    // It is a real document with a fake bank account, not a draft. Hiding the
    // due date would make it useless for seeing what an issued invoice looks
    // like, which is the only reason the invented details exist.
    const paper = paperRules(issued, test)

    expect(paper.number).toBe('2026-004')
    expect(paper.showDue).toBe(true)
    expect(paper.showQr).toBe(true)
  })

  it('says DRAFT rather than TEST while it is still a draft', () => {
    // Both are true and there is one stamp. A draft is the more important of
    // the two, because it is the one that says the figures can still change.
    expect(paperRules(draft, test).stamp).toBe('ENTWURF')
  })

  it('keeps TEST inside the page too', () => {
    const box = stampBox(bold, 'TEST')

    expect(box.minX).toBeGreaterThanOrEqual(0)
    expect(box.maxX).toBeLessThanOrEqual(A4_WIDTH)
  })
})
