import fontkit from '@pdf-lib/fontkit'
import { LineCapStyle, PDFDocument, type PDFFont, type PDFPage, degrees, rgb, setCharacterSpacing } from 'pdf-lib'
import qrcode from 'qrcode-generator'
import { countryName as englishCountryName } from '../../contracts/country.contract'
import { type DocumentLanguage, formatMoney } from '../../contracts/invoice.contract'
import type { InvoiceDocument } from './invoice.document'
import { SPACE_GROTESK_BOLD, SPACE_GROTESK_REGULAR } from './invoice.font'

/**
 * The printed invoice, cancellation document and cash receipt.
 *
 * pdf-lib and fontkit are pure JavaScript — no DOM, no native code, no
 * filesystem — so the same function runs in `bun run dev` and inside a
 * Cloudflare Worker. The font is the site's own Space Grotesk, embedded and
 * subset, so a document looks the same on every reader.
 *
 * German is the baseline and English a copy of the same document (one
 * number, one identity, marked as a copy). Arabic is refused before this file
 * is reached: see `docs/v2/invoices.md` for why.
 */

const PAGE = { width: 595.28, height: 841.89 }
/** The bottom margin keeps running content clear of the three-column footer. */
const MARGIN = { left: 62, right: 62, top: 56, bottom: 132 }
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right
/** Where the footer's hairline sits; its columns hang below it. */
const FOOTER_TOP = 112

/** The site's ink, `#10172f`, and its muted foreground, `#617095`. */
const INK = rgb(16 / 255, 23 / 255, 47 / 255)
const MUTED = rgb(97 / 255, 112 / 255, 149 / 255)
const RULE = rgb(221 / 255, 226 / 255, 239 / 255)
const MARK = rgb(0.85, 0.15, 0.15)
/** The TEST / DRAFT watermark: a pale grey that never competes with the figures. */
const WATERMARK = rgb(0.91, 0.92, 0.95)
/** The site's blue, `#355cff`: the mark's caret, the rule, the number and the total. */
export const BRAND_BLUE = rgb(53 / 255, 92 / 255, 1)

type Words = {
  invoice: string
  cancellation: string
  receipt: string
  number: string
  cancellationNumber: string
  date: string
  serviceDate: string
  servicePeriod: string
  billingPeriod: string
  due: string
  customerVat: string
  item: string
  description: string
  qty: string
  unitPrice: string
  vat: string
  amount: string
  subtotal: string
  discount: string
  net: string
  vatAt: (rate: string) => string
  total: string
  kleinunternehmer: string
  reverseCharge: string
  schedule: string
  bank: string
  holder: string
  reference: string
  card: string
  payBy: (date: string) => string
  payNow: string
  cancels: (number: string, date: string) => string
  cancelReason: string
  replaces: (number: string) => string
  copyOf: (number: string) => string
  test: string
  draft: string
  taxNumber: string
  vatId: string
  page: (index: number, count: number) => string
  receivedFrom: string
  forInvoice: string
  method: string
  cash: string
  receiptText: string
  paidOn: string
  testReceipt: string
  signature: string
  months: string[]
  tagline: string
  shortNumber: string
  shortDate: string
  shortDue: string
  intro: string
  payToAccount: (date: string, number: string) => string
  scan: string
  sellerAddress: string
  contact: string
}

const WORDS: Record<DocumentLanguage, Words> = {
  de: {
    invoice: 'Rechnung',
    cancellation: 'Stornorechnung',
    receipt: 'Quittung',
    number: 'Rechnungsnummer',
    cancellationNumber: 'Stornonummer',
    date: 'Rechnungsdatum',
    serviceDate: 'Leistungsdatum',
    servicePeriod: 'Leistungszeitraum',
    billingPeriod: 'Abrechnungszeitraum',
    due: 'Fällig am',
    customerVat: 'USt-IdNr. Kunde',
    item: 'Pos.',
    description: 'Beschreibung',
    qty: 'Menge',
    unitPrice: 'Einzelpreis',
    vat: 'USt.',
    amount: 'Betrag',
    subtotal: 'Zwischensumme',
    discount: 'Rabatt',
    net: 'Nettobetrag',
    vatAt: (rate) => `Umsatzsteuer ${rate}`,
    total: 'Gesamtbetrag',
    kleinunternehmer: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
    reverseCharge: 'Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge-Verfahren).',
    schedule: 'Zahlungsplan',
    bank: 'Bankverbindung',
    holder: 'Kontoinhaber',
    reference: 'Verwendungszweck',
    card: 'Kartenzahlung: Den Zahlungslink finden Sie in unserer E-Mail.',
    payBy: (date) => `Bitte zahlen Sie den Gesamtbetrag bis zum ${date}.`,
    payNow: 'Der Betrag ist sofort fällig.',
    cancels: (number, date) => `Diese Stornorechnung storniert die Rechnung ${number} vom ${date}.`,
    cancelReason: 'Grund',
    replaces: (number) => `Diese Rechnung ersetzt die stornierte Rechnung ${number}.`,
    copyOf: (number) =>
      `Deutsche Fassung der Rechnung ${number}. Dieselbe Rechnung – keine zusätzliche Forderung.`,
    test: 'TEST – keine gültige Rechnung',
    draft: 'ENTWURF – keine gültige Rechnung',
    taxNumber: 'Steuernummer',
    vatId: 'USt-IdNr.',
    page: (index, count) => `Seite ${index} von ${count}`,
    receivedFrom: 'Erhalten von',
    forInvoice: 'Für Rechnung',
    method: 'Zahlungsart',
    cash: 'Bar',
    receiptText: 'Den oben genannten Betrag in bar erhalten zu haben, bestätigt:',
    paidOn: 'Zahlungsdatum',
    testReceipt: 'TEST – keine gültige Quittung',
    signature: 'Unterschrift',
    months: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
    tagline: 'Webentwicklung',
    shortNumber: 'Nummer',
    shortDate: 'Datum',
    shortDue: 'Fällig bis',
    intro: 'Vielen Dank für Ihren Auftrag. Ich stelle Ihnen folgende Leistungen in Rechnung:',
    payToAccount: (date, number) =>
      `Zahlbar ohne Abzug bis ${date} auf das unten genannte Konto. Bitte geben Sie ${number} als Verwendungszweck an.`,
    scan: 'Mit der Banking-App scannen',
    sellerAddress: 'Anschrift',
    contact: 'Kontakt',
  },
  en: {
    invoice: 'Invoice',
    cancellation: 'Cancellation invoice',
    receipt: 'Receipt',
    number: 'Invoice number',
    cancellationNumber: 'Cancellation number',
    date: 'Invoice date',
    serviceDate: 'Date of service',
    servicePeriod: 'Service period',
    billingPeriod: 'Billing period',
    due: 'Due date',
    customerVat: 'Customer VAT ID',
    item: 'No.',
    description: 'Description',
    qty: 'Qty',
    unitPrice: 'Unit price',
    vat: 'VAT',
    amount: 'Amount',
    subtotal: 'Subtotal',
    discount: 'Discount',
    net: 'Net amount',
    vatAt: (rate) => `VAT ${rate}`,
    total: 'Total',
    kleinunternehmer: 'No VAT is charged: small business under § 19 UStG (German VAT Act).',
    reverseCharge: 'Reverse charge: VAT is payable by the recipient of the service.',
    schedule: 'Payment schedule',
    bank: 'Bank details',
    holder: 'Account holder',
    reference: 'Payment reference',
    card: 'Card payment: the payment link is in our email.',
    payBy: (date) => `Please pay the total by ${date}.`,
    payNow: 'Payable immediately.',
    cancels: (number, date) => `This cancellation invoice reverses invoice ${number} of ${date}.`,
    cancelReason: 'Reason',
    replaces: (number) => `This invoice replaces the cancelled invoice ${number}.`,
    copyOf: (number) => `English copy of invoice ${number}. Same invoice — not an additional bill.`,
    test: 'TEST – not a valid invoice',
    draft: 'DRAFT – not a valid invoice',
    taxNumber: 'Tax number',
    vatId: 'VAT ID',
    page: (index, count) => `Page ${index} of ${count}`,
    receivedFrom: 'Received from',
    forInvoice: 'For invoice',
    method: 'Payment method',
    cash: 'Cash',
    receiptText: 'Receipt of the amount above in cash is confirmed by:',
    paidOn: 'Date received',
    testReceipt: 'TEST – not a valid receipt',
    signature: 'Signature',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    tagline: 'Web development',
    shortNumber: 'Number',
    shortDate: 'Date',
    shortDue: 'Due',
    intro: 'Thank you for your order. I am invoicing you for the following services:',
    payToAccount: (date, number) =>
      `Payable without deduction by ${date} to the account below. Please use ${number} as the payment reference.`,
    scan: 'Scan with your banking app',
    sellerAddress: 'Address',
    contact: 'Contact',
  },
}

/**
 * A country as the document's reader says it. German names come from the
 * runtime's own table where it has one; the shared list's English name is the
 * fallback, so a runtime without full ICU still prints something correct.
 */
const countryName = (code: string, language: DocumentLanguage): string => {
  if (language === 'de') {
    try {
      const name = new Intl.DisplayNames(['de'], { type: 'region' }).of(code)

      if (name && name !== code) return name
    } catch {
      // fall through
    }
  }

  return englishCountryName(code)
}

export const formatDate = (date: string, language: DocumentLanguage): string => {
  const [year, month, day] = date.split('-')

  if (language === 'de') return `${day}.${month}.${year}`

  return `${Number(day)} ${WORDS.en.months[Number(month) - 1]} ${year}`
}

const formatQuantity = (milli: number, language: DocumentLanguage): string => {
  const negative = milli < 0
  const magnitude = Math.abs(milli)
  const whole = Math.floor(magnitude / 1000)
  const fraction = String(magnitude % 1000).padStart(3, '0').replace(/0+$/u, '')
  const text = fraction === '' ? String(whole) : `${whole}${language === 'de' ? ',' : '.'}${fraction}`

  return negative ? `-${text}` : text
}

const formatRate = (rateBp: number, language: DocumentLanguage): string => {
  const whole = Math.floor(rateBp / 100)
  const fraction = rateBp % 100
  const text = fraction === 0 ? String(whole) : `${whole}${language === 'de' ? ',' : '.'}${String(fraction).padStart(2, '0')}`

  return `${text} %`
}

/* ------------------------------------------------------------------ drawing */

const base64Bytes = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)

  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)

  return bytes
}

let fontBytes: { regular: Uint8Array; bold: Uint8Array } | undefined

const fonts = () =>
  (fontBytes ??= { regular: base64Bytes(SPACE_GROTESK_REGULAR), bold: base64Bytes(SPACE_GROTESK_BOLD) })

type Canvas = {
  pdf: PDFDocument
  regular: PDFFont
  bold: PDFFont
  supported: Set<number>
  page: PDFPage
  y: number
  words: Words
  language: DocumentLanguage
  watermark: string | null
  onNewPage?: (canvas: Canvas) => void
}

/**
 * A character the font cannot draw becomes `?` rather than an invisible box:
 * a name in a script Space Grotesk lacks is at least visibly incomplete.
 */
const clean = (canvas: Canvas, text: string): string =>
  [...text.replace(/\t/gu, ' ')]
    .map((character) => {
      const code = character.codePointAt(0)!

      return code === 10 || canvas.supported.has(code) ? character : '?'
    })
    .join('')

const wrap = (font: PDFFont, text: string, size: number, width: number): string[] => {
  const lines: string[] = []

  for (const paragraph of text.split('\n')) {
    let line = ''

    for (const word of paragraph.split(/\s+/u)) {
      if (word === '') continue

      const candidate = line === '' ? word : `${line} ${word}`

      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate
        continue
      }

      if (line !== '') lines.push(line)

      // A single word wider than the column is cut, never allowed to overflow.
      let rest = word

      while (font.widthOfTextAtSize(rest, size) > width) {
        let cut = rest.length - 1

        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut -= 1

        lines.push(rest.slice(0, cut))
        rest = rest.slice(cut)
      }

      line = rest
    }

    lines.push(line)
  }

  return lines
}

const drawWatermark = (canvas: Canvas, page: PDFPage) => {
  if (!canvas.watermark) return

  // Centred on the page along a 45° diagonal, whatever the word's length.
  const size = canvas.watermark.length > 4 ? 96 : 150
  const width = canvas.bold.widthOfTextAtSize(canvas.watermark, size)
  const angle = Math.PI / 4
  const centre = { x: PAGE.width / 2, y: PAGE.height / 2 - 30 }

  page.drawText(canvas.watermark, {
    x: centre.x - (width / 2) * Math.cos(angle) + (size * 0.35) * Math.sin(angle),
    y: centre.y - (width / 2) * Math.sin(angle) - (size * 0.35) * Math.cos(angle),
    size,
    font: canvas.bold,
    color: WATERMARK,
    rotate: degrees(45),
  })
}

const addPage = (canvas: Canvas): void => {
  canvas.page = canvas.pdf.addPage([PAGE.width, PAGE.height])
  canvas.y = PAGE.height - MARGIN.top
  drawWatermark(canvas, canvas.page)
  canvas.onNewPage?.(canvas)
}

const ensureSpace = (canvas: Canvas, height: number): void => {
  if (canvas.y - height < MARGIN.bottom) addPage(canvas)
}

const text = (
  canvas: Canvas,
  value: string,
  options: {
    x?: number
    size?: number
    bold?: boolean
    color?: ReturnType<typeof rgb>
    width?: number
    align?: 'left' | 'right'
    y?: number
    /** Letter spacing in points, for the small uppercase labels. */
    tracking?: number
    leading?: number
  },
): number => {
  const size = options.size ?? 9.5
  const font = options.bold ? canvas.bold : canvas.regular
  const width = options.width ?? CONTENT_WIDTH
  const x = options.x ?? MARGIN.left
  const tracking = options.tracking ?? 0
  const leading = options.leading ?? 1.35
  const lines = wrap(font, clean(canvas, value), size, width)
  let y = options.y ?? canvas.y

  if (tracking) canvas.page.pushOperators(setCharacterSpacing(tracking))

  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, size) + tracking * Math.max(0, [...line].length - 1)

    canvas.page.drawText(line, {
      x: options.align === 'right' ? x + width - lineWidth : x,
      y: y - size,
      size,
      font,
      color: options.color ?? INK,
    })
    y -= size * leading
  }

  if (tracking) canvas.page.pushOperators(setCharacterSpacing(0))

  return lines.length * size * leading
}

const rule = (canvas: Canvas, y = canvas.y) => {
  canvas.page.drawLine({
    start: { x: MARGIN.left, y },
    end: { x: PAGE.width - MARGIN.right, y },
    thickness: 0.6,
    color: RULE,
  })
}

const createCanvas = async (language: DocumentLanguage, watermark: string | null): Promise<Canvas> => {
  const pdf = await PDFDocument.create()

  pdf.registerFontkit(fontkit)

  const regular = await pdf.embedFont(fonts().regular, { subset: true })
  const bold = await pdf.embedFont(fonts().bold, { subset: true })
  const supported = new Set(regular.getCharacterSet())
  const canvas: Canvas = {
    pdf,
    regular,
    bold,
    supported,
    page: undefined as unknown as PDFPage,
    y: 0,
    words: WORDS[language],
    language,
    watermark,
  }

  addPage(canvas)

  return canvas
}

/** A small uppercase label: the table heads and the footer's column titles. */
const label = (
  canvas: Canvas,
  value: string,
  options: { x: number; y: number; width?: number; align?: 'left' | 'right'; size?: number },
) =>
  text(canvas, value.toLocaleUpperCase(canvas.language), {
    ...options,
    size: options.size ?? 6.8,
    bold: true,
    color: MUTED,
    tracking: 0.9,
  })

/**
 * The foot of every page: address, bank details and contact in three
 * columns under a hairline, and the page count bottom right. The bank column
 * is left out when no IBAN is on file.
 */
const footer = (canvas: Canvas, seller: InvoiceDocument['seller']) => {
  const pages = canvas.pdf.getPages()
  const { words, language } = canvas
  const columnWidth = CONTENT_WIDTH / 3
  const columns: Array<{ title: string; lines: string[] }> = [
    {
      title: words.sellerAddress,
      lines: [
        seller.name,
        ...seller.address.split('\n'),
        seller.country && seller.country !== 'DE' ? countryName(seller.country, language) : '',
        seller.taxNumber ? `${language === 'de' ? 'St.-Nr.' : words.taxNumber}: ${seller.taxNumber}` : '',
        seller.vatId ? `${words.vatId}: ${seller.vatId}` : '',
      ],
    },
    {
      title: words.bank,
      lines: seller.bank.iban
        ? [
            seller.bank.name,
            seller.bank.holder && seller.bank.holder !== seller.name ? seller.bank.holder : '',
            `IBAN ${seller.bank.iban.replace(/\s+/gu, '').replace(/(.{4})/gu, '$1 ').trim()}`,
            seller.bank.bic ? `BIC ${seller.bank.bic}` : '',
          ]
        : [],
    },
    { title: words.contact, lines: [seller.website, seller.email, seller.phone] },
  ]

  pages.forEach((page, index) => {
    const previous = canvas.page

    canvas.page = page
    page.drawLine({
      start: { x: MARGIN.left, y: FOOTER_TOP },
      end: { x: PAGE.width - MARGIN.right, y: FOOTER_TOP },
      thickness: 0.6,
      color: RULE,
    })

    columns.forEach((column, position) => {
      const lines = column.lines.filter((line) => line.trim() !== '')

      if (lines.length === 0) return

      const x = MARGIN.left + position * columnWidth
      let y = FOOTER_TOP - 10

      y -= label(canvas, column.title, { x, y, width: columnWidth - 12, size: 6.3 }) + 2

      for (const line of lines) {
        y -= text(canvas, line, { x, y, width: columnWidth - 12, size: 7, color: MUTED, leading: 1.4 })
      }
    })

    text(canvas, words.page(index + 1, pages.length), { y: 34, size: 7, color: MUTED, align: 'right' })
    canvas.page = previous
  })
}

const banner = (canvas: Canvas, message: string) => {
  canvas.page.drawRectangle({
    x: MARGIN.left,
    y: canvas.y - 20,
    width: CONTENT_WIDTH,
    height: 20,
    color: rgb(0.99, 0.92, 0.92),
    borderColor: MARK,
    borderWidth: 0.8,
  })
  canvas.page.drawText(clean(canvas, message), {
    x: MARGIN.left + 8,
    y: canvas.y - 14,
    size: 9,
    font: canvas.bold,
    color: MARK,
  })
  canvas.y -= 30
}

/**
 * The site's mark (`BrandMark.tsx`): a Y whose lower stem is the blue caret.
 * Drawn from the same 48-unit strokes with round caps, not embedded as an
 * image, so it stays sharp at any zoom and prints in one pass. Two arms meet
 * at the fork with round caps, which gives the round join the site's SVG has.
 */
const brandMark = (canvas: Canvas, left: number, top: number, size: number) => {
  const scale = size / 48
  const point = (x: number, y: number) => ({ x: left + x * scale, y: top - y * scale })
  const stroke = (from: [number, number], to: [number, number], color: ReturnType<typeof rgb>) =>
    canvas.page.drawLine({
      start: point(...from),
      end: point(...to),
      thickness: 5 * scale,
      color,
      lineCap: LineCapStyle.Round,
    })

  stroke([10, 10], [24, 27], INK)
  stroke([38, 10], [24, 27], INK)
  stroke([24, 27], [24, 33], INK)
  stroke([24, 34], [24, 42], BRAND_BLUE)
}

/** The town from the last address line: `99084 Erfurt` → `Erfurt`. */
const townOf = (address: string): string =>
  (address.split('\n').filter((line) => line.trim() !== '').at(-1) ?? '').replace(/^\s*\d{4,5}\s+/u, '').trim()

/**
 * The EPC QR code ("GiroCode") a German banking app reads to prefill a SEPA
 * transfer: recipient, IBAN, amount and reference. Latin-1 (character set 2)
 * because that is what the QR library writes byte for byte.
 */
const girocode = (input: { name: string; iban: string; bic: string; amountMinor: number; reference: string }): string => {
  const latin1 = (value: string, max: number) =>
    [...value.replace(/\s+/gu, ' ').trim()]
      .map((character) => (character.codePointAt(0)! <= 0xff ? character : '?'))
      .join('')
      .slice(0, max)
  const amount = `${Math.floor(input.amountMinor / 100)}.${String(input.amountMinor % 100).padStart(2, '0')}`

  return [
    'BCD',
    '002',
    '2',
    'SCT',
    latin1(input.bic, 11),
    latin1(input.name, 70),
    input.iban.replace(/\s+/gu, '').toUpperCase(),
    `EUR${amount}`,
    '',
    '',
    latin1(input.reference, 140),
  ].join('\n')
}

const drawQr = (canvas: Canvas, payload: string, x: number, top: number, size: number) => {
  const qr = qrcode(0, 'M')

  qr.addData(payload, 'Byte')
  qr.make()

  const count = qr.getModuleCount()
  const cell = size / count

  // One rectangle per run of dark modules in a row keeps the page small.
  for (let row = 0; row < count; row += 1) {
    let column = 0

    while (column < count) {
      if (!qr.isDark(row, column)) {
        column += 1
        continue
      }

      const start = column

      while (column < count && qr.isDark(row, column)) column += 1

      canvas.page.drawRectangle({
        x: x + start * cell,
        y: top - (row + 1) * cell,
        width: (column - start) * cell,
        height: cell,
        color: INK,
      })
    }
  }
}

/* --------------------------------------------------------------- invoices */

export type RenderOptions = {
  language: DocumentLanguage
  /** `test` for test-mode documents, `draft` for a preview, `null` otherwise. */
  watermark: 'test' | 'draft' | null
}

export const renderInvoicePdf = async (
  document: InvoiceDocument,
  options: RenderOptions,
): Promise<Uint8Array> => {
  const language = options.language
  const words = WORDS[language]
  const mark = options.watermark === 'test' ? 'TEST' : options.watermark === 'draft' ? (language === 'de' ? 'ENTWURF' : 'DRAFT') : null
  const canvas = await createCanvas(language, mark)
  const money = (minor: number) => formatMoney(minor, document.currency, language)
  const date = (value: string) => formatDate(value, language)
  const isCancellation = document.kind === 'cancellation'
  const seller = document.seller

  canvas.pdf.setTitle(
    `${isCancellation ? words.cancellation : words.invoice} ${document.number ?? ''}`.trim(),
  )
  canvas.pdf.setCreator('Backend2 Invoices')
  canvas.pdf.setProducer('pdf-lib')
  canvas.pdf.setCreationDate(new Date(`${document.issueDate}T12:00:00Z`))
  canvas.pdf.setModificationDate(new Date(`${document.issueDate}T12:00:00Z`))

  // Letterhead: the mark, the name, a quiet line under it, and a blue rule.
  const top = canvas.y

  brandMark(canvas, MARGIN.left - 5, top + 3, 36)
  text(canvas, seller.name, { x: MARGIN.left + 36, y: top - 2, size: 17, bold: true, width: 300 })

  const town = townOf(seller.address)

  text(canvas, [words.tagline, town].filter(Boolean).join(' · '), {
    x: MARGIN.left + 36.5,
    y: top - 24,
    size: 7,
    color: BRAND_BLUE,
    tracking: 1.1,
    width: 300,
  })
  canvas.page.drawLine({
    start: { x: MARGIN.left, y: top - 42 },
    end: { x: PAGE.width - MARGIN.right, y: top - 42 },
    thickness: 0.9,
    color: BRAND_BLUE,
  })

  // Sender line and recipient on the left; the key facts on the right.
  const blockTop = top - 88
  const leftWidth = 250
  const sender = [seller.name, ...seller.address.split('\n')].filter((line) => line.trim() !== '').join(' · ')

  text(canvas, sender, { y: blockTop, size: 6.5, color: MUTED, width: leftWidth })
  canvas.page.drawLine({
    start: { x: MARGIN.left, y: blockTop - 12 },
    end: { x: MARGIN.left + leftWidth, y: blockTop - 12 },
    thickness: 0.5,
    color: RULE,
  })

  const recipient = document.recipient
  const recipientLines = [
    recipient.company,
    recipient.name,
    ...recipient.address.split('\n'),
    recipient.country && recipient.country !== seller.country ? countryName(recipient.country, language) : '',
  ].filter((line) => line.trim() !== '')
  let recipientY = blockTop - 20

  for (const [index, line] of recipientLines.entries()) {
    recipientY -= text(canvas, line, {
      y: recipientY,
      size: 10,
      bold: index === 0 && recipient.company.trim() !== '',
      width: leftWidth,
      leading: 1.5,
    })
  }

  if (recipient.vatId) {
    recipientY -= text(canvas, `${words.customerVat}: ${recipient.vatId}`, { y: recipientY, size: 8, color: MUTED, width: leftWidth })
  }

  const facts: Array<[string, string, boolean]> = [
    [isCancellation ? words.cancellationNumber : words.shortNumber, document.number ?? '—', false],
    [words.shortDate, date(document.issueDate), false],
  ]

  if (document.period) {
    facts.push([words.billingPeriod, `${date(document.period.start)} – ${date(document.period.end)}`, false])
  } else if (document.serviceDateFrom && document.serviceDateTo && document.serviceDateTo !== document.serviceDateFrom) {
    facts.push([words.servicePeriod, `${date(document.serviceDateFrom)} – ${date(document.serviceDateTo)}`, false])
  } else if (document.serviceDateFrom) {
    facts.push([words.serviceDate, date(document.serviceDateFrom), false])
  }

  if (!isCancellation && document.dueDate) facts.push([words.shortDue, date(document.dueDate), true])

  const factsX = MARGIN.left + 300
  const factsWidth = CONTENT_WIDTH - 300
  let factsY = blockTop - 20

  for (const [name, value, due] of facts) {
    text(canvas, name, { x: factsX, y: factsY, size: 8, color: MUTED, width: 90 })
    factsY -= text(canvas, value, {
      x: factsX + 90,
      y: factsY,
      width: factsWidth - 90,
      size: 8.5,
      bold: true,
      color: due ? BRAND_BLUE : INK,
      align: 'right',
      leading: 1.6,
    })
  }

  canvas.y = Math.min(recipientY, factsY) - 28

  // Title: the word in ink, the number in blue.
  const heading = isCancellation ? words.cancellation : words.invoice
  const headingSize = 25

  text(canvas, heading, { size: headingSize, bold: true })

  if (document.number) {
    text(canvas, document.number, {
      x: MARGIN.left + canvas.bold.widthOfTextAtSize(clean(canvas, `${heading} `), headingSize),
      size: headingSize,
      bold: true,
      color: BRAND_BLUE,
    })
  }

  canvas.y -= headingSize * 1.35 + 2

  if (options.watermark) {
    canvas.y -= text(canvas, options.watermark === 'test' ? words.test : words.draft, { size: 8.5, bold: true, color: MUTED })
  }

  const notices: string[] = []

  if (isCancellation && document.cancels) {
    notices.push(words.cancels(document.cancels.number, date(document.cancels.issueDate)))

    if (document.cancels.reason) notices.push(`${words.cancelReason}: ${document.cancels.reason}`)
  }

  if (document.replaces) notices.push(words.replaces(document.replaces.number))
  if (language !== document.language && document.number) notices.push(words.copyOf(document.number))

  for (const notice of notices) canvas.y -= text(canvas, notice, { size: 9 })

  if (!isCancellation) canvas.y -= text(canvas, words.intro, { size: 9, color: MUTED })

  canvas.y -= 20

  if (document.title) {
    canvas.y -= text(canvas, document.title, { size: 11, bold: true })
    canvas.y -= 8
  }

  // The lines table.
  const showVat = document.taxMode === 'standard' && !document.reverseCharge
  const amountWidth = 78
  const unitWidth = 74
  const vatWidth = showVat ? 40 : 0
  const qtyWidth = 46
  const columns = {
    item: { x: MARGIN.left, width: 22 },
    description: { x: MARGIN.left + 24, width: CONTENT_WIDTH - 24 - qtyWidth - unitWidth - vatWidth - amountWidth - 16 },
    qty: { x: PAGE.width - MARGIN.right - amountWidth - vatWidth - unitWidth - qtyWidth, width: qtyWidth },
    unit: { x: PAGE.width - MARGIN.right - amountWidth - vatWidth - unitWidth, width: unitWidth },
    vat: { x: PAGE.width - MARGIN.right - amountWidth - vatWidth, width: vatWidth },
    amount: { x: PAGE.width - MARGIN.right - amountWidth, width: amountWidth },
  }

  const header = (target: Canvas) => {
    const y = target.y

    label(target, language === 'de' ? 'Pos' : 'No', { ...columns.item, y })
    label(target, words.description, { ...columns.description, y })
    label(target, words.qty, { ...columns.qty, y, align: 'right' })
    label(target, words.unitPrice, { ...columns.unit, y, align: 'right' })
    if (showVat) label(target, words.vat, { ...columns.vat, y, align: 'right' })
    label(target, words.amount, { ...columns.amount, y, align: 'right' })
    target.y -= 14
    target.page.drawLine({
      start: { x: MARGIN.left, y: target.y },
      end: { x: PAGE.width - MARGIN.right, y: target.y },
      thickness: 1,
      color: INK,
    })
    target.y -= 12
  }

  header(canvas)
  canvas.onNewPage = header

  for (const line of document.lines) {
    const descriptionText = [line.description, line.unit ? `(${line.unit})` : ''].filter(Boolean).join(' ')
    const height = wrap(canvas.regular, clean(canvas, descriptionText), 10, columns.description.width).length * 10 * 1.35

    ensureSpace(canvas, height + 20)

    const y = canvas.y

    text(canvas, String(line.position), { ...columns.item, size: 8.5, color: MUTED, y: y - 1 })
    text(canvas, descriptionText, { ...columns.description, size: 10, y })
    text(canvas, formatQuantity(line.quantityMilli, language), { ...columns.qty, size: 10, align: 'right', y })
    text(canvas, money(line.unitPriceMinor), { ...columns.unit, size: 10, align: 'right', y })
    if (showVat) text(canvas, formatRate(line.taxRateBp, language), { ...columns.vat, size: 10, align: 'right', y })
    text(canvas, money(line.netMinor), { ...columns.amount, size: 10, bold: true, align: 'right', y })
    canvas.y -= height + 8
    rule(canvas)
    canvas.y -= 12
  }

  canvas.onNewPage = undefined

  // Totals, right-aligned under the amounts.
  const totals: Array<[string, string]> = []

  if (document.totals.discountMinor !== 0) {
    totals.push([words.subtotal, money(document.totals.subtotalMinor)])

    const discountLabel =
      document.discount.type === 'percent'
        ? `${words.discount} ${formatRate(document.discount.value, language)}`
        : words.discount

    totals.push([discountLabel, money(-document.totals.discountMinor)])
  }

  if (showVat) {
    totals.push([words.net, money(document.totals.netMinor)])

    for (const group of document.totals.taxGroups) {
      totals.push([words.vatAt(formatRate(group.rateBp, language)), money(group.taxMinor)])
    }
  }

  const totalsX = MARGIN.left + CONTENT_WIDTH * 0.52
  const totalsWidth = PAGE.width - MARGIN.right - totalsX

  ensureSpace(canvas, totals.length * 15 + 40)

  for (const [name, value] of totals) {
    const y = canvas.y

    text(canvas, name, { x: totalsX, y, size: 9.5, color: MUTED, width: totalsWidth - 90 })
    canvas.y -= text(canvas, value, { x: totalsX, y, size: 9.5, width: totalsWidth, align: 'right', leading: 1.55 })
  }

  if (totals.length > 0) canvas.y -= 4

  canvas.page.drawLine({
    start: { x: totalsX, y: canvas.y },
    end: { x: PAGE.width - MARGIN.right, y: canvas.y },
    thickness: 1,
    color: INK,
  })
  canvas.y -= 8

  {
    const y = canvas.y

    text(canvas, words.total, { x: totalsX, y, size: 13, bold: true, width: totalsWidth - 100 })
    canvas.y -= text(canvas, money(document.totals.totalMinor), {
      x: totalsX,
      y,
      size: 13,
      bold: true,
      color: BRAND_BLUE,
      width: totalsWidth,
      align: 'right',
    })
  }

  canvas.y -= 22

  // Tax note.
  const taxNote =
    document.taxMode === 'kleinunternehmer' ? words.kleinunternehmer : document.reverseCharge ? words.reverseCharge : ''

  if (taxNote) {
    ensureSpace(canvas, 20)
    canvas.y -= text(canvas, taxNote, { size: 8.5, color: MUTED })
    canvas.y -= 12
  }

  // Installments.
  if (!isCancellation && document.installments.length > 0) {
    ensureSpace(canvas, 30 + document.installments.length * 14)
    label(canvas, words.schedule, { x: MARGIN.left, y: canvas.y })
    canvas.y -= 14

    for (const part of document.installments) {
      const y = canvas.y

      text(canvas, `${part.position}. ${date(part.dueDate)}${part.label ? ` — ${part.label}` : ''}`, { size: 9, width: 330, y })
      canvas.y -= text(canvas, money(part.amountMinor), { x: totalsX, width: totalsWidth, size: 9, align: 'right', y, leading: 1.5 })
    }

    canvas.y -= 10
  }

  // How to pay, with a GiroCode beside it when a bank transfer in euros is the way.
  if (!isCancellation) {
    const bank = document.payment.allowBank && seller.bank.iban.trim() !== ''
    const qr =
      bank && document.currency === 'EUR' && document.installments.length === 0 && document.totals.totalMinor > 0
        ? girocode({
            name: seller.bank.holder || seller.name,
            iban: seller.bank.iban,
            bic: seller.bank.bic,
            amountMinor: document.totals.totalMinor,
            reference: document.number ?? '',
          })
        : null
    const qrSize = 76
    const textWidth = qr ? CONTENT_WIDTH - qrSize - 28 : CONTENT_WIDTH
    const sentences: string[] = []

    if (document.installments.length === 0 && document.dueDate) {
      if (document.dueDate === document.issueDate) sentences.push(words.payNow)
      if (bank && document.number) {
        sentences.push(words.payToAccount(date(document.dueDate), document.number))
      } else if (document.dueDate !== document.issueDate) {
        sentences.push(words.payBy(date(document.dueDate)))
      }
    } else if (bank && document.number) {
      sentences.push(`${words.reference}: ${document.number}`)
    }

    if (document.payment.allowStripe) sentences.push(words.card)

    ensureSpace(canvas, qr ? qrSize + 20 : 16 * sentences.length)

    const blockTop = canvas.y
    let y = blockTop

    for (const sentence of sentences) y -= text(canvas, sentence, { y, size: 9, color: MUTED, width: textWidth, leading: 1.45 }) + 4

    if (qr) {
      drawQr(canvas, qr, PAGE.width - MARGIN.right - qrSize, blockTop, qrSize)
      text(canvas, words.scan, { y: blockTop - qrSize - 5, size: 6.5, color: MUTED, align: 'right' })
      y = Math.min(y, blockTop - qrSize - 16)
    }

    canvas.y = y
  }

  if (document.notes) {
    ensureSpace(canvas, 30)
    canvas.y -= 10
    canvas.y -= text(canvas, document.notes, { size: 9, color: MUTED })
  }

  footer(canvas, seller)

  return canvas.pdf.save()
}

/* --------------------------------------------------------------- receipts */

export const renderReceiptPdf = async (input: {
  document: InvoiceDocument
  payment: { amountMinor: number; paidOn: string; reference: string }
  language: DocumentLanguage
  test: boolean
}): Promise<Uint8Array> => {
  const { document, language } = input
  const words = WORDS[language]
  const canvas = await createCanvas(language, input.test ? 'TEST' : null)
  const money = (minor: number) => formatMoney(minor, document.currency, language)

  canvas.pdf.setTitle(`${words.receipt} ${document.number ?? ''}`.trim())
  canvas.pdf.setCreator('Backend2 Invoices')
  canvas.pdf.setCreationDate(new Date(`${input.payment.paidOn}T12:00:00Z`))

  if (input.test) banner(canvas, words.testReceipt)

  canvas.y -= text(canvas, document.seller.name, { size: 11, bold: true })
  canvas.y -= text(canvas, document.seller.address, { size: 9, color: MUTED })
  canvas.y -= 24
  canvas.y -= text(canvas, words.receipt, { size: 20, bold: true })
  canvas.y -= 10

  const recipient = [document.recipient.company, document.recipient.name].filter(Boolean).join(', ')
  const rows: Array<[string, string]> = [
    [words.amount, money(input.payment.amountMinor)],
    [words.receivedFrom, recipient],
    [words.forInvoice, document.number ?? '—'],
    [words.method, words.cash],
    [words.paidOn, formatDate(input.payment.paidOn, language)],
  ]

  if (input.payment.reference) rows.push([words.reference, input.payment.reference])

  for (const [label, value] of rows) {
    text(canvas, label, { size: 10, color: MUTED, width: 140 })
    canvas.y -= text(canvas, value, { size: 10, x: MARGIN.left + 145, width: 300, bold: label === words.amount })
  }

  canvas.y -= 10

  if (document.taxMode === 'kleinunternehmer') canvas.y -= text(canvas, words.kleinunternehmer, { size: 9 })

  canvas.y -= 30
  canvas.y -= text(canvas, words.receiptText, { size: 9 })
  canvas.y -= 40
  canvas.page.drawLine({
    start: { x: MARGIN.left, y: canvas.y },
    end: { x: MARGIN.left + 220, y: canvas.y },
    thickness: 0.6,
    color: INK,
  })
  canvas.y -= 4
  text(canvas, `${words.signature}, ${document.seller.name}`, { size: 8.5, color: MUTED })

  footer(canvas, document.seller)

  return canvas.pdf.save()
}
