import {
  EmailAddressSchema,
  INBOX_LIMITS,
  type InboxLanguage,
  type InboxMessage,
} from '../../contracts/inbox.contract'
import type { RichTextDoc } from '../../contracts/rich-text.contract'
import { isRichTextEmpty } from '../../contracts/rich-text.contract'
import { withTransaction } from '../../db/client'
import {
  confirmationRequired,
  conflict,
  notFound,
  sendFailed,
  staleDraft,
  validationFailed,
} from '../../http/error'
import { resolveMediaStore } from '../../media/store'
import { openOwnerAsset, releaseReferences, replaceReferences } from '../media/media.service'
import * as v from 'valibot'
import { resolveAttachments } from './draft.service'
import { previewOf, renderEmail } from './email-render'
import { canRetry, toDraft, toMessage } from './inbox.mapper'
import * as repo from './inbox.repo'
import {
  type OutgoingEmail,
  inboxFromAddress,
  inboxFromName,
  inboxReplyAddress,
  messageIdDomain,
  resolveInboxTransport,
  withReplyToken,
} from './inbox.transport'

/**
 * Sending. The only file in the Inbox that makes anything leave the server.
 *
 * Two steps, always in this order:
 *
 *  1. **Record.** In one transaction the draft becomes an outgoing message in
 *     state `sending`, and the draft is gone. The message remembers which
 *     draft it came from under a unique key, so a double-click, a second tab
 *     or a network retry finds this message instead of writing — and
 *     sending — another.
 *  2. **Deliver.** Only after that commit is the provider called, with the
 *     message id as its idempotency key. The outcome is written back:
 *     `accepted` or `failed`, with the text and attachments intact for a
 *     retry that the provider will recognise as the same email.
 */

/** A fresh reply token: 128 bits, URL- and address-safe. */
export const newReplyToken = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const newMessageIdHeader = (): string => `<${crypto.randomUUID()}@${messageIdDomain()}>`

/** `<a> <b>` → ['<a>', '<b>'], bounded so a hostile header cannot grow for ever. */
export const parseMessageIds = (value: string | null | undefined): string[] =>
  (value ?? '').match(/<[^<>\s]{1,300}>/gu)?.slice(-20) ?? []

const threadHeaders = (
  previous: repo.MessageRow | null,
): { inReplyTo: string | null; references: string | null } => {
  if (!previous?.message_id_header) return { inReplyTo: null, references: null }

  const references = [...parseMessageIds(previous.references_header), previous.message_id_header]
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(-20)

  return { inReplyTo: previous.message_id_header, references: references.join(' ') }
}

const readAll = async (stream: ReadableStream<Uint8Array>): Promise<Uint8Array> => {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  for (;;) {
    const { done, value } = await reader.read()

    if (done) break
    if (!value) continue

    chunks.push(value)
    total += value.byteLength
  }

  const bytes = new Uint8Array(total)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes
}

const escapeHtml = (value: string): string =>
  value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')

const loadMessage = async (id: string): Promise<InboxMessage> => {
  const row = await repo.findMessage(id)

  if (!row) throw notFound('That message does not exist')

  return toMessage(row, [])
}

/* ------------------------------------------------------------------ deliver */

/**
 * Calls the provider for one recorded message and writes the outcome.
 *
 * Never throws for a provider failure: the result is on the message, where
 * the owner can see it. Throws only when the message itself is missing.
 */
export const deliverMessage = async (
  messageId: string,
  options: { alreadyClaimed?: boolean } = {},
): Promise<InboxMessage> => {
  const message = await repo.findMessage(messageId)

  if (!message || message.direction !== 'outgoing') throw notFound('That message does not exist')

  const conversation = await repo.findConversation(message.conversation_id)

  if (!conversation) throw notFound('That conversation does not exist')

  if (!options.alreadyClaimed) await repo.markSendAttempt(message.id)

  const fail = async (provider: 'resend' | 'fake' | null, reason: string) => {
    await repo.recordDelivery({ id: message.id, status: 'failed', provider, failureReason: reason })

    return loadMessage(message.id)
  }

  // The attachments, read from Media now rather than trusted from the draft.
  const attachments: OutgoingEmail['attachments'] = []

  if (message.attachments.length > 0) {
    const store = await resolveMediaStore()

    if (!store) return fail(null, 'File storage is not available, so the attachments could not be read.')

    for (const file of message.attachments) {
      try {
        const opened = await openOwnerAsset(file.assetId, store)

        attachments.push({
          filename: file.fileName,
          contentType: opened.contentType,
          content: await readAll(opened.body),
        })
      } catch {
        return fail(null, `The attachment “${file.fileName}” could not be read from Media.`)
      }
    }
  }

  let html: string
  let text: string

  if (message.body_doc) {
    const previous = await repo.previousMessage({
      conversationId: message.conversation_id,
      before: message.occurred_at,
      excludeId: message.id,
    })
    const rendered = renderEmail({
      doc: message.body_doc as RichTextDoc,
      quoted: previous
        ? {
            from: previous.from_name ? `${previous.from_name} <${previous.from_email}>` : previous.from_email,
            at: new Date(previous.occurred_at),
            text: previous.body_text.slice(0, 20_000),
          }
        : null,
    })

    html = rendered.html
    text = rendered.text
  } else {
    // A message another module composed as plain text, such as a booking
    // confirmation.
    text = message.body_text
    html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${escapeHtml(
      message.body_text,
    ).replace(/\n/gu, '<br>')}</div>`
  }

  const headers: Record<string, string> = {}

  if (message.message_id_header) headers['Message-ID'] = message.message_id_header
  if (message.in_reply_to) headers['In-Reply-To'] = message.in_reply_to
  if (message.references_header) headers.References = message.references_header

  const result = await resolveInboxTransport().send({
    from: `${inboxFromName()} <${inboxFromAddress()}>`,
    to: message.to_email,
    replyTo: withReplyToken(inboxReplyAddress(), conversation.reply_token),
    subject: message.subject,
    html,
    text,
    headers,
    attachments,
    idempotencyKey: message.id,
  })

  if (!result.ok) return fail(result.provider, result.reason)

  await repo.recordDelivery({
    id: message.id,
    status: 'accepted',
    provider: result.provider,
    providerMessageId: result.providerMessageId,
  })

  return loadMessage(message.id)
}

/* --------------------------------------------------------------- send draft */

export type SendOutcome = {
  conversationId: string
  message: InboxMessage
  /** True when this draft had already been sent and nothing new happened. */
  alreadySent: boolean
}

/**
 * The owner's explicit Send.
 *
 * Throws `SEND_FAILED` when the provider refused — with the conversation and
 * message ids in `details`, because the message *was* recorded and the owner
 * needs to be taken to it to retry.
 */
export const sendDraft = async (input: {
  draftId: string
  revision: number
  confirmBlankSubject: boolean
}): Promise<SendOutcome> => {
  const recorded = await withTransaction(async () => {
    const draft = await repo.lockDraft(input.draftId)

    if (!draft) {
      const already = await repo.findMessageByDraft(input.draftId)

      if (already) return { messageId: already.id, conversationId: already.conversation_id, alreadySent: true }

      throw notFound('That draft does not exist')
    }

    if (draft.revision !== input.revision) {
      throw staleDraft(undefined, {
        draft: toDraft(draft, await resolveAttachments(draft.attachment_asset_ids)),
      })
    }

    const conversation = draft.conversation_id ? await repo.lockConversation(draft.conversation_id) : null

    if (draft.conversation_id && !conversation) throw notFound('That conversation does not exist')

    const to = v.safeParse(EmailAddressSchema, conversation?.counterpart_email ?? draft.to_email)

    if (!to.success) {
      throw validationFailed('Enter one valid email address', {
        issues: [{ field: 'toEmail', message: 'Enter one valid email address' }],
      })
    }

    const doc = draft.body_doc as RichTextDoc

    if (isRichTextEmpty(doc)) {
      throw validationFailed('Write something before sending', {
        issues: [{ field: 'bodyDoc', message: 'The message is empty' }],
      })
    }

    if (draft.subject.trim() === '' && !input.confirmBlankSubject) {
      throw confirmationRequired('This email has no subject. Send it anyway?', { field: 'subject' })
    }

    const files = await resolveAttachments(draft.attachment_asset_ids)

    if (files.length !== draft.attachment_asset_ids.length) {
      throw validationFailed('One of the attachments is no longer in the Media library', {
        issues: [{ field: 'attachmentAssetIds', message: 'A chosen file is no longer in Media' }],
      })
    }

    if (files.reduce((sum, file) => sum + file.byteSize, 0) > INBOX_LIMITS.maxAttachmentBytes) {
      throw validationFailed('Those attachments are larger than 25 MB together', {
        issues: [{ field: 'attachmentAssetIds', message: 'Attachments may total at most 25 MB' }],
      })
    }

    const now = new Date()
    const target =
      conversation ??
      (await repo.insertConversation({
        subject: draft.subject,
        counterpartEmail: to.output,
        counterpartName: '',
        origin: 'outgoing',
        replyToken: newReplyToken(),
        isRead: true,
        occurredAt: now,
      }))

    const previous = conversation ? (await repo.latestMessages(conversation.id, 1))[0] ?? null : null
    const thread = threadHeaders(previous)
    const bodyText = renderEmail({ doc }).text

    const messageId = await repo.insertMessage({
      conversationId: target.id,
      direction: 'outgoing',
      fromEmail: inboxFromAddress(),
      fromName: inboxFromName(),
      toEmail: to.output,
      toName: conversation?.counterpart_name ?? '',
      subject: draft.subject,
      bodyText,
      bodyDoc: doc,
      messageIdHeader: newMessageIdHeader(),
      inReplyTo: thread.inReplyTo,
      referencesHeader: thread.references,
      occurredAt: now,
      deliveryStatus: 'sending',
      sourceDraftId: draft.id,
      attachments: files,
      language: draft.language,
    })

    await repo.recordMessageOnConversation({
      conversationId: target.id,
      direction: 'outgoing',
      occurredAt: now,
      preview: previewOf(bodyText),
    })

    // The use moves from the draft to the sent message, which keeps the files
    // undeletable for as long as the message exists.
    await replaceReferences({
      module: 'inbox',
      ownerType: 'message',
      ownerId: messageId,
      scope: 'record',
      label: `Email: ${draft.subject || '(no subject)'}`.slice(0, 200),
      entries: files.map((file, position) => ({ assetId: file.assetId, usage: 'attachment', position })),
    })
    await releaseReferences({ module: 'inbox', ownerType: 'draft', ownerId: draft.id, scope: 'draft' })
    await repo.deleteDraftRow(draft.id)

    return { messageId, conversationId: target.id, alreadySent: false }
  })

  if (recorded.alreadySent) {
    return {
      conversationId: recorded.conversationId,
      message: await loadMessage(recorded.messageId),
      alreadySent: true,
    }
  }

  const message = await deliverMessage(recorded.messageId)

  if (message.delivery?.status === 'failed') {
    throw sendFailed(message.delivery.failureReason ?? undefined, {
      conversationId: recorded.conversationId,
      messageId: message.id,
    })
  }

  return { conversationId: recorded.conversationId, message, alreadySent: false }
}

/**
 * Tries a failed — or visibly stuck — message again, with the same
 * idempotency key, so a provider that did take it the first time does not
 * send it twice.
 */
export const retryMessage = async (messageId: string): Promise<InboxMessage> => {
  await withTransaction(async () => {
    const row = await repo.lockMessage(messageId)

    if (!row || row.direction !== 'outgoing') throw notFound('That message does not exist')
    if (row.delivery_status === 'accepted') return
    if (!canRetry(row)) throw conflict('This email is being sent right now.')

    // Claimed inside the lock, so a second Retry sees `sending` and stops.
    await repo.markSendAttempt(row.id)
  })

  const current = await repo.findMessage(messageId)

  if (current?.delivery_status === 'accepted') return loadMessage(messageId)

  const message = await deliverMessage(messageId, { alreadyClaimed: true })

  if (message.delivery?.status === 'failed') {
    const conversationId = current?.conversation_id

    throw sendFailed(message.delivery.failureReason ?? undefined, { conversationId, messageId })
  }

  return message
}

/* ------------------------------------------------- for the modules that mail */

/**
 * A message another module writes into the Inbox and sends — a booking
 * confirmation, a reminder. It lands in its own conversation (or one the
 * module already holds), so the visitor's answer threads back here and the
 * owner replies from the Inbox like any other email.
 *
 * Called in-process only. Delivery failures are recorded on the message and
 * returned, not thrown: the caller's own record — the appointment — must not
 * be undone because an email bounced.
 */
export const sendSystemEmail = async (input: {
  conversationId?: string | null
  origin: 'booking' | 'contact'
  originRef: string
  facts?: Record<string, string>
  to: string
  toName: string
  subject: string
  text: string
  language: InboxLanguage
}): Promise<{ conversationId: string; message: InboxMessage }> => {
  const recorded = await withTransaction(async () => {
    const now = new Date()
    const existing = input.conversationId ? await repo.lockConversation(input.conversationId) : null
    const conversation =
      existing ??
      (await repo.insertConversation({
        subject: input.subject,
        counterpartEmail: input.to,
        counterpartName: input.toName,
        origin: input.origin,
        originRef: input.originRef,
        facts: input.facts,
        replyToken: newReplyToken(),
        isRead: true,
        occurredAt: now,
      }))
    const previous = existing ? (await repo.latestMessages(existing.id, 1))[0] ?? null : null
    const thread = threadHeaders(previous)

    const messageId = await repo.insertMessage({
      conversationId: conversation.id,
      direction: 'outgoing',
      fromEmail: inboxFromAddress(),
      fromName: inboxFromName(),
      toEmail: input.to,
      toName: input.toName,
      subject: input.subject,
      bodyText: input.text,
      messageIdHeader: newMessageIdHeader(),
      inReplyTo: thread.inReplyTo,
      referencesHeader: thread.references,
      occurredAt: now,
      deliveryStatus: 'sending',
      language: input.language,
    })

    await repo.recordMessageOnConversation({
      conversationId: conversation.id,
      direction: 'outgoing',
      occurredAt: now,
      preview: previewOf(input.text),
    })

    return { conversationId: conversation.id, messageId }
  })

  return { conversationId: recorded.conversationId, message: await deliverMessage(recorded.messageId) }
}
