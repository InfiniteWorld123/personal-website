import type {
  ConversationSummary,
  IncomingAttachment,
  InboxDraft,
  InboxMessage,
  InboxSnippet,
  OutgoingAttachment,
} from '../../contracts/inbox.contract'
import { emptyRichTextDoc, type RichTextDoc } from '../../contracts/rich-text.contract'
import { mediaAcceptsType } from './inbox.files'
import type {
  AttachmentRow,
  ConversationListRow,
  DraftRow,
  MessageRow,
  SnippetRow,
} from './inbox.repo'

/** Rows to the shapes the Dashboard reads. No storage key ever leaves here. */

const iso = (value: Date | string): string => new Date(value).toISOString()

/** A message still marked sending this long after its attempt was interrupted. */
export const STUCK_SENDING_MS = 2 * 60 * 1000

export const toSummary = (row: ConversationListRow): ConversationSummary => ({
  id: row.id,
  subject: row.subject,
  counterpartEmail: row.counterpart_email,
  counterpartName: row.counterpart_name,
  origin: row.origin,
  folder: row.folder,
  isRead: row.is_read,
  isStarred: row.is_starred,
  messageCount: row.message_count,
  lastMessageAt: iso(row.last_message_at),
  lastDirection: row.last_direction,
  lastPreview: row.last_preview,
  hasFailedSend: row.has_failed_send,
  hasDraft: row.has_draft,
  trashedAt: row.trashed_at ? iso(row.trashed_at) : null,
})

export const toIncomingAttachment = (row: AttachmentRow): IncomingAttachment => {
  const canSave = row.status === 'stored' && mediaAcceptsType(row.detected_type)

  return {
    id: row.id,
    fileName: row.file_name,
    contentType: row.detected_type ?? (row.declared_type || 'application/octet-stream'),
    byteSize: Number(row.byte_size),
    status: row.status,
    failureReason: row.failure_reason,
    canSaveToMedia: canSave,
    saveToMediaUnavailableReason: canSave
      ? null
      : row.status !== 'stored'
        ? 'This file was not kept.'
        : 'The Media library does not accept this type of file. Download it instead.',
    savedMediaAssetId: row.saved_media_asset_id,
  }
}

export const canRetry = (row: MessageRow, now: Date = new Date()): boolean =>
  row.direction === 'outgoing' &&
  (row.delivery_status === 'failed' ||
    (row.delivery_status === 'sending' &&
      (!row.last_attempt_at || now.getTime() - new Date(row.last_attempt_at).getTime() > STUCK_SENDING_MS)))

export const toMessage = (row: MessageRow, attachments: AttachmentRow[]): InboxMessage => ({
  id: row.id,
  direction: row.direction,
  fromEmail: row.from_email,
  fromName: row.from_name,
  toEmail: row.to_email,
  toName: row.to_name,
  subject: row.subject,
  bodyText: row.body_text,
  bodyDoc: (row.body_doc as RichTextDoc | null) ?? null,
  hasHtml: row.has_html,
  occurredAt: iso(row.occurred_at),
  delivery:
    row.direction === 'outgoing' && row.delivery_status
      ? {
          status: row.delivery_status,
          provider: row.delivery_provider,
          failureReason: row.failure_reason,
          attempts: row.send_attempts,
          canRetry: canRetry(row),
        }
      : null,
  incomingAttachments: attachments.map(toIncomingAttachment),
  outgoingAttachments: row.attachments ?? [],
  language: row.language,
})

export const toDraft = (row: DraftRow, attachments: OutgoingAttachment[]): InboxDraft => ({
  id: row.id,
  conversationId: row.conversation_id,
  toEmail: row.to_email,
  subject: row.subject,
  bodyDoc: (row.body_doc as RichTextDoc | null) ?? emptyRichTextDoc(),
  language: row.language,
  attachments,
  revision: row.revision,
  createdAt: iso(row.created_at),
  updatedAt: iso(row.updated_at),
  conversationSubject: row.conversation_subject ?? null,
})

export const toSnippet = (row: SnippetRow): InboxSnippet => ({
  id: row.id,
  title: row.title,
  language: row.language,
  body: row.body,
  updatedAt: iso(row.updated_at),
})
