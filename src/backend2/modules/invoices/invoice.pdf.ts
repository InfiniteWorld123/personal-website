import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, type PDFFont, type PDFPage, degrees, rgb } from 'pdf-lib'
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
const MARGIN = { left: 50, right: 50, top: 50, bottom: 70 }
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right

const INK = rgb(0.1, 0.1, 0.12)
const MUTED = rgb(0.42, 0.42, 0.46)
const RULE = rgb(0.82, 0.82, 0.85)
const MARK = rgb(0.85, 0.15, 0.15)

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

  page.drawText(canvas.watermark, {
    x: 120,
    y: 250,
    size: 110,
    font: canvas.bold,
    color: MARK,
    opacity: 0.1,
    rotate: degrees(40),
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
  options: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; width?: number; align?: 'left' | 'right'; y?: number },
): number => {
  const size = options.size ?? 9.5
  const font = options.bold ? canvas.bold : canvas.regular
  const width = options.width ?? CONTENT_WIDTH
  const x = options.x ?? MARGIN.left
  const lines = wrap(font, clean(canvas, value), size, width)
  let y = options.y ?? canvas.y

  for (const line of lines) {
    const lineWidth = font.widthOfTextAtSize(line, size)

    canvas.page.drawText(line, {
      x: options.align === 'right' ? x + width - lineWidth : x,
      y: y - size,
      size,
      font,
      color: options.color ?? INK,
    })
    y -= size * 1.35
  }

  return lines.length * size * 1.35
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

const footer = (canvas: Canvas, seller: InvoiceDocument['seller']) => {
  const pages = canvas.pdf.getPages()
  const { words } = canvas
  const parts = [
    seller.name,
    seller.email,
    seller.taxNumber ? `${words.taxNumber}: ${seller.taxNumber}` : '',
    seller.vatId ? `${words.vatId}: ${seller.vatId}` : '',
  ].filter((part) => part.trim() !== '')

  pages.forEach((page, index) => {
    const line = clean(canvas, parts.join('  ·  '))

    page.drawLine({
      start: { x: MARGIN.left, y: 52 },
      end: { x: PAGE.width - MARGIN.right, y: 52 },
      thickness: 0.6,
      color: RULE,
    })
    page.drawText(line, { x: MARGIN.left, y: 38, size: 7.5, font: canvas.regular, color: MUTED })

    const label = words.page(index + 1, pages.length)
    const width = canvas.regular.widthOfTextAtSize(label, 7.5)

    page.drawText(label, { x: PAGE.width - MARGIN.right - width, y: 26, size: 7.5, font: canvas.regular, color: MUTED })
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

  canvas.pdf.setTitle(
    `${isCancellation ? words.cancellation : words.invoice} ${document.number ?? ''}`.trim(),
  )
  canvas.pdf.setCreator('Backend2 Invoices')
  canvas.pdf.setProducer('pdf-lib')
  canvas.pdf.setCreationDate(new Date(`${document.issueDate}T12:00:00Z`))
  canvas.pdf.setModificationDate(new Date(`${document.issueDate}T12:00:00Z`))

  if (options.watermark === 'test') banner(canvas, words.test)
  if (options.watermark === 'draft') banner(canvas, words.draft)

  // Seller, top right; a one-line sender above the recipient block.
  const top = canvas.y
  const sellerLines = [
    document.seller.name,
    ...document.seller.address.split('\n'),
    document.seller.country && document.seller.country !== 'DE' ? countryName(document.seller.country, language) : '',
    document.seller.email,
    document.seller.phone,
    document.seller.website,
  ].filter((line) => line.trim() !== '')

  let sellerY = top

  for (const [index, line] of sellerLines.entries()) {
    sellerY -= text(canvas, line, {
      x: PAGE.width - MARGIN.right - 200,
      width: 200,
      align: 'right',
      size: index === 0 ? 10.5 : 8.5,
      bold: index === 0,
      color: index === 0 ? INK : MUTED,
      y: sellerY,
    })
  }

  const recipient = document.recipient
  const recipientLines = [
    recipient.company,
    recipient.name,
    ...recipient.address.split('\n'),
    recipient.country && recipient.country !== document.seller.country
      ? countryName(recipient.country, language)
      : '',
  ].filter((line) => line.trim() !== '')

  let recipientY = top - 46

  text(canvas, [document.seller.name, document.seller.address.split('\n').join(', ')].filter(Boolean).join(' · '), {
    size: 7,
    color: MUTED,
    width: 280,
    y: top - 30,
  })

  for (const line of recipientLines) {
    recipientY -= text(canvas, line, { size: 10, width: 280, y: recipientY })
  }

  if (recipient.vatId) {
    recipientY -= text(canvas, `${words.customerVat}: ${recipient.vatId}`, { size: 8.5, color: MUTED, width: 280, y: recipientY })
  }

  canvas.y = Math.min(sellerY, recipientY) - 26

  // Title and facts.
  canvas.y -= text(canvas, isCancellation ? words.cancellation : words.invoice, { size: 20, bold: true })
  canvas.y -= 4

  const facts: Array<[string, string]> = [
    [isCancellation ? words.cancellationNumber : words.number, document.number ?? '—'],
    [words.date, date(document.issueDate)],
  ]

  if (document.period) {
    facts.push([words.billingPeriod, `${date(document.period.start)} – ${date(document.period.end)}`])
  } else if (document.serviceDateFrom && document.serviceDateTo && document.serviceDateTo !== document.serviceDateFrom) {
    facts.push([words.servicePeriod, `${date(document.serviceDateFrom)} – ${date(document.serviceDateTo)}`])
  } else if (document.serviceDateFrom) {
    facts.push([words.serviceDate, date(document.serviceDateFrom)])
  }

  if (!isCancellation && document.dueDate) facts.push([words.due, date(document.dueDate)])

  for (const [label, value] of facts) {
    text(canvas, label, { size: 9, color: MUTED, width: 140 })
    canvas.y -= text(canvas, value, { size: 9, x: MARGIN.left + 145, width: 250 })
  }

  canvas.y -= 6

  if (document.title) {
    canvas.y -= text(canvas, document.title, { size: 11, bold: true })
    canvas.y -= 2
  }

  const baseline = document.language
  const notices: string[] = []

  if (isCancellation && document.cancels) {
    notices.push(words.cancels(document.cancels.number, date(document.cancels.issueDate)))

    if (document.cancels.reason) notices.push(`${words.cancelReason}: ${document.cancels.reason}`)
  }

  if (document.replaces) notices.push(words.replaces(document.replaces.number))
  if (language !== baseline && document.number) notices.push(words.copyOf(document.number))

  for (const notice of notices) canvas.y -= text(canvas, notice, { size: 9 })

  canvas.y -= 10

  // The lines table.
  const showVat = document.taxMode === 'standard' && !document.reverseCharge
  const columns = {
    item: { x: MARGIN.left, width: 26 },
    description: { x: MARGIN.left + 28, width: showVat ? 214 : 250 },
    qty: { x: MARGIN.left + (showVat ? 246 : 282), width: 60 },
    unit: { x: MARGIN.left + (showVat ? 310 : 346), width: 70 },
    vat: { x: MARGIN.left + 384, width: 40 },
    amount: { x: MARGIN.left + 425, width: CONTENT_WIDTH - 425 },
  }

  const header = (target: Canvas) => {
    const y = target.y

    text(target, words.item, { ...columns.item, size: 8.5, bold: true, color: MUTED, y })
    text(target, words.description, { ...columns.description, size: 8.5, bold: true, color: MUTED, y })
    text(target, words.qty, { ...columns.qty, size: 8.5, bold: true, color: MUTED, align: 'right', y })
    text(target, words.unitPrice, { ...columns.unit, size: 8.5, bold: true, color: MUTED, align: 'right', y })
    if (showVat) text(target, words.vat, { ...columns.vat, size: 8.5, bold: true, color: MUTED, align: 'right', y })
    text(target, words.amount, { ...columns.amount, size: 8.5, bold: true, color: MUTED, align: 'right', y })
    target.y -= 14
    rule(target)
    target.y -= 6
  }

  header(canvas)
  canvas.onNewPage = header

  for (const line of document.lines) {
    const descriptionText = [line.description, line.unit ? `(${line.unit})` : ''].filter(Boolean).join(' ')
    const height = wrap(canvas.regular, clean(canvas, descriptionText), 9, columns.description.width).length * 9 * 1.35

    ensureSpace(canvas, height + 6)

    const y = canvas.y

    text(canvas, String(line.position), { ...columns.item, size: 9, y })
    text(canvas, descriptionText, { ...columns.description, size: 9, y })
    text(canvas, formatQuantity(line.quantityMilli, language), { ...columns.qty, size: 9, align: 'right', y })
    text(canvas, money(line.unitPriceMinor), { ...columns.unit, size: 9, align: 'right', y })
    if (showVat) text(canvas, formatRate(line.taxRateBp, language), { ...columns.vat, size: 9, align: 'right', y })
    text(canvas, money(line.netMinor), { ...columns.amount, size: 9, align: 'right', y })
    canvas.y -= height + 5
  }

  canvas.onNewPage = undefined
  rule(canvas)
  canvas.y -= 8

  // Totals.
  const totals: Array<[string, string, boolean]> = []

  if (document.totals.discountMinor !== 0) {
    totals.push([words.subtotal, money(document.totals.subtotalMinor), false])

    const label =
      document.discount.type === 'percent'
        ? `${words.discount} ${formatRate(document.discount.value, language)}`
        : words.discount

    totals.push([label, money(-document.totals.discountMinor), false])
  }

  if (showVat) {
    totals.push([words.net, money(document.totals.netMinor), false])

    for (const group of document.totals.taxGroups) {
      totals.push([words.vatAt(formatRate(group.rateBp, language)), money(group.taxMinor), false])
    }
  }

  totals.push([words.total, money(document.totals.totalMinor), true])
  ensureSpace(canvas, totals.length * 15 + 10)

  for (const [label, value, strong] of totals) {
    const y = canvas.y

    text(canvas, label, { x: MARGIN.left + 260, width: 150, size: strong ? 11 : 9, bold: strong, y })
    canvas.y -= text(canvas, value, {
      ...columns.amount,
      x: MARGIN.left + 380,
      width: CONTENT_WIDTH - 380,
      size: strong ? 11 : 9,
      bold: strong,
      align: 'right',
      y,
    })
  }

  canvas.y -= 10

  // Tax note.
  const taxNote =
    document.taxMode === 'kleinunternehmer' ? words.kleinunternehmer : document.reverseCharge ? words.reverseCharge : ''

  if (taxNote) {
    ensureSpace(canvas, 20)
    canvas.y -= text(canvas, taxNote, { size: 9 })
    canvas.y -= 6
  }

  // Installments.
  if (!isCancellation && document.installments.length > 0) {
    ensureSpace(canvas, 30 + document.installments.length * 13)
    canvas.y -= text(canvas, words.schedule, { size: 10, bold: true })

    for (const part of document.installments) {
      const y = canvas.y

      text(canvas, `${part.position}. ${date(part.dueDate)}${part.label ? ` — ${part.label}` : ''}`, { size: 9, width: 330, y })
      canvas.y -= text(canvas, money(part.amountMinor), { x: MARGIN.left + 380, width: CONTENT_WIDTH - 380, size: 9, align: 'right', y })
    }

    canvas.y -= 6
  }

  // How to pay.
  if (!isCancellation) {
    if (document.installments.length === 0 && document.dueDate) {
      ensureSpace(canvas, 16)
      canvas.y -= text(canvas, document.dueDate === document.issueDate ? words.payNow : words.payBy(date(document.dueDate)), { size: 9 })
    }

    if (document.payment.allowBank && document.seller.bank.iban) {
      ensureSpace(canvas, 70)
      canvas.y -= 6
      canvas.y -= text(canvas, words.bank, { size: 10, bold: true })

      const bankLines = [
        document.seller.bank.holder ? `${words.holder}: ${document.seller.bank.holder}` : '',
        `IBAN: ${document.seller.bank.iban.replace(/(.{4})/gu, '$1 ').trim()}`,
        document.seller.bank.bic ? `BIC: ${document.seller.bank.bic}` : '',
        document.seller.bank.name,
        document.number ? `${words.reference}: ${document.number}` : '',
      ].filter((line) => line.trim() !== '')

      for (const line of bankLines) canvas.y -= text(canvas, line, { size: 9 })
    }

    if (document.payment.allowStripe) {
      ensureSpace(canvas, 16)
      canvas.y -= 4
      canvas.y -= text(canvas, words.card, { size: 9 })
    }
  }

  if (document.notes) {
    ensureSpace(canvas, 30)
    canvas.y -= 10
    canvas.y -= text(canvas, document.notes, { size: 9, color: MUTED })
  }

  footer(canvas, document.seller)

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
