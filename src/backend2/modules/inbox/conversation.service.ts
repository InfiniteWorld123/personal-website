import type {
  ConversationDetail,
  ConversationListQuery,
  ConversationSummary,
  InboxCounts,
} from '../../contracts/inbox.contract'
import { type Page, toPage } from '../../contracts/pagination.contract'
import { withTransaction } from '../../db/client'
import { badRequest, conflict, notFound } from '../../http/error'
import { resolveMediaStore } from '../../media/store'
import * as mediaRepo from '../media/media.repo'
import { releaseReferences } from '../media/media.service'
import { toMessage, toSummary } from './inbox.mapper'
import * as repo from './inbox.repo'

/**
 * Conversations: listing, reading, and moving between Inbox, Archived and
 * Trash — and, from Trash only, deleting for good.
 */

export const listConversations = async (
  query: ConversationListQuery,
): Promise<Page<ConversationSummary>> => {
  const { rows, total } = await repo.listConversations(query)

  return toPage({ items: rows.map(toSummary), page: query.page, pageSize: query.pageSize, total })
}

export const countInbox = (): Promise<InboxCounts> => repo.countFolders()

export const getConversation = async (input: {
  id: string
  page: number
  pageSize: number
}): Promise<ConversationDetail> => {
  const row = await repo.findConversation(input.id)

  if (!row) throw notFound('That conversation does not exist')

  const { rows, total } = await repo.listMessages({
    conversationId: row.id,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })
  const attachments = await repo.attachmentsForMessages(rows.map((message) => message.id))
  const replyDraft = await repo.findReplyDraft(row.id)

  return {
    conversation: { ...toSummary(row), facts: row.facts ?? {} },
    messages: toPage({
      items: rows.map((message) =>
        toMessage(
          message,
          attachments.filter((attachment) => attachment.message_id === message.id),
        ),
      ),
      page: input.page,
      pageSize: input.pageSize,
      total,
    }),
    replyDraftId: replyDraft?.id ?? null,
  }
}

const summaryOf = async (id: string): Promise<ConversationSummary> => {
  const row = await repo.findConversation(id)

  if (!row) throw notFound('That conversation does not exist')

  return toSummary(row)
}

export const patchConversation = async (input: {
  id: string
  isRead?: boolean
  isStarred?: boolean
  archived?: boolean
}): Promise<ConversationSummary> => {
  await withTransaction(async () => {
    const row = await repo.lockConversation(input.id)

    if (!row) throw notFound('That conversation does not exist')

    if (input.archived !== undefined && row.folder === 'trash') {
      throw conflict('This conversation is in Trash. Restore it first.')
    }

    await repo.updateConversationFlags({
      id: row.id,
      isRead: input.isRead,
      isStarred: input.isStarred,
      folder: input.archived === undefined ? undefined : input.archived ? 'archived' : 'inbox',
    })
  })

  return summaryOf(input.id)
}

/** The whole thread moves; its replies are not separate items. */
export const trashConversation = async (id: string): Promise<ConversationSummary> => {
  await withTransaction(async () => {
    const row = await repo.lockConversation(id)

    if (!row) throw notFound('That conversation does not exist')
    if (row.folder === 'trash') return

    await repo.updateConversationFlags({
      id,
      folder: 'trash',
      trashedFrom: row.folder,
      trashedAt: new Date(),
    })
  })

  return summaryOf(id)
}

export const restoreConversation = async (id: string): Promise<ConversationSummary> => {
  await withTransaction(async () => {
    const row = await repo.lockConversation(id)

    if (!row) throw notFound('That conversation does not exist')
    if (row.folder !== 'trash') return

    await repo.updateConversationFlags({
      id,
      folder: row.trashed_from ?? 'inbox',
      trashedFrom: null,
      trashedAt: null,
    })
  })

  return summaryOf(id)
}

/**
 * Permanent, for one conversation in Trash.
 *
 * The same order as a Media deletion: inside one transaction, forget the
 * Media uses and record the private attachment keys for removal; only after
 * COMMIT remove the bytes. Shared Media files a sent message carried are not
 * deleted — only this conversation's use of them.
 */
export const deleteConversation = async (input: {
  id: string
  confirm: string
}): Promise<{ deleted: true; storageRemoved: boolean }> => {
  if (input.confirm !== input.id) {
    throw badRequest('Confirm by sending this conversation’s id')
  }

  const keys = await withTransaction(async () => {
    const row = await repo.lockConversation(input.id)

    if (!row) throw notFound('That conversation does not exist')
    if (row.folder !== 'trash') {
      throw conflict('Move the conversation to Trash before deleting it permanently.')
    }

    for (const messageId of await repo.messageIdsForConversation(row.id)) {
      await releaseReferences({ module: 'inbox', ownerType: 'message', ownerId: messageId, scope: 'record' })
    }

    for (const draftId of await repo.draftIdsForConversation(row.id)) {
      await releaseReferences({ module: 'inbox', ownerType: 'draft', ownerId: draftId, scope: 'draft' })
    }

    const storageKeys = await repo.storageKeysForConversation(row.id)

    for (const key of storageKeys) await mediaRepo.markPendingObject({ storageKey: key, purpose: 'delete' })

    await repo.deleteConversationRow(row.id)

    return storageKeys
  })

  return { deleted: true, storageRemoved: await removeObjects(keys) }
}

/**
 * Bytes whose rows are already gone. A failure is left in the pending ledger
 * for `bun run db2:media:sweep`, and reported rather than hidden.
 */
const removeObjects = async (keys: string[]): Promise<boolean> => {
  if (keys.length === 0) return true

  const store = await resolveMediaStore()

  if (!store) return false

  let allRemoved = true

  for (const key of keys) {
    try {
      await store.remove(key)
      await mediaRepo.clearPendingObject(key)
    } catch (error) {
      allRemoved = false
      await mediaRepo
        .recordPendingObjectFailure({
          storageKey: key,
          error: error instanceof Error ? error.message : String(error),
        })
        .catch(() => {})
    }
  }

  return allRemoved
}

/** Everything in Trash, in bounded batches. */
export const emptyTrash = async (): Promise<{ deleted: number; storageRemoved: boolean }> => {
  let deleted = 0
  let storageRemoved = true

  for (;;) {
    const ids = await repo.trashedConversationIds(50)

    if (ids.length === 0) break

    for (const id of ids) {
      const result = await deleteConversation({ id, confirm: id })

      deleted += 1
      storageRemoved &&= result.storageRemoved
    }
  }

  return { deleted, storageRemoved }
}

/** The sender's HTML, only for the sandboxed view in the Dashboard. */
export const getMessageHtml = async (messageId: string): Promise<{ html: string }> => {
  const message = await repo.findMessage(messageId)

  if (!message || message.direction !== 'incoming') throw notFound('That message does not exist')

  const html = await repo.findMessageHtml(messageId)

  if (!html) throw notFound('That message has no HTML version')

  return { html }
}
