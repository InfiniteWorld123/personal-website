import fontkit from '@pdf-lib/fontkit'
import { degrees, LineCapStyle, PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib'
import qrcode from 'qrcode-generator'
import { badRequestError } from '#/backend/shared/error'
import type { Client, Invoice } from '#/shared/types/invoice.types'
import {
  DOCUMENT_TITLE,
  type InvoiceKind,
  type InvoiceLanguage,
} from '#/shared/validation/invoice.validation'
import { SPACE_GROTESK_BOLD, SPACE_GROTESK_REGULAR } from './font-data'
import {
  compactIban,
  resolveSeller,
  SELLER,
  SMALL_BUSINESS_NOTE,
  type Seller,
} from './seller'

/**
 * The paper.
 *
 * Drawn by coordinates with `pdf-lib`, not printed from HTML by a headless
 * browser. The site runs on Cloudflare Workers, where the browser route means
 * the paid Browser Rendering API and seconds of latency per document; this
 * route is free, instant, and produces a real vector PDF whose text can be
 * selected, searched and copied. The price is that every position below is a
 * number, which is why the design he approved in the lab is geometric: rules,
 * rectangles, one mark and one payment code.
 *
 * Every switch he set on 18 Sep 2026 is honoured here and named where it acts.
 * What he turned **off** is simply absent — there is no dormant `if` waiting
 * for a zebra-striped table nobody asked for.
 */

/* -------------------------------------------------------------------------- */
/* The sheet                                                                  */
/* -------------------------------------------------------------------------- */

const MM = 72 / 25.4

/** A4, in points, which is the only unit a PDF has. */
const PAGE_W = 210 * MM
const PAGE_H = 297 * MM

/**
 * `DIN 5008` margins, so the address lands where a window envelope expects it
 * and nothing he prints ever has to be folded twice to fit.
 */
const LEFT = 25 * MM
const RIGHT = 20 * MM
const TOP = 18 * MM
const BOTTOM = 15 * MM
const CONTENT = PAGE_W - LEFT - RIGHT

/** Switch 6, «مسافات واسعة» — the one multiplier that makes the page breathe. */
const AIRY = 1.35

const INK = rgb(0.071, 0.09, 0.165)
const BLUE = rgb(0.208, 0.361, 1)
const GREY = rgb(0.42, 0.459, 0.565)
const FAINT = rgb(0.486, 0.525, 0.627)
const HAIR = rgb(0.902, 0.914, 0.949)

/**
 * How far the draft stamp keeps off the page edge.
 *
 * Wider than the print margins on purpose: a watermark that touches the paper
 * edge reads as a printing fault rather than as a mark somebody put there.
 */
const STAMP_MARGIN = 26

/** Column edges of the line table, measured from the left margin. */
const COL_POS = 0
const COL_DESC = 18
const COL_QTY_R = CONTENT - 190
const COL_UNIT_R = CONTENT - 95
const COL_AMOUNT_R = CONTENT

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

type Words = {
  number: string
  date: string
  period: string
  dueBy: string
  pos: string
  desc: string
  qty: string
  unit: string
  amount: string
  net: string
  vat: string
  total: string
  intro: string
  introCancel: string
  introCredit: string
  pay: string
  payCredit: string
  reference: string
  address: string
  bank: string
  contact: string
  taxNumber: string
  vatIdLabel: string
  page: string
  corrects: string
  scan: string
  /** What a draft calls itself, where an issued invoice carries its number. */
  draft: string
  /** The sentence that replaces the payment instruction on a draft. */
  draftNotice: string
  /** What a page drawn from invented details calls itself. */
  test: string
  /** And the sentence that says which part of it is invented. */
  testNotice: string
  /** Above the card link, for the client who would rather not transfer. */
  payCard: string
}

/**
 * What a draft calls itself, for the callers outside this file that need the
 * same word — the filename, so far. One source, so the stamp on the page and
 * the name on disk can never say different things.
 */
export const draftWord = (language: InvoiceLanguage): string => WORDS[language].draft

/**
 * Everything the paper does differently because it is not a real invoice.
 *
 * Pulled out of the drawing below and into one value for a reason worth
 * naming: these decisions are a safety rule, not a style. A draft could always
 * be downloaded, and until now it came out looking exactly like a real
 * invoice — same header, same totals, same scannable payment code — with only
 * a dash where the number belonged. One careless attachment and a client
 * believes he has been billed, or worse, scans the code and transfers money
 * against a document that does not exist in the books.
 *
 * Two reasons a page is not one, and they are different:
 *
 *   * **A draft.** No number, nothing owed, nothing to pay yet.
 *   * **Invented seller details.** Everything about the document is real —
 *     it has a number and it is in the books — but the account printed at the
 *     foot of it does not exist. That one only happens on his own machine,
 *     and it still gets a stamp, because a file can outlive the machine that
 *     made it.
 *
 * Each field below closes one door, and each is asserted in
 * `invoice-draft-paper.test.ts`. Buried inside eight hundred lines of
 * coordinates, a future edit could quietly switch one back on and nothing
 * would notice until a client had paid. Here, the test fails.
 */
export type PaperRules = {
  /** The word drawn corner to corner, or null on a document that is real. */
  stamp: string | null
  /** What the meta block prints beside «Nummer». */
  number: string
  /** A draft promises no date: it has not been issued, so nothing is due. */
  showDue: boolean
  /** A payment code on an unnumbered document is an untraceable transfer. */
  showQr: boolean
  /** The sentence under the title, on a document that is not one yet. */
  notice: string | null
  /**
   * The sentence where an invoice says how and when to pay.
   *
   * Empty on a draft, and deliberately not the notice again: that slot exists
   * to tell a client what to do, and the honest thing for a draft to say
   * there is nothing at all.
   */
  payText: string
}

export const paperRules = (
  invoice: {
    status: string
    kind: InvoiceKind
    number: string | null
    language: InvoiceLanguage
    dueOn: string | null
    totalCents: number
  },
  seller: { isTest?: boolean } = SELLER,
): PaperRules => {
  const words = WORDS[invoice.language]
  const isDraft = invoice.status === 'DRAFT'
  const isCredit = invoice.kind !== 'INVOICE'

  return {
    // Draft first. A draft drawn from invented details is still, first and
    // foremost, a draft — and saying both would need two stamps on one page.
    stamp: isDraft ? words.draft : seller.isTest ? words.test : null,
    number: invoice.number ?? words.draft,
    showDue: !isCredit && !isDraft,
    showQr: !isCredit && !isDraft && invoice.totalCents > 0,
    notice: isDraft ? words.draftNotice : seller.isTest ? words.testNotice : null,
    payText: isDraft
      ? ''
      : isCredit
        ? words.payCredit
        : `${words.pay.replace('{due}', date(invoice.dueOn, invoice.language))} ${
            invoice.number ? words.reference.replace('{number}', invoice.number) : ''
          }`.trim(),
  }
}

const WORDS: Record<InvoiceLanguage, Words> = {
  de: {
    number: 'Nummer',
    date: 'Datum',
    period: 'Leistungszeitraum',
    dueBy: 'Fällig bis',
    pos: 'Pos',
    desc: 'Beschreibung',
    qty: 'Menge',
    unit: 'Einzelpreis',
    amount: 'Betrag',
    net: 'Zwischensumme',
    vat: 'Umsatzsteuer',
    total: 'Gesamtbetrag',
    intro: 'Vielen Dank für Ihren Auftrag. Ich stelle Ihnen folgende Leistungen in Rechnung:',
    introCancel: 'Hiermit storniere ich die unten genannte Rechnung vollständig.',
    introCredit: 'Hiermit schreibe ich Ihnen die folgenden Positionen gut:',
    pay: 'Zahlbar ohne Abzug bis {due} auf das unten genannte Konto.',
    payCredit: 'Der Betrag wird Ihnen auf das uns bekannte Konto erstattet.',
    reference: 'Bitte geben Sie {number} als Verwendungszweck an.',
    address: 'Anschrift',
    bank: 'Bankverbindung',
    contact: 'Kontakt',
    taxNumber: 'St.-Nr.',
    vatIdLabel: 'USt-IdNr.',
    page: 'Seite {n} von {total}',
    corrects: 'Bezieht sich auf Rechnung {number}',
    scan: 'Mit der Banking-App scannen',
    draft: 'ENTWURF',
    draftNotice: 'Entwurf — keine Rechnung, nicht zur Zahlung. Der Inhalt kann sich noch ändern.',
    test: 'TEST',
    testNotice: 'Testdokument — die Anschrift, Steuernummer und Bankverbindung unten sind erfunden.',
    payCard: 'Oder mit Karte bezahlen:',
  },
  en: {
    number: 'Number',
    date: 'Date',
    period: 'Service period',
    dueBy: 'Due by',
    pos: 'No',
    desc: 'Description',
    qty: 'Qty',
    unit: 'Unit price',
    amount: 'Amount',
    net: 'Subtotal',
    vat: 'VAT',
    total: 'Total',
    intro: 'Thank you for your order. Please find the services below.',
    introCancel: 'This cancels the invoice named below in full.',
    introCredit: 'This credits you the following items.',
    pay: 'Payable in full by {due} to the account below.',
    payCredit: 'The amount will be refunded to the account we have on file.',
    reference: 'Please quote {number} as the payment reference.',
    address: 'Address',
    bank: 'Bank',
    contact: 'Contact',
    taxNumber: 'Tax no.',
    vatIdLabel: 'VAT ID',
    page: 'Page {n} of {total}',
    corrects: 'Relates to invoice {number}',
    scan: 'Scan with your banking app',
    draft: 'DRAFT',
    draftNotice: 'Draft — not an invoice, not payable. The content can still change.',
    test: 'TEST',
    testNotice: 'Test document — the address, tax number and bank details below are invented.',
    payCard: 'Or pay by card:',
  },
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Money, the way the paper's language writes it.
 *
 * Hand-rolled rather than `Intl.NumberFormat`: the Worker's ICU data is not
 * something this code controls, and a currency symbol that silently becomes
 * "EUR 1,480.00" on one runtime and "1.480,00 €" on another would mean two
 * clients holding two different-looking invoices from the same system.
 */
export const money = (cents: number, language: InvoiceLanguage, currency = 'EUR'): string => {
  const negative = cents < 0
  const [whole, fraction] = (Math.abs(cents) / 100).toFixed(2).split('.')
  const symbol = currency === 'EUR' ? '€' : currency

  if (language === 'en') {
    const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ',')

    return `${negative ? '-' : ''}${symbol}${grouped}.${fraction}`
  }

  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')

  return `${negative ? '-' : ''}${grouped},${fraction} ${symbol}`
}

/** `2026-09-18` as a person in that language reads it. */
const date = (iso: string | null, language: InvoiceLanguage): string => {
  if (!iso) return '—'

  const [year, month, day] = iso.split('-')

  if (language === 'en') {
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    return `${day} ${names[Number(month) - 1]} ${year}`
  }

  return `${day}.${month}.${year}`
}

/** Quantities print as `1` and `0,5`, never as `1.00`. */
const quantity = (value: number, language: InvoiceLanguage): string => {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '')

  return language === 'de' ? text.replace('.', ',') : text
}

/**
 * The characters the embedded face can actually draw.
 *
 * Space Grotesk covers Latin and Latin Extended. A name in Arabic or Cyrillic
 * would be embedded as `.notdef` — blank boxes on a document a client keeps,
 * with nothing anywhere saying it went wrong. This project has spent two
 * audits removing exactly that kind of silent fault, so instead of printing
 * blanks the caller refuses and says which name it cannot set.
 */
const UNPRINTABLE = /[^ -ɏ -⁯₠-₿]/

export const findUnprintable = (text: string): string | null => {
  const match = UNPRINTABLE.exec(text)

  return match ? match[0] : null
}

/* -------------------------------------------------------------------------- */
/* Drawing helpers                                                            */
/* -------------------------------------------------------------------------- */

type Ink = {
  page: PDFPage
  regular: PDFFont
  bold: PDFFont
}

type TextOptions = {
  size?: number
  bold?: boolean
  color?: RGB
  /** Letter-spacing, used only by the small uppercase labels. */
  tracking?: number
}

const fontOf = (ink: Ink, options: TextOptions): PDFFont =>
  options.bold ? ink.bold : ink.regular

const widthOf = (ink: Ink, text: string, options: TextOptions): number => {
  const size = options.size ?? 9
  const base = fontOf(ink, options).widthOfTextAtSize(text, size)

  return options.tracking ? base + options.tracking * Math.max(0, text.length - 1) : base
}

const write = (ink: Ink, text: string, x: number, y: number, options: TextOptions = {}): void => {
  const size = options.size ?? 9
  const font = fontOf(ink, options)
  const color = options.color ?? INK

  if (!options.tracking) {
    ink.page.drawText(text, { x, y, size, font, color })

    return
  }

  // pdf-lib has no letter-spacing, and the uppercase labels need it or they
  // read as a solid block at 6.5pt. One glyph at a time is cheap for the four
  // short strings that use it, and wrong for anything longer — which is why
  // nothing longer does.
  let cursor = x

  for (const glyph of text) {
    ink.page.drawText(glyph, { x: cursor, y, size, font, color })
    cursor += font.widthOfTextAtSize(glyph, size) + options.tracking
  }
}

const writeRight = (
  ink: Ink,
  text: string,
  right: number,
  y: number,
  options: TextOptions = {},
): void => write(ink, text, right - widthOf(ink, text, options), y, options)

/**
 * Greedy wrap, with a hard break for a word that is wider than the column.
 *
 * The hard break matters: a client's domain name or a German compound noun can
 * easily be wider than the description column, and without it the word runs
 * off the right edge of the page and into nothing.
 */
const wrap = (ink: Ink, text: string, maxWidth: number, options: TextOptions): string[] => {
  const lines: string[] = []
  let line = ''

  const pushBroken = (word: string) => {
    let rest = word

    while (widthOf(ink, rest, options) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1

      while (cut > 1 && widthOf(ink, `${rest.slice(0, cut)}-`, options) > maxWidth) cut -= 1

      lines.push(`${rest.slice(0, cut)}-`)
      rest = rest.slice(cut)
    }

    line = rest
  }

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word

    if (widthOf(ink, candidate, options) <= maxWidth) {
      line = candidate

      continue
    }

    if (line) lines.push(line)

    if (widthOf(ink, word, options) > maxWidth) pushBroken(word)
    else line = word
  }

  if (line) lines.push(line)

  return lines
}

const rule = (page: PDFPage, x: number, y: number, width: number, color: RGB, thickness = 0.5) =>
  page.drawRectangle({ x, y, width, height: thickness, color })

/**
 * The stamp across a draft.
 *
 * A draft could always be downloaded — that is what makes it useful, he reads
 * the paper before he commits to it. What it could not do until now is *look*
 * like a draft. It carried no number, and nothing else: the same header, the
 * same totals, the same footer as a real invoice, one careless attachment away
 * from a client believing he had been billed.
 *
 * So the word is drawn corner to corner, underneath everything else, before a
 * single line of the document exists. Underneath matters — a watermark drawn
 * last would sit over the figures and make the paper harder to read, and the
 * point is not to obstruct it but to make it impossible to mistake.
 */
/**
 * Where the stamp lands, and how big it is.
 *
 * Separated from the drawing because it is the part that can be wrong without
 * looking wrong: two earlier attempts here picked the size as a fraction of
 * the page diagonal, which ignores that a rotated line is as wide as its own
 * *height* as well as its length, and both sliced a letter off against the
 * page edge. The corners come back with it so a test can say the word is
 * actually on the sheet, rather than someone squinting at a thumbnail.
 */
export const stampBox = (font: PDFFont, word: string) => {
  // cos 45° = sin 45°. Every projection below is the same number, which is
  // the only reason this arithmetic stays readable.
  const tilt = Math.cos(Math.PI / 4)

  // Solve for the size that makes the rotated box exactly fill the page width
  // between the margins: `tilt × (width + height) = usable`.
  const widthPer = font.widthOfTextAtSize(word, 100) / 100
  const heightPer = font.heightAtSize(100) / 100
  const size = (PAGE_W - STAMP_MARGIN * 2) / (tilt * (widthPer + heightPer))

  const width = font.widthOfTextAtSize(word, size)
  const height = font.heightAtSize(size)
  const ascent = font.heightAtSize(size, { descender: false })

  /*
   * Centre the glyph box, not the baseline.
   *
   * The box reaches further above the baseline than below it, so a baseline
   * centred on the page leaves the word hanging low and pushes its far end
   * past the edge. This moves it back along the perpendicular of the
   * rotation — at 45°, right and down in equal measure.
   */
  const lift = ascent - height / 2
  const x = PAGE_W / 2 - (width / 2) * tilt + lift * tilt
  const y = PAGE_H / 2 - (width / 2) * tilt - lift * tilt

  // The four corners of the rotated box, in page coordinates.
  const corners = [
    [0, -(height - ascent)],
    [width, -(height - ascent)],
    [width, ascent],
    [0, ascent],
  ].map(([along, across]) => ({
    x: x + (along as number) * tilt - (across as number) * tilt,
    y: y + (along as number) * tilt + (across as number) * tilt,
  }))

  return {
    size,
    x,
    y,
    minX: Math.min(...corners.map((corner) => corner.x)),
    maxX: Math.max(...corners.map((corner) => corner.x)),
    minY: Math.min(...corners.map((corner) => corner.y)),
    maxY: Math.max(...corners.map((corner) => corner.y)),
  }
}

const stamp = (page: PDFPage, font: PDFFont, word: string): void => {
  const box = stampBox(font, word)

  page.drawText(word, {
    x: box.x,
    y: box.y,
    size: box.size,
    font,
    color: GREY,
    // Light enough to read the invoice through, dark enough to survive a grey
    // office printer. Anything under 0.1 disappears on paper, which is exactly
    // where the mistake this prevents would be made.
    opacity: 0.13,
    rotate: degrees(45),
  })
}

/* -------------------------------------------------------------------------- */
/* The mark                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The site's own `Y`, stroked exactly as `BrandMark.tsx` draws it — the same
 * three paths on the same 48 grid, with the caret in the accent colour.
 *
 * Drawn rather than embedded as an image so it stays a vector at any print
 * size, and so the file carries no raster data at all.
 */
const drawMark = (page: PDFPage, x: number, top: number, size: number): void => {
  const scale = size / 48
  const shared = {
    x,
    y: top,
    scale,
    borderWidth: 5 * scale,
    borderLineCap: LineCapStyle.Round,
  }

  page.drawSvgPath('M10 10 L24 27 L38 10', { ...shared, borderColor: INK })
  page.drawSvgPath('M24 27 V33', { ...shared, borderColor: INK })
  page.drawSvgPath('M24 34 V42', { ...shared, borderColor: BLUE })
}

/* -------------------------------------------------------------------------- */
/* The payment code                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `EPC069-12` — the European payment code, switch 7.
 *
 * Eleven lines in a fixed order. The client points their banking app at it and
 * the transfer form fills itself: account, amount and, crucially, the invoice
 * number as the reference — which is what lets a payment be matched to a
 * document without him reading a bank statement line by line.
 *
 * Only one of the two remittance fields may be used; this fills the
 * unstructured one, which is what German banks read.
 */
export const epcPayload = (input: {
  seller: Seller
  amountCents: number
  reference: string
}): string =>
  [
    'BCD',
    '002',
    '1',
    'SCT',
    input.seller.bic.replace(/\s+/g, '').toUpperCase(),
    input.seller.name.slice(0, 70),
    compactIban(input.seller.iban),
    `EUR${(input.amountCents / 100).toFixed(2)}`,
    '',
    '',
    input.reference.slice(0, 140),
  ].join('\n')

/**
 * The code, as merged rectangles.
 *
 * A dark module is a square, and a row of them is one rectangle rather than
 * twenty — the run merging below turns roughly nine hundred draw operations
 * into about two hundred, which is the difference between a 40 KB and a 90 KB
 * invoice for something nobody will ever zoom into.
 */
const drawQr = (page: PDFPage, payload: string, x: number, bottom: number, size: number): void => {
  const code = qrcode(0, 'M')

  code.addData(payload, 'Byte')
  code.make()

  const count = code.getModuleCount()
  const cell = size / count

  for (let row = 0; row < count; row += 1) {
    let start = -1

    for (let column = 0; column <= count; column += 1) {
      const dark = column < count && code.isDark(row, column)

      if (dark && start === -1) start = column

      if (!dark && start !== -1) {
        page.drawRectangle({
          x: x + start * cell,
          // Row 0 is the top of the code, and a PDF counts from the bottom.
          y: bottom + size - (row + 1) * cell,
          width: (column - start) * cell,
          height: cell,
          color: INK,
        })
        start = -1
      }
    }
  }
}

/* -------------------------------------------------------------------------- */
/* The document                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Refuses to draw a name the embedded face cannot set.
 *
 * Called before anything is rendered, so the failure is one clear sentence in
 * the admin rather than a PDF full of empty boxes in a client's inbox.
 */
export const assertPrintable = (invoice: Invoice, client: Client): void => {
  const fields: Array<[string, string]> = [
    ['the client name', client.company || client.contactName],
    ['the contact name', client.contactName],
    ['the street', client.street],
    ['the city', client.city],
    ['your note', invoice.note],
    ...invoice.lines.map(
      (line, index) => [`line ${index + 1}`, `${line.description} ${line.detail}`] as [string, string],
    ),
  ]

  for (const [label, value] of fields) {
    const bad = findUnprintable(value)

    if (bad) {
      throw badRequestError(
        `The invoice font cannot print “${bad}” in ${label}. Write it in Latin letters, or ask for a font that covers it.`,
      )
    }
  }
}

export const renderInvoicePdf = async (
  invoice: Invoice,
  client: Client,
  seller: Seller = resolveSeller(),
): Promise<Uint8Array> => {
  assertPrintable(invoice, client)

  const language = invoice.language
  const words = WORDS[language]
  const paper = paperRules(invoice, seller)

  const document = await PDFDocument.create()

  document.registerFontkit(fontkit)

  // `subset: true` keeps only the glyphs this invoice actually uses, so a
  // 69 KB face costs a few kilobytes per document instead of being carried
  // whole into every file he will ever send.
  const regular = await document.embedFont(base64Bytes(SPACE_GROTESK_REGULAR), { subset: true })
  const bold = await document.embedFont(base64Bytes(SPACE_GROTESK_BOLD), { subset: true })

  const page = document.addPage([PAGE_W, PAGE_H])
  const ink: Ink = { page, regular, bold }

  // The name in the reader's title bar and on the print dialog. A draft says
  // so there too, because that is the one place a filename cannot reach.
  document.setTitle(
    `${DOCUMENT_TITLE[language][invoice.kind]} ${invoice.number ?? `(${words.draft})`}`.trim(),
  )
  document.setAuthor(seller.name)
  document.setCreator(seller.website)
  document.setProducer(seller.website)
  document.setSubject(invoice.lines[0]?.description ?? '')

  if (paper.stamp) stamp(page, bold, paper.stamp)

  let y = PAGE_H - TOP

  /* ── Header ─────────────────────────────────────────────────────────── */

  const markSize = 23

  drawMark(page, LEFT, y, markSize)

  write(ink, seller.name, LEFT + markSize + 11, y - 16, { size: 16, bold: true })
  write(ink, `${seller.trade[language]} · ${seller.city}`, LEFT + markSize + 11, y - 26, {
    size: 6.5,
    color: FAINT,
    tracking: 0.9,
  })

  y -= markSize + 14

  // Switch 2 — the thin blue rule. The only mark of the site's identity on an
  // otherwise deliberately formal page.
  rule(page, LEFT, y, CONTENT, BLUE, 0.9)

  /* ── Address and meta ───────────────────────────────────────────────── */

  y -= 30 * AIRY

  const senderLine = [seller.name, seller.street, `${seller.postcode} ${seller.city}`].join(' · ')

  write(ink, senderLine, LEFT, y, { size: 6, color: FAINT })
  rule(page, LEFT, y - 4, CONTENT * 0.5, HAIR, 0.4)

  y -= 18

  const addressLines = [
    client.company,
    client.contactName,
    client.street,
    client.streetExtra,
    [client.postcode, client.city].filter(Boolean).join(' '),
    client.country === seller.country ? '' : client.country,
  ].filter((line) => line.trim() !== '')

  let addressY = y

  addressLines.forEach((line, index) => {
    write(ink, line, LEFT, addressY, { size: 9.5, bold: index === 0 })
    addressY -= 13
  })

  // The meta block sits on the same baseline as the address, right-aligned, so
  // the eye finds the number and the due date without reading the address.
  const metaRight = LEFT + CONTENT
  let metaY = y

  // 205, not 150: "Leistungszeitraum" beside "01.09.2026 – 30.09.2026" is
  // 190 points of text, and at 150 the label ran straight into the value.
  const metaRow = (label: string, value: string, accent = false) => {
    write(ink, label, metaRight - 205, metaY, { size: 7.5, color: GREY })
    writeRight(ink, value, metaRight, metaY, {
      size: 7.5,
      bold: true,
      color: accent ? BLUE : INK,
    })
    metaY -= 12
  }

  metaRow(words.number, paper.number)
  metaRow(words.date, date(invoice.issuedOn, language))

  if (invoice.serviceFrom || invoice.serviceTo) {
    // Switch 8 is off: the period is stated once, here, and never repeated on
    // every line.
    const from = date(invoice.serviceFrom, language)
    const to = date(invoice.serviceTo, language)

    metaRow(words.period, invoice.serviceFrom && invoice.serviceTo && from !== to ? `${from} – ${to}` : from)
  }

  if (paper.showDue) metaRow(words.dueBy, date(invoice.dueOn, language), true)

  y = Math.min(addressY, metaY) - 22 * AIRY

  /* ── Title ──────────────────────────────────────────────────────────── */

  const title = DOCUMENT_TITLE[language][invoice.kind]

  write(ink, title, LEFT, y, { size: 22, bold: true })

  if (invoice.number) {
    write(ink, invoice.number, LEFT + widthOf(ink, `${title} `, { size: 22, bold: true }), y, {
      size: 22,
      bold: true,
      color: BLUE,
    })
  }

  y -= 16

  // Said in words directly under the title, for the reader who has the page in
  // greyscale on a phone and never sees the stamp behind it.
  if (paper.notice) {
    for (const line of wrap(ink, paper.notice, CONTENT * 0.78, { size: 8, bold: true })) {
      write(ink, line, LEFT, y, { size: 8, bold: true, color: GREY })
      y -= 12
    }

    y -= 2
  }

  if (invoice.correctsNumber) {
    write(ink, words.corrects.replace('{number}', invoice.correctsNumber), LEFT, y, {
      size: 8,
      color: GREY,
    })
    y -= 14
  }

  const intro =
    invoice.kind === 'CANCELLATION'
      ? words.introCancel
      : invoice.kind === 'CREDIT_NOTE'
        ? words.introCredit
        : words.intro

  for (const line of wrap(ink, intro, CONTENT * 0.78, { size: 8.5 })) {
    write(ink, line, LEFT, y, { size: 8.5, color: GREY })
    y -= 12
  }

  /* ── Lines ──────────────────────────────────────────────────────────── */

  y -= 18 * AIRY

  const head = { size: 6.5, color: GREY, bold: true, tracking: 0.8 } satisfies TextOptions

  write(ink, words.pos.toUpperCase(), LEFT + COL_POS, y, head)
  write(ink, words.desc.toUpperCase(), LEFT + COL_DESC, y, head)
  writeRight(ink, words.qty.toUpperCase(), LEFT + COL_QTY_R, y, head)
  writeRight(ink, words.unit.toUpperCase(), LEFT + COL_UNIT_R, y, head)
  writeRight(ink, words.amount.toUpperCase(), LEFT + COL_AMOUNT_R, y, head)

  y -= 7
  rule(page, LEFT, y, CONTENT, INK, 0.9)
  y -= 14 * AIRY

  const descriptionWidth = COL_QTY_R - COL_DESC - 24

  for (const line of invoice.lines) {
    const titleLines = wrap(ink, line.description, descriptionWidth, { size: 9 })
    const detailLines = line.detail ? wrap(ink, line.detail, descriptionWidth, { size: 7 }) : []

    write(ink, String(line.position), LEFT + COL_POS, y, { size: 7.5, color: FAINT })

    let rowY = y

    titleLines.forEach((text) => {
      write(ink, text, LEFT + COL_DESC, rowY, { size: 9 })
      rowY -= 11
    })

    detailLines.forEach((text) => {
      write(ink, text, LEFT + COL_DESC, rowY - 1, { size: 7, color: FAINT })
      rowY -= 9.5
    })

    writeRight(ink, quantity(line.quantity, language), LEFT + COL_QTY_R, y, { size: 9 })
    writeRight(ink, money(line.unitCents, language, invoice.currency), LEFT + COL_UNIT_R, y, { size: 9 })
    writeRight(ink, money(line.netCents, language, invoice.currency), LEFT + COL_AMOUNT_R, y, {
      size: 9,
      bold: true,
    })

    y = rowY - 7 * AIRY
    rule(page, LEFT, y + 5, CONTENT, HAIR, 0.4)
  }

  /* ── Totals ─────────────────────────────────────────────────────────── */

  y -= 12
  // Switch 4 is off: a right-aligned block, not a wide blue band. Half the
  // width, so the figures sit under the amount column they add up.
  const sumsLeft = LEFT + CONTENT * 0.52
  const sumsRight = LEFT + CONTENT

  const sumRow = (label: string, value: string, options: TextOptions = {}) => {
    write(ink, label, sumsLeft, y, { size: 8.5, color: GREY, ...options })
    writeRight(ink, value, sumsRight, y, { size: 8.5, ...options })
    y -= 13
  }

  sumRow(words.net, money(invoice.netCents, language, invoice.currency))

  const rates = [...new Set(invoice.lines.map((line) => line.taxRate))]
  const rateLabel =
    rates.length === 1 ? `${words.vat} ${quantity(rates[0] ?? 0, language)} %` : words.vat

  sumRow(rateLabel, money(invoice.taxCents, language, invoice.currency))

  y -= 3
  rule(page, sumsLeft, y + 6, sumsRight - sumsLeft, INK, 0.9)
  y -= 6

  write(ink, words.total, sumsLeft, y, { size: 11.5, bold: true })
  writeRight(ink, money(invoice.totalCents, language, invoice.currency), sumsRight, y, {
    size: 11.5,
    bold: true,
    color: BLUE,
  })

  y -= 24

  /* ── The law, and how to pay ────────────────────────────────────────── */

  /*
   * The §19 sentence, and the one case where it must not be printed.
   *
   * `issueInvoice` refuses a document that charges VAT while he is a
   * Kleinunternehmer, so this should be unreachable. It is here anyway for
   * the documents frozen before that rule existed, which are redrawn by
   * `documentBytes` whenever the stored file is missing: a page claiming "no
   * VAT is charged" above a row charging 188,10 € is the contradiction the
   * rule exists to prevent, and it must not survive in the drawing code
   * either.
   */
  if (seller.smallBusiness && invoice.taxCents === 0) {
    write(ink, SMALL_BUSINESS_NOTE[language], LEFT, y, { size: 7.5, color: GREY })
    y -= 18
  }

  const showQr = paper.showQr
  const qrSize = 74
  const payWidth = showQr ? CONTENT - qrSize - 22 : CONTENT * 0.78
  const payTop = y

  const payText = paper.payText

  for (const line of wrap(ink, payText, payWidth, { size: 8 })) {
    write(ink, line, LEFT, y, { size: 8, color: GREY })
    y -= 11
  }

  /*
   * The card link, under the bank details rather than instead of them.
   *
   * A transfer costs him nothing and a card costs a percentage, so the bank
   * stays the first thing offered and its QR code stays where it is. This is
   * the second door, for the client who would rather not type an IBAN — and
   * for the one abroad, whose bank would charge them more to wire it than the
   * card costs him.
   *
   * Drawn in blue so it reads as a link on paper, and left unwrapped: a
   * Stripe link is short, and a URL broken across two lines cannot be typed
   * back in by anyone holding a printout.
   */
  if (invoice.payUrl) {
    y -= 3
    write(ink, words.payCard, LEFT, y, { size: 8, color: GREY })
    y -= 11
    write(ink, invoice.payUrl.replace(/^https?:\/\//, ''), LEFT, y, {
      size: 8.5,
      bold: true,
      color: BLUE,
    })
    y -= 11
  }

  if (showQr) {
    const qrBottom = payTop - qrSize + 9

    drawQr(
      page,
      epcPayload({
        seller,
        amountCents: invoice.totalCents,
        reference: `${title} ${invoice.number ?? ''}`.trim(),
      }),
      LEFT + CONTENT - qrSize,
      qrBottom,
      qrSize,
    )

    writeRight(ink, words.scan, LEFT + CONTENT, qrBottom - 9, { size: 6, color: FAINT })

    y = Math.min(y, qrBottom - 20)
  }

  /* ── His own sentence ───────────────────────────────────────────────── */

  // Switch 9. One line in his words, then his name — the difference between a
  // document and a bookkeeping artefact.
  if (invoice.note.trim()) {
    y -= 10

    for (const line of wrap(ink, invoice.note.trim(), CONTENT * 0.78, { size: 8.5 })) {
      write(ink, line, LEFT, y, { size: 8.5, color: GREY })
      y -= 12
    }

    y -= 2
    write(ink, seller.name, LEFT, y, { size: 9, bold: true })
  }

  /* ── Footer ─────────────────────────────────────────────────────────── */

  // Switch 11 — three columns, pinned to the bottom of the sheet rather than
  // floating after the content, so every invoice he sends has the same foot.
  const footTop = BOTTOM + 58

  rule(page, LEFT, footTop, CONTENT, HAIR, 0.4)

  const columns: Array<[string, string[]]> = [
    [
      words.address,
      [
        seller.name,
        seller.street,
        `${seller.postcode} ${seller.city}`,
        seller.vatId
          ? `${words.vatIdLabel} ${seller.vatId}`
          : `${words.taxNumber} ${seller.taxNumber}`,
      ],
    ],
    [words.bank, [seller.bankName, compactIban(seller.iban), `BIC ${seller.bic}`]],
    [words.contact, [seller.website, seller.email, seller.phone].filter(Boolean)],
  ]

  columns.forEach(([label, lines], index) => {
    const x = LEFT + (CONTENT / 3) * index
    let footY = footTop - 12

    write(ink, label.toUpperCase(), x, footY, { size: 5.8, color: GREY, bold: true, tracking: 0.7 })
    footY -= 9

    lines.forEach((line) => {
      write(ink, line, x, footY, { size: 6.5, color: FAINT })
      footY -= 8
    })
  })

  writeRight(ink, words.page.replace('{n}', '1').replace('{total}', '1'), LEFT + CONTENT, 20, {
    size: 6,
    color: FAINT,
  })

  return document.save()
}

/**
 * Base64 to bytes without `Buffer`.
 *
 * `atob` exists in both runtimes this has to serve; `Buffer` only exists in
 * one of them, and pulling it in for a font would be a Node dependency in a
 * Worker for no reason.
 */
const base64Bytes = (base64: string): Uint8Array => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return bytes
}

/* -------------------------------------------------------------------------- */
/* The agreement a subscription starts with                                   */
/* -------------------------------------------------------------------------- */

/**
 * The paper a subscription has, which is not an invoice.
 *
 * His question on 20 Sep: a subscription had no document at all. Its monthly
 * invoices were its only paper, and they answer a different question — "pay
 * me for October" rather than "this is what we agreed". A client who signs up
 * for 49 € a month and receives nothing until the first invoice has nothing
 * to file, nothing to check the amount against, and nothing to show a
 * colleague.
 *
 * Three things keep this page from being mistaken for a bill, and all three
 * are deliberate:
 *
 *   1. **No number.** The gapless series exists for documents that demand
 *      money. Consuming one here would put a hole in it the day he writes an
 *      agreement that never becomes a client.
 *   2. **No payment code and no due date.** There is nothing to pay yet.
 *   3. **A sentence that says so**, under the title, in the language of the
 *      paper. The stamp on a test page is drawn for the same reason: a file
 *      outlives the screen that explained it.
 *
 * Drawn fresh on every request rather than frozen. An invoice is frozen
 * because what was sent is a fact that must never change; an agreement
 * describes the arrangement **as it stands today**, and the copy a client
 * holds is the attachment on the letter that carried it.
 */
export type SubscriptionPaper = {
  description: string
  amountCents: number
  currency: string
  taxRate: number
  billingDay: number
  /** The first month this bills, as its first day. */
  nextPeriod: string
  startedOn: string
  cancelledOn: string | null
  note: string
  /** The term every invoice it writes will carry. */
  dueDays: number
}

type AgreementWords = {
  title: string
  intro: string
  notBill: string
  dated: string
  firstBill: string
  billing: string
  billingValue: string
  endedOn: string
  service: string
  amount: string
  perMonth: string
  vat: string
  vatNone: string
  vatPlus: string
  terms: string
  termOpen: string
  termStop: string
  termInvoice: string
  termDue: string
  termEnded: string
  place: string
  signClient: string
  signSeller: string
  address: string
  bank: string
  contact: string
  taxNumber: string
  vatIdLabel: string
  test: string
  testNotice: string
}

const AGREEMENT: Record<InvoiceLanguage, AgreementWords> = {
  de: {
    title: 'Vereinbarung',
    intro:
      'Hiermit halten wir die laufende Zusammenarbeit fest, auf die wir uns geeinigt haben.',
    // Said on the page itself, because the page will be read months later by
    // somebody who was not in the conversation — an accountant, most likely.
    notBill:
      'Dies ist keine Rechnung. Die Abrechnung erfolgt monatlich mit einer eigenen Rechnung.',
    dated: 'Datum',
    firstBill: 'Erste Abrechnung',
    billing: 'Abrechnung',
    billingValue: 'monatlich, am {day}.',
    endedOn: 'Beendet am',
    service: 'Leistung',
    amount: 'Betrag',
    perMonth: 'pro Monat',
    vat: 'Umsatzsteuer',
    vatNone: 'keine (§ 19 UStG)',
    vatPlus: 'zzgl. {rate} %',
    terms: 'Bedingungen',
    termOpen: 'Die Vereinbarung läuft auf unbestimmte Zeit.',
    termStop:
      'Beide Seiten können sie zum Ende eines Monats beenden. Eine formlose Nachricht genügt.',
    termInvoice: 'Für jeden Monat erhalten Sie eine Rechnung über den oben genannten Betrag.',
    termDue: 'Rechnungen sind innerhalb von {days} Tagen ohne Abzug zahlbar.',
    termEnded: 'Diese Vereinbarung ist beendet und wird nicht weiter abgerechnet.',
    place: 'Ort, Datum',
    signClient: 'Auftraggeber',
    signSeller: 'Auftragnehmer',
    address: 'Anschrift',
    bank: 'Bankverbindung',
    contact: 'Kontakt',
    taxNumber: 'Steuernummer',
    vatIdLabel: 'USt-IdNr.',
    test: 'TEST',
    testNotice:
      'Diese Seite wurde mit erfundenen Absenderdaten erstellt und ist kein gültiges Dokument.',
  },
  en: {
    title: 'Agreement',
    intro: 'This letter records the ongoing work we have agreed.',
    notBill: 'This is not an invoice. Each month is billed with an invoice of its own.',
    dated: 'Date',
    firstBill: 'First billed',
    billing: 'Billing',
    billingValue: 'monthly, on the {day}.',
    endedOn: 'Ended on',
    service: 'Service',
    amount: 'Amount',
    perMonth: 'per month',
    vat: 'VAT',
    vatNone: 'none (§ 19 German VAT Act)',
    vatPlus: 'plus {rate} %',
    terms: 'Terms',
    termOpen: 'This agreement runs for an open period.',
    termStop: 'Either side may end it at the end of any month. A plain message is enough.',
    termInvoice: 'You receive an invoice for each month, for the amount above.',
    termDue: 'Invoices are payable in full within {days} days.',
    termEnded: 'This agreement has ended and is no longer billed.',
    place: 'Place, date',
    signClient: 'Client',
    signSeller: 'Contractor',
    address: 'Address',
    bank: 'Bank',
    contact: 'Contact',
    taxNumber: 'Tax number',
    vatIdLabel: 'VAT ID',
    test: 'TEST',
    testNotice:
      'This page was drawn with invented sender details and is not a valid document.',
  },
}

/**
 * The month a period names, in the language of the paper.
 *
 * Hand-rolled here rather than imported from the validation module for the
 * reason stated there: `Intl` month names depend on the runtime's ICU data,
 * and two clients holding differently-worded papers from the same system is
 * the bug that costs a phone call. Kept in one place — this reads the same
 * table the invoice line does.
 */
const AGREEMENT_MONTHS: Record<InvoiceLanguage, string[]> = {
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
       'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  en: ['January', 'February', 'March', 'April', 'May', 'June',
       'July', 'August', 'September', 'October', 'November', 'December'],
}

const monthOf = (period: string, language: InvoiceLanguage): string => {
  const [year, month] = period.split('-')
  const name = AGREEMENT_MONTHS[language][Number(month) - 1]

  return name ? `${name} ${year}` : period
}

/**
 * Refuses a page the embedded face cannot draw, before it is drawn.
 *
 * The same guard `assertPrintable` is for invoices, and needed for the same
 * reason: Space Grotesk covers Latin, and a description typed in Arabic would
 * come out as a row of empty boxes in a document going to a client. Better a
 * sentence naming the character than a file that looks broken.
 */
export const assertAgreementPrintable = (paper: SubscriptionPaper, client: Client): void => {
  const fields: Array<[string, string]> = [
    ['the client name', client.company || client.contactName],
    ['the contact name', client.contactName],
    ['the street', client.street],
    ['the city', client.city],
    ['what they pay for', paper.description],
    ['your note', paper.note],
  ]

  for (const [label, value] of fields) {
    const bad = findUnprintable(value)

    if (bad) {
      throw badRequestError(
        `The document font cannot print “${bad}” in ${label}. Write it in Latin letters, or ask for a font that covers it.`,
      )
    }
  }
}

export const renderSubscriptionPdf = async (
  paper: SubscriptionPaper,
  client: Client,
  today: string,
  seller: Seller = resolveSeller(),
): Promise<Uint8Array> => {
  assertAgreementPrintable(paper, client)

  const language = client.language
  const words = AGREEMENT[language]
  const ended = paper.cancelledOn !== null

  const document = await PDFDocument.create()

  document.registerFontkit(fontkit)

  const regular = await document.embedFont(base64Bytes(SPACE_GROTESK_REGULAR), { subset: true })
  const bold = await document.embedFont(base64Bytes(SPACE_GROTESK_BOLD), { subset: true })

  const page = document.addPage([PAGE_W, PAGE_H])
  const ink: Ink = { page, regular, bold }

  document.setTitle(`${words.title} · ${paper.description}`)
  document.setAuthor(seller.name)
  document.setCreator(seller.website)
  document.setProducer(seller.website)
  document.setSubject(paper.description)

  // Invented sender details get the same stamp an invoice gets. A file
  // outlives the machine that made it, and the footer below prints an account
  // that does not exist.
  if (seller.isTest) stamp(page, bold, words.test)

  let y = PAGE_H - TOP

  /* ── Header ─────────────────────────────────────────────────────────── */

  const markSize = 23

  drawMark(page, LEFT, y, markSize)

  write(ink, seller.name, LEFT + markSize + 11, y - 16, { size: 16, bold: true })
  write(ink, `${seller.trade[language]} · ${seller.city}`, LEFT + markSize + 11, y - 26, {
    size: 6.5,
    color: FAINT,
    tracking: 0.9,
  })

  y -= markSize + 14

  rule(page, LEFT, y, CONTENT, BLUE, 0.9)

  /* ── Address and meta ───────────────────────────────────────────────── */

  y -= 30 * AIRY

  const senderLine = [seller.name, seller.street, `${seller.postcode} ${seller.city}`].join(' · ')

  write(ink, senderLine, LEFT, y, { size: 6, color: FAINT })
  rule(page, LEFT, y - 4, CONTENT * 0.5, HAIR, 0.4)

  y -= 18

  const addressLines = [
    client.company,
    client.contactName,
    client.street,
    client.streetExtra,
    [client.postcode, client.city].filter(Boolean).join(' '),
    client.country === seller.country ? '' : client.country,
  ].filter((line) => line.trim() !== '')

  let addressY = y

  addressLines.forEach((line, index) => {
    write(ink, line, LEFT, addressY, { size: 9.5, bold: index === 0 })
    addressY -= 13
  })

  const metaRight = LEFT + CONTENT
  let metaY = y

  const metaRow = (label: string, value: string, accent = false) => {
    write(ink, label, metaRight - 205, metaY, { size: 7.5, color: GREY })
    writeRight(ink, value, metaRight, metaY, {
      size: 7.5,
      bold: true,
      color: accent ? BLUE : INK,
    })
    metaY -= 12
  }

  metaRow(words.dated, date(today, language))
  metaRow(words.billing, words.billingValue.replace('{day}', String(paper.billingDay)))

  // The month, not the day: this says which month the first invoice covers,
  // and `billingValue` above already says which day of it he bills on.
  if (ended) metaRow(words.endedOn, date(paper.cancelledOn, language))
  else metaRow(words.firstBill, monthOf(paper.nextPeriod, language), true)

  y = Math.min(addressY, metaY) - 22 * AIRY

  /* ── Title ──────────────────────────────────────────────────────────── */

  write(ink, words.title, LEFT, y, { size: 22, bold: true })

  y -= 16

  // Directly under the title, where the stamp cannot be seen on a greyscale
  // printout and a phone shows only the first third of the page.
  for (const line of wrap(ink, words.notBill, CONTENT * 0.78, { size: 8, bold: true })) {
    write(ink, line, LEFT, y, { size: 8, bold: true, color: GREY })
    y -= 12
  }

  if (seller.isTest) {
    y -= 2

    for (const line of wrap(ink, words.testNotice, CONTENT * 0.78, { size: 8, bold: true })) {
      write(ink, line, LEFT, y, { size: 8, bold: true, color: GREY })
      y -= 12
    }
  }

  y -= 4

  for (const line of wrap(ink, words.intro, CONTENT * 0.78, { size: 8.5 })) {
    write(ink, line, LEFT, y, { size: 8.5, color: GREY })
    y -= 12
  }

  /* ── What was agreed ────────────────────────────────────────────────── */

  y -= 14 * AIRY

  rule(page, LEFT, y, CONTENT, INK, 0.9)
  y -= 15 * AIRY

  const labelX = LEFT
  const valueX = LEFT + 150

  const agreedRow = (label: string, lines: string[], options: TextOptions = {}) => {
    write(ink, label, labelX, y, { size: 7.5, color: GREY })

    lines.forEach((line) => {
      write(ink, line, valueX, y, { size: 9.5, ...options })
      y -= 13
    })

    y -= 5
  }

  agreedRow(words.service, wrap(ink, paper.description, CONTENT - 150, { size: 9.5 }))

  // The one figure the whole page exists for, in the same blue the invoice
  // total is drawn in.
  write(ink, words.amount, labelX, y, { size: 7.5, color: GREY })
  write(ink, money(paper.amountCents, language, paper.currency), valueX, y, {
    size: 13,
    bold: true,
    color: BLUE,
  })
  write(
    ink,
    ` ${words.perMonth}`,
    valueX + widthOf(ink, money(paper.amountCents, language, paper.currency), { size: 13, bold: true }),
    y,
    { size: 8.5, color: GREY },
  )
  y -= 18

  agreedRow(
    words.vat,
    [
      paper.taxRate > 0
        ? words.vatPlus.replace('{rate}', quantity(paper.taxRate, language))
        : words.vatNone,
    ],
    { size: 9 },
  )

  y += 5
  rule(page, LEFT, y + 6, CONTENT, HAIR, 0.4)
  y -= 12 * AIRY

  /* ── Terms ──────────────────────────────────────────────────────────── */

  write(ink, words.terms.toUpperCase(), LEFT, y, {
    size: 6.5,
    color: GREY,
    bold: true,
    tracking: 0.8,
  })

  y -= 16

  const terms = ended
    ? [words.termEnded, words.termInvoice]
    : [
        words.termOpen,
        words.termStop,
        words.termInvoice,
        words.termDue.replace('{days}', String(paper.dueDays)),
      ]

  terms.forEach((term, index) => {
    const bullet = `${index + 1}.`

    write(ink, bullet, LEFT, y, { size: 8.5, color: FAINT })

    for (const line of wrap(ink, term, CONTENT * 0.82 - 18, { size: 8.5 })) {
      write(ink, line, LEFT + 18, y, { size: 8.5, color: GREY })
      y -= 12
    }

    y -= 4
  })

  /*
   * The §19 sentence, in the same words the invoice prints.
   *
   * Printed only when it is true of this arrangement: a subscription set to
   * 19 % while he is still a Kleinunternehmer would otherwise carry both the
   * rate and the sentence denying it — the §14c contradiction `issueInvoice`
   * refuses, appearing a month early on the agreement instead.
   */
  if (seller.smallBusiness && paper.taxRate === 0) {
    y -= 6
    write(ink, SMALL_BUSINESS_NOTE[language], LEFT, y, { size: 7.5, color: GREY })
    y -= 14
  }

  /* ── His own sentence ───────────────────────────────────────────────── */

  if (paper.note.trim()) {
    y -= 8

    for (const line of wrap(ink, paper.note.trim(), CONTENT * 0.78, { size: 8.5 })) {
      write(ink, line, LEFT, y, { size: 8.5, color: GREY })
      y -= 12
    }
  }

  /* ── Signatures ─────────────────────────────────────────────────────── */

  /*
   * Two lines, and neither is required.
   *
   * A verbal agreement is binding in Germany and this paper is worth having
   * whether or not anybody signs it. The lines are here because a client who
   * signs and returns it has put the amount beyond argument, and because a
   * page with nowhere to sign quietly tells the reader it is only an
   * announcement.
   *
   * Pinned above the footer rather than after the content, so a short
   * description and a long one produce the same sheet.
   */
  const signTop = Math.min(y - 20, BOTTOM + 150)

  const signColumn = (x: number, width: number, who: string) => {
    rule(page, x, signTop, width, HAIR, 0.6)
    write(ink, words.place, x, signTop - 10, { size: 6, color: FAINT })
    write(ink, who, x, signTop - 20, { size: 7.5, bold: true })
  }

  const signWidth = CONTENT * 0.42

  signColumn(LEFT, signWidth, words.signClient)
  signColumn(LEFT + CONTENT - signWidth, signWidth, `${words.signSeller} · ${seller.name}`)

  /* ── Footer ─────────────────────────────────────────────────────────── */

  const footTop = BOTTOM + 58

  rule(page, LEFT, footTop, CONTENT, HAIR, 0.4)

  const columns: Array<[string, string[]]> = [
    [
      words.address,
      [
        seller.name,
        seller.street,
        `${seller.postcode} ${seller.city}`,
        seller.vatId
          ? `${words.vatIdLabel} ${seller.vatId}`
          : `${words.taxNumber} ${seller.taxNumber}`,
      ],
    ],
    [words.bank, [seller.bankName, compactIban(seller.iban), `BIC ${seller.bic}`]],
    [words.contact, [seller.website, seller.email, seller.phone].filter(Boolean)],
  ]

  columns.forEach(([label, lines], index) => {
    const x = LEFT + (CONTENT / 3) * index
    let footY = footTop - 12

    write(ink, label.toUpperCase(), x, footY, { size: 5.8, color: GREY, bold: true, tracking: 0.7 })
    footY -= 9

    lines.forEach((line) => {
      write(ink, line, x, footY, { size: 6.5, color: FAINT })
      footY -= 8
    })
  })

  return document.save()
}

/**
 * What the agreement calls itself, for the callers outside this file that
 * need the same word — the filename and the letter's subject, so far. One
 * source, so the title on the page, the name on disk and the subject of the
 * mail can never say three different things.
 */
export const agreementTitle = (language: InvoiceLanguage): string => AGREEMENT[language].title
