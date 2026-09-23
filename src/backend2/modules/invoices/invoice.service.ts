import {
  type CreateInvoiceInput,
  type DocumentLanguage,
  type InvoiceListQuery,
  type InvoicePatch,
  type InvoiceSettings,
  type LineInput,
  type OwnerInvoice,
  type OwnerInvoiceListItem,
  type RequestableLanguage,
  type SettingsPut,
  addDays,
  yearOf,
} from '../../contracts/invoice.contract'
import type { Page } from '../../contracts/pagination.contract'
import { withTransaction } from '../../db/client'
import {
  badRequest,
  clientInTrash,
  conflict,
  invoiceLocked,
  invoiceNotReady,
  notFound,
  sellerNotReady,
} from '../../http/error'
import * as clientRepo from '../clients/client.repo'
import { createClient } from '../clients/client.service'
import { getService } from '../services/service.service'
import { today } from './invoice.clock'
import { assertModeAllowed, liveInvoicingEnabled } from './invoice.config'
import {
  buildDocument,
  formatNumber,
  issueProblems,
  sellerMissing,
  totalsFor,
} from './invoice.document'
import { documentLanguage, ensureDocument } from './invoice.files'
import { findRate } from './invoice.fx'
import { toListItem, toOwnerInvoice, toSettings } from './invoice.mapper'
import { renderInvoicePdf } from './invoice.pdf'
import * as repo from './invoice.repo'

/**
 * Drafts, the issue step, and reading. See `docs/v2/invoices.md`.
 *
 * A draft may be incomplete and changes freely. Issuing is the one door into
 * an official document: it validates everything, takes the next number under
 * a lock, freezes the whole document as a snapshot, and from then on the row
 * only ever gains payments, refunds, files and — at most once — a
 * cancellation. Nothing is sent by being issued.
 */

const missing = () => notFound('That invoice does not exist')

/* ----------------------------------------------------------------- settings */

export const readinessOf = (settings: repo.SettingsRow): InvoiceSettings['readiness'] => {
  const missingFields = sellerMissing(settings)

  return { liveReady: missingFields.length === 0, missing: missingFields, liveEnabled: liveInvoicingEnabled() }
}

export const getSettings = async (): Promise<InvoiceSettings> => {
  const row = await repo.readSettings()

  return toSettings(row, readinessOf(row))
}

export const putSettings = async (input: SettingsPut): Promise<InvoiceSettings> => {
  await withTransaction(async () => {
    const row = await repo.lockSettings()

    if (row.revision !== input.revision) {
      throw conflict('The settings were changed somewhere else. Reload to see the newer version.')
    }

    await repo.writeSettings({
      seller_name: input.sellerName,
      seller_address: input.sellerAddress,
      seller_country_code: input.sellerCountry,
      seller_email: input.sellerEmail,
      seller_phone: input.sellerPhone,
      seller_website: input.sellerWebsite,
      tax_number: input.taxNumber,
      vat_id: input.vatId,
      bank_holder: input.bankHolder,
      bank_iban: input.bankIban,
      bank_bic: input.bankBic,
      bank_name: input.bankName,
      tax_mode: input.taxMode,
      default_tax_rate_bp: input.defaultTaxRateBp,
      payment_terms_days: input.paymentTermsDays,
      default_language: input.defaultLanguage,
      test_recipient_email: input.testRecipientEmail,
    })
  })

  return getSettings()
}

/* ------------------------------------------------------------------ helpers */

/**
 * A Service's name and price, copied once when a line (or subscription)
 * starts from it. The live published price when there is one, else the
 * draft's; the name in the document's language when written, else German,
 * else English. Services stays independent: nothing here ever reads it again.
 */
export const serviceSnapshot = async (
  serviceId: string,
  language: DocumentLanguage,
): Promise<{ id: string; name: string; priceMinor: number | null }> => {
  let service: Awaited<ReturnType<typeof getService>>

  try {
    service = await getService(serviceId)
  } catch {
    throw badRequest('That service does not exist')
  }

  const version = service.published ?? service.draft
  const name =
    version.texts[language]?.name?.trim() ||
    version.texts.de?.name?.trim() ||
    version.texts.en?.name?.trim() ||
    ''

  return { id: service.id, name, priceMinor: version.price.amountCents }
}

const resolveLines = async (
  lines: LineInput[],
  existing: repo.LineRow[],
  language: DocumentLanguage,
): Promise<Parameters<typeof repo.replaceLines>[1]> => {
  const known = new Map(
    existing
      .filter((line) => line.service_id)
      .map((line) => [
        line.service_id!,
        {
          name: line.service_name,
          priceMinor: line.service_price_minor === null ? null : Number(line.service_price_minor),
        },
      ]),
  )
  const resolved: Parameters<typeof repo.replaceLines>[1] = []

  for (const line of lines) {
    let serviceName: string | null = null
    let servicePriceMinor: number | null = null

    if (line.serviceId) {
      // The snapshot is taken once and kept on later saves of the same line.
      const kept = known.get(line.serviceId)
      const snapshot = kept ?? (await serviceSnapshot(line.serviceId, language))

      known.set(line.serviceId, { name: snapshot.name, priceMinor: snapshot.priceMinor })
      serviceName = snapshot.name
      servicePriceMinor = snapshot.priceMinor
    }

    resolved.push({
      description: line.description,
      unit: line.unit,
      quantityMilli: line.quantityMilli,
      unitPriceMinor: line.unitPriceMinor,
      taxRateBp: line.taxRateBp,
      serviceId: line.serviceId,
      serviceName,
      servicePriceMinor,
    })
  }

  return resolved
}

const fxColumn = async (fx: { rateId: string } | null | undefined) => {
  if (fx === undefined) return undefined
  if (fx === null) return null

  const rate = await findRate(fx.rateId)

  if (!rate) throw badRequest('That exchange rate is not on file')

  return { rateId: rate.id, rate: rate.rate, rateDate: rate.rateDate, source: rate.source }
}

const assertClient = async (clientId: string): Promise<clientRepo.ClientRow> => {
  const client = await clientRepo.findClient(clientId)

  if (!client) throw notFound('That client does not exist')
  if (client.trashed_at) throw clientInTrash('That client is in Trash. Restore it first.')

  return client
}

/** Recomputes a draft's cached totals from its lines. */
const refreshTotals = async (invoiceId: string): Promise<void> => {
  const row = await repo.findInvoice(invoiceId)

  if (!row || row.status !== 'draft') return

  const settings = await repo.readSettings()
  const totals = totalsFor(row, await repo.linesOf(invoiceId), settings)

  await repo.writeTotals(invoiceId, {
    subtotal: totals.subtotalMinor,
    discount: totals.discountMinor,
    net: totals.netMinor,
    tax: totals.taxMinor,
    total: totals.totalMinor,
  })
}

/* ------------------------------------------------------------------ reading */

export const getInvoice = async (id: string): Promise<OwnerInvoice> => {
  const row = await repo.findInvoice(id)

  if (!row) throw missing()

  const lines = await repo.linesOf(id)
  const installments = await repo.installmentsOf(id)
  const payments = await repo.paymentsOf(id)
  const refunds = await repo.refundsOf(id)
  const files = await repo.filesOf(id)
  const day = today()
  let problems: string[] = []
  let draftTotals = null

  if (row.status === 'draft') {
    const settings = await repo.readSettings()
    const client = await clientRepo.findClient(row.client_id)

    problems = issueProblems({
      row,
      lines,
      installments,
      settings,
      issueDate: day,
      clientUsable: Boolean(client && !client.trashed_at),
    })

    if (row.mode === 'live') {
      if (!liveInvoicingEnabled()) problems.push('Real invoicing is switched off here')

      const sellerGaps = sellerMissing(settings)

      if (sellerGaps.length > 0) problems.push('Complete your seller details in Invoice settings')
    }

    draftTotals = totalsFor(row, lines, settings)
  }

  const cancellation = row.kind === 'invoice' ? await repo.findCancellationOf(row.id) : null
  const replacement = await repo.findReplacementOf(row.id)

  return toOwnerInvoice({
    row,
    lines,
    installments,
    payments,
    refunds,
    files,
    today: day,
    issueProblems: problems,
    draftTotals,
    links: {
      cancels: await repo.numberOf(row.cancels_invoice_id),
      cancelledBy: cancellation ? { id: cancellation.id, number: cancellation.number } : null,
      replaces: await repo.numberOf(row.replaces_invoice_id),
      replacedBy: replacement ? { id: replacement.id, number: replacement.number } : null,
    },
  })
}

export const listInvoices = async (query: InvoiceListQuery): Promise<Page<OwnerInvoiceListItem>> => {
  const day = today()
  const first = await repo.listInvoices(query, day)
  const pageCount = Math.max(1, Math.ceil(first.total / query.pageSize))
  const page = Math.min(query.page, pageCount)
  const result = page === query.page ? first : await repo.listInvoices({ ...query, page }, day)

  return {
    items: result.rows.map((row) => toListItem(row, row.payment_state as OwnerInvoiceListItem['paymentState'])),
    page,
    pageSize: query.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
  }
}

/* ----------------------------------------------------------------- creating */

const recipientFromClient = async (client: clientRepo.ClientRow) => {
  const previous = await repo.lastRecipientFor(client.id)

  if (previous) {
    return {
      recipient_name: previous.recipient_name,
      recipient_company: previous.recipient_company,
      recipient_address: previous.recipient_address,
      recipient_country_code: previous.recipient_country_code,
      recipient_email: previous.recipient_email,
      recipient_vat_id: previous.recipient_vat_id,
    }
  }

  return {
    recipient_name: client.name,
    recipient_company: client.company_name,
    recipient_address: '',
    recipient_country_code: client.country_code,
    recipient_email: client.email,
    recipient_vat_id: '',
  }
}

export const createInvoice = async (input: CreateInvoiceInput): Promise<OwnerInvoice> => {
  const id = await withTransaction(async () => {
    const settings = await repo.readSettings()
    let clientId = input.clientId ?? null

    if (input.newClient) {
      // Through the Clients module, with its own validation and duplicate
      // warning; the invoice is created in the same transaction or not at all.
      const created = await createClient({
        kind: input.newClient.kind,
        name: input.newClient.name,
        email: input.newClient.email,
        phone: input.newClient.phone,
        country: input.newClient.country,
        companyName: input.newClient.companyName,
        nicheId: null,
        notes: '',
        allowDuplicate: input.newClient.allowDuplicate,
      })

      clientId = created.id
    }

    if (input.discountType === 'percent' && (input.discountValue ?? 0) > 10_000) {
      throw badRequest('A percentage discount cannot exceed 100 %')
    }

    const client = await assertClient(clientId!)
    const language = input.language ?? settings.default_language
    const prefilled = await recipientFromClient(client)
    const recipient = input.recipient
      ? {
          recipient_name: input.recipient.name,
          recipient_company: input.recipient.company,
          recipient_address: input.recipient.address,
          recipient_country_code: input.recipient.country,
          recipient_email: input.recipient.email,
          recipient_vat_id: input.recipient.vatId,
        }
      : prefilled

    const invoiceId = await repo.insertInvoice({
      mode: input.mode,
      client_id: client.id,
      currency: input.currency ?? 'EUR',
      language,
      title: input.title ?? '',
      ...recipient,
      service_date_from: input.serviceDateFrom ?? null,
      service_date_to: input.serviceDateTo ?? null,
      payment_terms_days: input.paymentTermsDays ?? settings.payment_terms_days,
      discount_type: input.discountType ?? 'none',
      discount_value: input.discountType === 'none' ? 0 : (input.discountValue ?? 0),
      tax_mode: settings.tax_mode,
      reverse_charge: input.reverseCharge ?? false,
      allow_bank: input.allowBank ?? true,
      allow_stripe: input.allowStripe ?? false,
      notes: input.notes ?? '',
      internal_note: input.internalNote ?? '',
      fx: (await fxColumn(input.fx)) ?? null,
    })

    if (input.lines) await repo.replaceLines(invoiceId, await resolveLines(input.lines, [], language))
    if (input.installments) await repo.replaceInstallments(invoiceId, input.installments)

    await refreshTotals(invoiceId)
    await repo.recordEvent({ invoiceId, kind: 'created', detail: { mode: input.mode } })

    return invoiceId
  })

  return getInvoice(id)
}

/**
 * A draft built by another part of this module — the subscription job, a
 * correction. Runs inside the caller's transaction.
 */
export const createDraftFrom = async (input: {
  mode: repo.InvoiceRow['mode']
  columns: repo.DraftColumns
  lines: Parameters<typeof repo.replaceLines>[1]
  installments?: Array<{ dueDate: string; amountMinor: number; label: string }>
  subscriptionId?: string | null
  periodStart?: string | null
  periodEnd?: string | null
  replacesInvoiceId?: string | null
}): Promise<string> => {
  const invoiceId = await repo.insertInvoice({
    mode: input.mode,
    ...input.columns,
    subscription_id: input.subscriptionId ?? null,
    period_start: input.periodStart ?? null,
    period_end: input.periodEnd ?? null,
    replaces_invoice_id: input.replacesInvoiceId ?? null,
  })

  await repo.replaceLines(invoiceId, input.lines)
  if (input.installments) await repo.replaceInstallments(invoiceId, input.installments)
  await refreshTotals(invoiceId)

  return invoiceId
}

/* ------------------------------------------------------------------ editing */

export const patchInvoice = async (input: {
  id: string
  revision: number
  patch: Omit<InvoicePatch, 'revision'>
}): Promise<OwnerInvoice> => {
  await withTransaction(async () => {
    const row = await repo.lockInvoice(input.id)

    if (!row) throw missing()
    if (row.status !== 'draft') throw invoiceLocked()
    if (row.revision !== input.revision) {
      throw conflict('This draft was changed somewhere else. Reload to see the newer version.')
    }

    const settings = await repo.readSettings()
    const { patch } = input
    const fields: Partial<repo.DraftColumns> = { tax_mode: settings.tax_mode }

    if (patch.clientId !== undefined && patch.clientId !== row.client_id) {
      fields.client_id = (await assertClient(patch.clientId)).id
    }

    if (patch.currency !== undefined) fields.currency = patch.currency
    if (patch.language !== undefined) fields.language = patch.language
    if (patch.title !== undefined) fields.title = patch.title
    if (patch.recipient !== undefined) {
      fields.recipient_name = patch.recipient.name
      fields.recipient_company = patch.recipient.company
      fields.recipient_address = patch.recipient.address
      fields.recipient_country_code = patch.recipient.country
      fields.recipient_email = patch.recipient.email
      fields.recipient_vat_id = patch.recipient.vatId
    }
    if (patch.serviceDateFrom !== undefined) fields.service_date_from = patch.serviceDateFrom
    if (patch.serviceDateTo !== undefined) fields.service_date_to = patch.serviceDateTo
    if (patch.paymentTermsDays !== undefined) fields.payment_terms_days = patch.paymentTermsDays
    if (patch.discountType !== undefined) {
      fields.discount_type = patch.discountType
      if (patch.discountType === 'none') fields.discount_value = 0
    }
    if (patch.discountValue !== undefined && (patch.discountType ?? row.discount_type) !== 'none') {
      fields.discount_value = patch.discountValue
    }
    if ((patch.discountType ?? row.discount_type) === 'percent' && (fields.discount_value ?? Number(row.discount_value)) > 10_000) {
      throw badRequest('A percentage discount cannot exceed 100 %')
    }
    if (patch.reverseCharge !== undefined) fields.reverse_charge = patch.reverseCharge
    if (patch.allowBank !== undefined) fields.allow_bank = patch.allowBank
    if (patch.allowStripe !== undefined) fields.allow_stripe = patch.allowStripe
    if (patch.notes !== undefined) fields.notes = patch.notes
    if (patch.internalNote !== undefined) fields.internal_note = patch.internalNote

    const fx = await fxColumn(patch.fx)

    if (fx !== undefined) fields.fx = fx

    await repo.writeDraft(row.id, fields)

    if (patch.lines !== undefined) {
      await repo.replaceLines(
        row.id,
        await resolveLines(patch.lines, await repo.linesOf(row.id), fields.language ?? row.language),
      )
    }

    if (patch.installments !== undefined) await repo.replaceInstallments(row.id, patch.installments)

    await refreshTotals(row.id)
  })

  return getInvoice(input.id)
}

/** Only a draft can be deleted: it has no number, so nothing leaves a gap. */
export const deleteDraft = async (id: string): Promise<{ id: string; deleted: true }> => {
  await withTransaction(async () => {
    const row = await repo.lockInvoice(id)

    if (!row) throw missing()
    if (row.status !== 'draft') {
      throw invoiceLocked('An issued invoice is kept for ever. Cancel it instead of deleting it.')
    }

    await repo.deleteDraftRow(row.id)
  })

  return { id, deleted: true }
}

/* ------------------------------------------------------------------ preview */

/** The draft as it would print today, marked DRAFT, with no number. */
export const previewInvoice = async (
  id: string,
  requested: RequestableLanguage | undefined,
): Promise<{ bytes: Uint8Array; fileName: string }> => {
  const row = await repo.findInvoice(id)

  if (!row) throw missing()
  if (row.status !== 'draft') throw badRequest('This invoice is issued. Download its document instead.')

  const language = documentLanguage(requested, row.language)
  const settings = await repo.readSettings()
  const issueDate = today()
  const installments = await repo.installmentsOf(id)
  const document = buildDocument({
    row,
    lines: await repo.linesOf(id),
    installments,
    settings,
    number: null,
    issueDate,
    dueDate: installments.length > 0 ? installments.at(-1)!.due_date : addDays(issueDate, row.payment_terms_days),
    replaces: await repo.numberOf(row.replaces_invoice_id).then((link) =>
      link?.number ? { number: link.number } : null,
    ),
  })

  return {
    bytes: await renderInvoicePdf({ ...document, language: row.language }, { language, watermark: 'draft' }),
    fileName: `Preview-${language.toUpperCase()}.pdf`,
  }
}

/* ------------------------------------------------------------------- issuing */

/**
 * Issues a draft the caller has locked, inside the caller's transaction.
 *
 * Everything that can refuse refuses before the number is taken; the number
 * is the last thing read and the first thing written, so a refusal can never
 * burn one, and a rollback returns it.
 */
export const issueLocked = async (row: repo.InvoiceRow): Promise<string> => {
  assertModeAllowed(row.mode)

  const settings = await repo.readSettings()

  if (row.mode === 'live') {
    const gaps = sellerMissing(settings)

    if (gaps.length > 0) throw sellerNotReady(undefined, { missing: gaps })
  }

  const lines = await repo.linesOf(row.id)
  const installments = await repo.installmentsOf(row.id)
  const issueDate = today()
  const client = await clientRepo.findClient(row.client_id)
  const problems = issueProblems({
    row,
    lines,
    installments,
    settings,
    issueDate,
    clientUsable: Boolean(client && !client.trashed_at),
  })

  if (problems.length > 0) throw invoiceNotReady(problems[0], { issues: problems })

  const replaces = await repo.numberOf(row.replaces_invoice_id)
  const year = yearOf(issueDate)
  const seq = await repo.takeNumber(row.mode, year)
  const number = formatNumber(row.mode, year, seq)
  const dueDate =
    installments.length > 0 ? installments.at(-1)!.due_date : addDays(issueDate, row.payment_terms_days)
  const document = buildDocument({
    row,
    lines,
    installments,
    settings,
    number,
    issueDate,
    dueDate,
    replaces: replaces?.number ? { number: replaces.number } : null,
  })

  await repo.markIssued({
    id: row.id,
    number,
    year,
    seq,
    issueDate,
    dueDate,
    serviceDateFrom: document.serviceDateFrom,
    serviceDateTo: document.serviceDateTo,
    taxMode: settings.tax_mode,
    snapshot: document,
    totals: {
      subtotal: document.totals.subtotalMinor,
      discount: document.totals.discountMinor,
      net: document.totals.netMinor,
      tax: document.totals.taxMinor,
      total: document.totals.totalMinor,
    },
  })
  await repo.recordEvent({ invoiceId: row.id, kind: 'issued', detail: { number } })

  return number
}

/**
 * Stores the baseline PDF after the number is committed. Failing here does
 * not undo the issue — the document is rendered from the snapshot on first
 * download instead — but it is recorded, not swallowed.
 */
export const storeBaselineDocument = async (invoiceId: string): Promise<void> => {
  const row = await repo.findInvoice(invoiceId)

  if (!row || row.status === 'draft') return

  try {
    await ensureDocument({ invoiceId, language: row.language })
  } catch (error) {
    await repo
      .recordEvent({
        invoiceId,
        kind: 'document_pending',
        detail: { reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown' },
      })
      .catch(() => {})
  }
}

/**
 * The owner's explicit Issue. Idempotent: issuing an issued invoice returns
 * it unchanged — never a second number. The revision is the one the owner
 * previewed, so a draft edited in another tab is not issued unseen.
 */
export const issueInvoice = async (input: { id: string; revision: number }): Promise<OwnerInvoice> => {
  await withTransaction(async () => {
    const row = await repo.lockInvoice(input.id)

    if (!row) throw missing()
    if (row.status !== 'draft') return
    if (row.revision !== input.revision) {
      throw conflict('This draft changed after you previewed it. Review it again before issuing.')
    }

    await issueLocked(row)
  })

  await storeBaselineDocument(input.id)

  return getInvoice(input.id)
}
