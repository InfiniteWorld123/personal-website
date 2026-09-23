import {
  type DocumentLanguage,
  type OwnerInvoice,
  type RequestableLanguage,
  formatMoney,
} from '../../contracts/invoice.contract'
import type { RichTextDoc } from '../../contracts/rich-text.contract'
import { withTransaction } from '../../db/client'
import { badRequest, notFound } from '../../http/error'
import * as clientRepo from '../clients/client.repo'
import { createDraft, getDraft, patchDraft } from '../inbox/draft.service'
import { sendDraft } from '../inbox/send.service'
import { now } from './invoice.clock'
import { readSnapshot } from './invoice.document'
import { documentLanguage, ensureDocument } from './invoice.files'
import { amountDueMinor } from './invoice.money'
import { formatDate } from './invoice.pdf'
import * as repo from './invoice.repo'
import { getInvoice } from './invoice.service'
import { resolveStripeGateway, returnUrls } from './stripe.gateway'

/**
 * Getting an issued document to the customer.
 *
 * Issuing never sends. Send opens an Inbox draft addressed to the customer,
 * with the stored PDF attached and — when card payment is offered — a Stripe
 * payment link in the text; the owner reviews it and presses Send in the
 * Inbox. Only an automatic-card subscription sends by itself, because the
 * owner chose "no monthly review" for it.
 *
 * In test mode the draft goes to the test address from Invoice settings when
 * one is set, and its subject starts with `[TEST]`.
 */

/** The Stripe Checkout link for what is still due; reused while it is valid. */
export const ensurePaymentLink = async (invoiceId: string): Promise<{ url: string; amountMinor: number }> => {
  const row = await repo.findInvoice(invoiceId)

  if (!row) throw notFound('That invoice does not exist')
  if (row.kind !== 'invoice' || row.status !== 'issued') {
    throw badRequest('Only an issued, open invoice can have a payment link')
  }

  const due = amountDueMinor({
    kind: row.kind,
    status: row.status,
    totalMinor: Number(row.total_minor),
    paidMinor: Number(row.paid_minor),
    refundedMinor: Number(row.refunded_minor),
    dueDate: row.due_date,
    installments: [],
    collectionFailed: false,
  })

  if (due <= 0) throw badRequest('Nothing is due on this invoice')

  const stillValid =
    row.stripe_checkout_url &&
    row.stripe_checkout_expires_at &&
    new Date(row.stripe_checkout_expires_at).getTime() > now().getTime() + 60 * 60 * 1000

  if (stillValid) return { url: row.stripe_checkout_url!, amountMinor: due }

  const gateway = resolveStripeGateway(row.mode)
  const { successUrl, cancelUrl } = returnUrls('payment')
  const session = await gateway.createPaymentCheckout({
    invoiceId: row.id,
    number: row.number ?? '',
    amountMinor: due,
    currency: row.currency,
    description: `${row.language === 'de' ? 'Rechnung' : 'Invoice'} ${row.number ?? ''}`.trim(),
    customerEmail: row.recipient_email || null,
    successUrl,
    cancelUrl,
    // Same invoice, same balance → the same session, however often asked.
    idempotencyKey: `v2-invoice-${row.id}-due-${due}`,
  })

  await repo.setCheckout({ id: row.id, sessionId: session.id, url: session.url, expiresAt: session.expiresAt })
  await repo.recordEvent({ invoiceId: row.id, kind: 'payment_link_created', detail: { amountMinor: due } })

  return { url: session.url, amountMinor: due }
}

const paragraph = (text: string) => ({
  type: 'paragraph' as const,
  content: text === '' ? [] : [{ type: 'text' as const, text }],
})

const bodyFor = (input: {
  language: DocumentLanguage
  kind: 'invoice' | 'cancellation'
  number: string
  name: string
  total: string
  dueDate: string | null
  link: string | null
  test: boolean
}): RichTextDoc => {
  const de = input.language === 'de'
  const lines: string[] = []

  if (input.test) lines.push(de ? 'TEST – dies ist keine echte Rechnung.' : 'TEST – this is not a real invoice.')

  lines.push(de ? `Guten Tag ${input.name},` : `Hello ${input.name},`)

  if (input.kind === 'cancellation') {
    lines.push(
      de
        ? `anbei erhalten Sie die Stornorechnung ${input.number}.`
        : `please find attached the cancellation invoice ${input.number}.`,
    )
  } else {
    lines.push(
      de
        ? `anbei erhalten Sie die Rechnung ${input.number} über ${input.total}.`
        : `please find attached invoice ${input.number} for ${input.total}.`,
    )

    if (input.dueDate) lines.push(de ? `Fällig am ${input.dueDate}.` : `Due on ${input.dueDate}.`)
    if (input.link) {
      lines.push(de ? `Sie können auch per Karte bezahlen: ${input.link}` : `You can also pay by card: ${input.link}`)
    }
  }

  lines.push(de ? 'Vielen Dank und freundliche Grüße' : 'Thank you and kind regards')

  return { type: 'doc', content: lines.map(paragraph) }
}

export type SendResult = {
  invoice: OwnerInvoice
  draft: { id: string; toEmail: string; subject: string }
  sent: boolean
  paymentLinkIncluded: boolean
  paymentLinkError: string | null
}

export const sendInvoice = async (input: {
  id: string
  language?: RequestableLanguage
  autoSend?: boolean
}): Promise<SendResult> => {
  const row = await repo.findInvoice(input.id)

  if (!row) throw notFound('That invoice does not exist')
  if (row.status === 'draft') throw badRequest('Issue the invoice before sending it')

  const language = documentLanguage(input.language, row.language)
  const document = readSnapshot(row.snapshot)
  const { assetId } = await ensureDocument({ invoiceId: row.id, language })
  const settings = await repo.readSettings()
  const client = await clientRepo.findClient(row.client_id)
  const customerEmail = row.recipient_email || client?.email || ''
  const toEmail = row.mode === 'test' && settings.test_recipient_email ? settings.test_recipient_email : customerEmail

  if (toEmail === '') throw badRequest('The recipient has no email address')

  let link: string | null = null
  let linkError: string | null = null

  if (row.kind === 'invoice' && row.status === 'issued' && row.allow_stripe) {
    try {
      link = (await ensurePaymentLink(row.id)).url
    } catch (error) {
      linkError = error instanceof Error ? error.message : 'Stripe is not available'
    }
  }

  const title = row.kind === 'cancellation'
    ? language === 'de' ? 'Stornorechnung' : 'Cancellation invoice'
    : language === 'de' ? 'Rechnung' : 'Invoice'
  const subject = `${row.mode === 'test' ? '[TEST] ' : ''}${title} ${row.number}`
  const body = bodyFor({
    language,
    kind: row.kind,
    number: row.number ?? '',
    name: row.recipient_name || row.recipient_company || client?.name || '',
    total: formatMoney(document.totals.totalMinor, document.currency, language),
    dueDate: document.dueDate ? formatDate(document.dueDate, language) : null,
    link,
    test: row.mode === 'test',
  })

  // A draft this invoice opened before, still unsent, is reused — never a second one.
  const reused = row.inbox_draft_id ? await getDraft(row.inbox_draft_id).catch(() => null) : null
  const draft = await withTransaction(async () => {
    const base = reused ?? (await createDraft({ conversationId: null, toEmail, subject, language })).draft
    const saved = await patchDraft({
      id: base.id,
      revision: base.revision,
      toEmail,
      subject,
      bodyDoc: body,
      language,
      attachmentAssetIds: [assetId],
    })

    await repo.setSent(row.id, saved.id)
    await repo.recordEvent({ invoiceId: row.id, kind: 'draft_prepared', detail: { draftId: saved.id, language } })

    return saved
  })

  let sent = false

  if (input.autoSend) {
    await sendDraft({ draftId: draft.id, revision: draft.revision, confirmBlankSubject: false })
    await repo.recordEvent({ invoiceId: row.id, kind: 'sent', detail: { draftId: draft.id } })
    sent = true
  }

  return {
    invoice: await getInvoice(row.id),
    draft: { id: draft.id, toEmail: draft.toEmail, subject: draft.subject },
    sent,
    paymentLinkIncluded: link !== null,
    paymentLinkError: linkError,
  }
}
