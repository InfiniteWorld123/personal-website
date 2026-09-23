import type { DocumentLanguage, RequestableLanguage } from '../../contracts/invoice.contract'
import { withTransaction } from '../../db/client'
import { badRequest, languageNotSupported, notFound } from '../../http/error'
import { type MediaStore, requireMediaStore } from '../../media/store'
import { ensureModuleFolder, storeGeneratedFile } from '../media/media.generated'
import { deleteAsset, openOwnerAsset, replaceReferences } from '../media/media.service'
import { readSnapshot } from './invoice.document'
import { renderInvoicePdf, renderReceiptPdf } from './invoice.pdf'
import * as repo from './invoice.repo'

/**
 * Issued documents as files in the shared Media library.
 *
 * Every issued document — and every language copy of it, and every cash
 * receipt — is rendered from the frozen snapshot, stored once under
 * `Invoices/<year>`, and held by a `record` reference from Invoices. That
 * reference is the retention lock: Media refuses to delete a referenced file,
 * and `v2_invoice_files` points at the asset with ON DELETE RESTRICT as a
 * second layer. The reference is by asset id, so renaming or moving the
 * folder or the file breaks nothing.
 *
 * Storing is lazy and idempotent: the first request for a language renders
 * and stores it; every later one returns the stored file. Two requests at
 * once store one file — the loser's copy is deleted again before anything
 * points at it.
 */

/** Arabic is recorded as a wish, and refused honestly until it can be done well. */
export const documentLanguage = (language: RequestableLanguage | undefined, fallback: DocumentLanguage): DocumentLanguage => {
  if (language === undefined) return fallback
  if (language === 'ar') {
    throw languageNotSupported(
      'Arabic invoice copies are not available yet: the PDF engine cannot yet shape Arabic reliably. ' +
        'Send the German or English copy.',
      { language: 'ar' },
    )
  }

  return language
}

const folderFor = async (issueDate: string): Promise<string> => {
  const settings = await repo.readSettings()
  const { rootId, folderId } = await ensureModuleFolder({
    rememberedRootId: settings.media_folder_id,
    rootName: 'Invoices',
    childName: issueDate.slice(0, 4),
  })

  if (rootId !== settings.media_folder_id) await repo.setMediaFolder(rootId)

  return folderId
}

/** Re-states every file this invoice holds, as one complete set. */
const syncReferences = async (invoiceId: string, number: string | null): Promise<void> => {
  const files = await repo.filesOf(invoiceId)

  await replaceReferences({
    module: 'invoices',
    ownerType: 'invoice',
    ownerId: invoiceId,
    scope: 'record',
    label: `Invoice ${number ?? ''}`.trim(),
    entries: files.map((file, position) => ({ assetId: file.asset_id, usage: 'attachment', position })),
  })
}

const safeName = (value: string): string => value.replace(/[^A-Za-z0-9._-]+/gu, '-')

/** The stored PDF for an issued document in `language`, rendering it the first time. */
export const ensureDocument = async (input: {
  invoiceId: string
  language: DocumentLanguage
  store?: MediaStore
}): Promise<{ assetId: string; created: boolean }> => {
  const existing = await repo.findDocumentFile(input.invoiceId, input.language)

  if (existing) return { assetId: existing.asset_id, created: false }

  const row = await repo.findInvoice(input.invoiceId)

  if (!row) throw notFound('That invoice does not exist')
  if (row.status === 'draft' || !row.snapshot) {
    throw badRequest('A draft has no document yet. Use the preview, or issue it first.')
  }

  const document = readSnapshot(row.snapshot)
  const bytes = await renderInvoicePdf(document, {
    language: input.language,
    watermark: row.mode === 'test' ? 'test' : null,
  })
  const store = input.store ?? (await requireMediaStore())
  const prefix = row.kind === 'cancellation' ? 'Storno' : input.language === 'de' ? 'Rechnung' : 'Invoice'
  const copy = input.language === document.language ? '' : `-${input.language.toUpperCase()}`
  const asset = await storeGeneratedFile({
    bytes,
    fileName: `${prefix}-${safeName(row.number ?? row.id)}${copy}.pdf`,
    folderId: await folderFor(document.issueDate),
    store,
  })

  const won = await withTransaction(async () => {
    const inserted = await repo.insertFile({
      invoiceId: row.id,
      kind: 'document',
      language: input.language,
      paymentId: null,
      assetId: asset.id,
    })

    if (inserted) await syncReferences(row.id, row.number)

    return inserted
  })

  if (!won) {
    await deleteAsset({ id: asset.id, store }).catch(() => {})

    return { assetId: (await repo.findDocumentFile(row.id, input.language))!.asset_id, created: false }
  }

  return { assetId: asset.id, created: true }
}

/** The on-demand receipt for one cash payment, stored like a document. */
export const ensureReceipt = async (input: {
  invoiceId: string
  paymentId: string
  language: DocumentLanguage
  store?: MediaStore
}): Promise<{ assetId: string; created: boolean }> => {
  const payment = await repo.findPayment(input.paymentId)

  if (!payment || payment.invoice_id !== input.invoiceId) throw notFound('That payment does not exist')
  if (payment.method !== 'cash') throw badRequest('Receipts are offered for cash payments')
  if (payment.voided_at) throw badRequest('That payment was voided')

  const existing = await repo.findReceiptFile(payment.id, input.language)

  if (existing) return { assetId: existing.asset_id, created: false }

  const row = await repo.findInvoice(input.invoiceId)

  if (!row || !row.snapshot) throw notFound('That invoice does not exist')

  const document = readSnapshot(row.snapshot)
  const bytes = await renderReceiptPdf({
    document,
    payment: { amountMinor: Number(payment.amount_minor), paidOn: payment.paid_on, reference: payment.reference },
    language: input.language,
    test: row.mode === 'test',
  })
  const store = input.store ?? (await requireMediaStore())
  const asset = await storeGeneratedFile({
    bytes,
    fileName: `${input.language === 'de' ? 'Quittung' : 'Receipt'}-${safeName(row.number ?? row.id)}-${payment.paid_on}.pdf`,
    folderId: await folderFor(document.issueDate),
    store,
  })

  const won = await withTransaction(async () => {
    const inserted = await repo.insertFile({
      invoiceId: row.id,
      kind: 'receipt',
      language: input.language,
      paymentId: payment.id,
      assetId: asset.id,
    })

    if (inserted) await syncReferences(row.id, row.number)

    return inserted
  })

  if (!won) {
    await deleteAsset({ id: asset.id, store }).catch(() => {})

    return { assetId: (await repo.findReceiptFile(payment.id, input.language))!.asset_id, created: false }
  }

  return { assetId: asset.id, created: true }
}

/** The stored bytes of a file this module holds. */
export const readAssetBytes = async (assetId: string, store?: MediaStore): Promise<Uint8Array> => {
  const opened = await openOwnerAsset(assetId, store)

  return new Uint8Array(await new Response(opened.body).arrayBuffer())
}

export const openAsset = openOwnerAsset
