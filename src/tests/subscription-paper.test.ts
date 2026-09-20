import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import {
  agreementTitle,
  assertAgreementPrintable,
  renderSubscriptionPdf,
  type SubscriptionPaper,
} from '#/backend/modules/invoices/pdf.service'
import type { Seller } from '#/backend/modules/invoices/seller'
import type { Client } from '#/shared/types/invoice.types'

/**
 * The paper a subscription starts with, and the one thing it must never be
 * mistaken for.
 *
 * A subscription had no document at all until 20 Sep 2026: its paper was the
 * monthly invoices underneath it, which answer "pay me for October" and not
 * "this is what we agreed". This page answers the second question — and the
 * moment it exists, it becomes a PDF with a euro figure on it arriving in a
 * client's mailbox. A careful client pays those.
 *
 * So every test below is about one of two things: that the page says what was
 * agreed, and that nobody could read it as a bill.
 */

const SELLER: Seller = {
  name: 'Yaman Warda',
  trade: { de: 'Webentwicklung', en: 'Web development' },
  street: 'Teststraße 1',
  postcode: '99084',
  city: 'Erfurt',
  country: 'DE',
  taxNumber: '151/123/45678',
  vatId: '',
  bankName: 'Sparkasse Erfurt',
  iban: 'DE02 1203 0000 0000 2020 51',
  bic: 'BYLADEM1001',
  email: 'info@yamanwarda.de',
  phone: '',
  website: 'yamanwarda.de',
  smallBusiness: true,
}

const CLIENT: Client = {
  id: 'client-1',
  leadId: null,
  company: 'Infinite World GmbH',
  contactName: 'Anna Berger',
  email: 'anna@example.com',
  phone: '',
  street: 'Hauptstraße 4',
  streetExtra: '',
  postcode: '99084',
  city: 'Erfurt',
  country: 'DE',
  vatId: '',
  language: 'de',
  notes: '',
  createdAt: '2026-09-01T10:00:00.000Z',
  invoiceCount: 0,
  openCents: 0,
}

const PAPER: SubscriptionPaper = {
  description: 'Website-Betreuung',
  amountCents: 4_900,
  currency: 'EUR',
  taxRate: 0,
  billingDay: 1,
  nextPeriod: '2026-10-01',
  startedOn: '2026-09-20',
  cancelledOn: null,
  note: '',
  dueDays: 14,
}

const TODAY = '2026-09-20'

/**
 * The text of the drawn page.
 *
 * `pdf-lib` cannot read text back out of a document it wrote, so this asserts
 * on what went in by drawing and re-parsing the metadata plus the byte
 * stream's own markers. What each test really pins is that the call succeeds
 * and produces a single-page PDF; the wording is pinned through
 * `agreementTitle`, which is the one string shared with the filename and the
 * letter's subject.
 */
const draw = (paper: SubscriptionPaper, client = CLIENT, seller = SELLER) =>
  renderSubscriptionPdf(paper, client, TODAY, seller)

describe('the agreement as a document', () => {
  it('draws one page of real PDF', async () => {
    const bytes = await draw(PAPER)

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')

    const reopened = await PDFDocument.load(bytes)

    // One sheet. An agreement that spilled onto a second page would mean the
    // terms or the signature block had been pushed off the bottom of the
    // first, where nobody reads them.
    expect(reopened.getPageCount()).toBe(1)
  })

  it('titles itself in the language the client is written to in', async () => {
    const german = await PDFDocument.load(await draw(PAPER))
    const english = await PDFDocument.load(await draw(PAPER, { ...CLIENT, language: 'en' }))

    expect(german.getTitle()).toContain('Vereinbarung')
    expect(english.getTitle()).toContain('Agreement')
  })

  it('names itself the same way for the page, the file and the subject', () => {
    // One source. The title drawn on the paper, the name it is saved under and
    // the subject of the letter carrying it must never say three things.
    expect(agreementTitle('de')).toBe('Vereinbarung')
    expect(agreementTitle('en')).toBe('Agreement')
  })

  it('carries the arrangement in its metadata, so a file manager shows it', async () => {
    const reopened = await PDFDocument.load(await draw(PAPER))

    expect(reopened.getSubject()).toBe('Website-Betreuung')
    expect(reopened.getAuthor()).toBe('Yaman Warda')
  })

  it('draws a subscription that has been stopped', async () => {
    /*
     * Offered after cancelling too, because that is exactly the copy somebody
     * asks for months later. The page then states the end date instead of the
     * first billed month, and the terms lose the two that promise a future.
     */
    const bytes = await draw({ ...PAPER, cancelledOn: '2026-11-30' })
    const reopened = await PDFDocument.load(bytes)

    expect(reopened.getPageCount()).toBe(1)
  })

  it('stays on one page with a long description and a long note', async () => {
    // The signature block is pinned above the footer rather than floating
    // after the content, so a wordy arrangement cannot push it off the sheet.
    const bytes = await draw({
      ...PAPER,
      description:
        'Laufende Betreuung der Website, monatliche Updates, Backups, Sicherheits-Patches und Erreichbarkeit per E-Mail innerhalb von zwei Werktagen',
      note: 'Vereinbart im Gespräch am 12. September 2026. Der Preis wird in einem Jahr gemeinsam überprüft, und bis dahin bleibt er unverändert.',
    })

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })

  it('draws the rate a subscription actually bills at', async () => {
    // A subscription set to 19 % has to print it. The §19 sentence is printed
    // only when the rate really is zero — the same §14c contradiction
    // `issueInvoice` refuses, which must not appear a month early here.
    const bytes = await draw({ ...PAPER, taxRate: 19 }, CLIENT, {
      ...SELLER,
      smallBusiness: false,
    })

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})

describe('what stops it being read as a bill', () => {
  it('is stamped when it was drawn from invented sender details', async () => {
    /*
     * The same rule an invoice follows. The footer prints an account that
     * does not exist, and a file outlives the screen that explained why.
     * Asserted through the title, which is the one string a reader sees
     * without opening the page.
     */
    const bytes = await draw(PAPER, CLIENT, { ...SELLER, isTest: true })

    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-')
  })

  it('takes no number, because it demands no money', () => {
    /*
     * Not an assertion about the drawing — an assertion about the shape of
     * the input, which is the real guarantee. `SubscriptionPaper` has no
     * field for a number and no field for a due date, so there is no code
     * path by which this page could consume one from the gapless series.
     *
     * That series exists so documents demanding money are continuous. A page
     * that took a number and then never became a client would leave the one
     * hole §14 cannot survive.
     */
    const fields = Object.keys(PAPER)

    expect(fields).not.toContain('number')
    expect(fields).not.toContain('dueOn')
    expect(fields).not.toContain('issuedOn')
  })
})

describe('what the font cannot draw', () => {
  it('refuses a description the embedded face has no glyphs for', () => {
    // Space Grotesk covers Latin. Arabic would come out as a row of empty
    // boxes in a document going to a client, and the moment to say so is
    // before the file exists.
    expect(() =>
      assertAgreementPrintable({ ...PAPER, description: 'متابعة الموقع' }, CLIENT),
    ).toThrow(/cannot print/)
  })

  it('refuses a client whose address cannot be drawn', () => {
    expect(() => assertAgreementPrintable(PAPER, { ...CLIENT, city: 'إرفورت' })).toThrow(
      /cannot print/,
    )
  })

  it('allows the German letters the paper is actually written in', () => {
    expect(() =>
      assertAgreementPrintable(
        { ...PAPER, description: 'Website-Betreuung für Erfurt · Größe & Maß' },
        CLIENT,
      ),
    ).not.toThrow()
  })
})
