import {
  INBOX_LIMITS,
  type InboxDraft,
  type InboxLanguage,
  type OutgoingAttachment,
} from '../../contracts/inbox.contract'
import { type Page, toPage } from '../../contracts/pagination.contract'
import type { RichTextDoc } from '../../contracts/rich-text.contract'
import { withTransaction } from '../../db/client'
import { notFound, staleDraft, validationFailed } from '../../http/error'
import * as mediaRepo from '../media/media.repo'
import { releaseReferences, replaceReferences } from '../media/media.service'
import { toDraft } from './inbox.mapper'
import * as repo from './inbox.repo'

/**
 * Drafts. Saved privately and often, and never sent by being saved: the only
 * way out of this file into the world is `send.service.ts`, called by the
 * owner's explicit Send.
 */

/** The Media files a draft names, as the composer shows them. */
export const resolveAttachments = async (assetIds: string[]): Promise<OutgoingAttachment[]> => {
  const files: OutgoingAttachment[] = []

  for (const assetId of assetIds) {
    const asset = await mediaRepo.findAsset(assetId)

    if (!asset) continue

    files.push({
      assetId: asset.id,
      fileName: asset.display_name,
      contentType: asset.content_type,
      byteSize: Number(asset.byte_size),
    })
  }

  return files
}

const loadDraft = async (id: string): Promise<InboxDraft> => {
  const row = await repo.findDraft(id)

  if (!row) throw notFound('That draft does not exist')

  return toDraft(row, await resolveAttachments(row.attachment_asset_ids))
}

export const getDraft = loadDraft

export const listDrafts = async (input: { page: number; pageSize: number }): Promise<Page<InboxDraft>> => {
  const { rows, total } = await repo.listDrafts({
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })
  const items: InboxDraft[] = []

  for (const row of rows) items.push(toDraft(row, await resolveAttachments(row.attachment_asset_ids)))

  return toPage({ items, page: input.page, pageSize: input.pageSize, total })
}

const replySubject = (subject: string): string =>
  /^\s*(re|aw|antw)\s*:/iu.test(subject) || subject.trim() === '' ? subject : `Re: ${subject}`

/**
 * A new draft, or — for a reply — the conversation's existing reply draft.
 * Opening a conversation twice recovers the same text rather than starting a
 * second, competing reply.
 */
export const createDraft = async (input: {
  conversationId: string | null
  toEmail: string
  subject: string
  language: InboxLanguage
}): Promise<{ draft: InboxDraft; created: boolean }> => {
  const outcome = await withTransaction(async () => {
    if (!input.conversationId) {
      const id = await repo.insertDraft({
        conversationId: null,
        toEmail: input.toEmail,
        subject: input.subject,
        language: input.language,
      })

      return { id, created: true }
    }

    const conversation = await repo.lockConversation(input.conversationId)

    if (!conversation) throw notFound('That conversation does not exist')

    const existing = await repo.findReplyDraft(conversation.id)

    if (existing) return { id: existing.id, created: false }

    const id = await repo.insertDraft({
      conversationId: conversation.id,
      toEmail: conversation.counterpart_email,
      subject: replySubject(conversation.subject),
      language: input.language,
    })

    return { id, created: true }
  })

  return { draft: await loadDraft(outcome.id), created: outcome.created }
}

/**
 * An autosave. Only what is sent changes, and only if the caller saw the
 * latest save — a stale tab is refused, with the current draft attached, so
 * newer text is never overwritten without the owner knowing.
 */
export const patchDraft = async (input: {
  id: string
  revision: number
  toEmail?: string
  subject?: string
  bodyDoc?: RichTextDoc
  language?: InboxLanguage
  attachmentAssetIds?: string[]
}): Promise<InboxDraft> => {
  await withTransaction(async () => {
    const row = await repo.lockDraft(input.id)

    if (!row) throw notFound('That draft does not exist')

    if (row.revision !== input.revision) {
      throw staleDraft(undefined, {
        draft: toDraft(row, await resolveAttachments(row.attachment_asset_ids)),
      })
    }

    let attachmentAssetIds: string[] | undefined

    if (input.attachmentAssetIds !== undefined) {
      attachmentAssetIds = [...new Set(input.attachmentAssetIds)]

      const files = await resolveAttachments(attachmentAssetIds)

      if (files.length !== attachmentAssetIds.length) {
        throw validationFailed('One of those files is no longer in the Media library', {
          issues: [{ field: 'attachmentAssetIds', message: 'A chosen file is no longer in Media' }],
        })
      }

      const total = files.reduce((sum, file) => sum + file.byteSize, 0)

      if (total > INBOX_LIMITS.maxAttachmentBytes) {
        throw validationFailed('Those attachments are larger than 25 MB together', {
          issues: [{ field: 'attachmentAssetIds', message: 'Attachments may total at most 25 MB' }],
        })
      }

      // The draft's use of these files: they cannot be deleted from Media
      // while this draft names them.
      await replaceReferences({
        module: 'inbox',
        ownerType: 'draft',
        ownerId: row.id,
        scope: 'draft',
        label: 'Email draft',
        entries: attachmentAssetIds.map((assetId, position) => ({
          assetId,
          usage: 'attachment',
          position,
        })),
      })
    }

    await repo.updateDraftRow({
      id: row.id,
      // A reply goes to the conversation's person; its address is not editable.
      toEmail: row.conversation_id ? undefined : input.toEmail,
      subject: input.subject,
      bodyDoc: input.bodyDoc,
      language: input.language,
      attachmentAssetIds,
    })
  })

  return loadDraft(input.id)
}

export const discardDraft = async (id: string): Promise<{ discarded: true }> => {
  await withTransaction(async () => {
    const row = await repo.lockDraft(id)

    if (!row) throw notFound('That draft does not exist')

    await releaseReferences({ module: 'inbox', ownerType: 'draft', ownerId: row.id, scope: 'draft' })
    await repo.deleteDraftRow(row.id)
  })

  return { discarded: true }
}
