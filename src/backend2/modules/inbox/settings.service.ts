import {
  INBOX_LANGUAGES,
  type InboxLanguage,
  type InboxSettings,
  type InboxSnippet,
} from '../../contracts/inbox.contract'
import { type Page, toPage } from '../../contracts/pagination.contract'
import { withTransaction } from '../../db/client'
import { notFound } from '../../http/error'
import { toSnippet } from './inbox.mapper'
import * as repo from './inbox.repo'
import { inboxFromAddress, resolveInboxTransport } from './inbox.transport'

/**
 * Signatures and ready replies. Both are text the owner inserts into a draft
 * visibly and can edit before sending; nothing here is ever sent on its own,
 * and nothing is translated.
 */

export const getSettings = async (): Promise<InboxSettings> => {
  const rows = await repo.readSignatures()
  const signatures = Object.fromEntries(INBOX_LANGUAGES.map((language) => [language, ''])) as Record<
    InboxLanguage,
    string
  >

  for (const row of rows) signatures[row.language as InboxLanguage] = row.body

  return {
    signatures,
    fromAddress: inboxFromAddress(),
    sendMode: resolveInboxTransport().mode,
  }
}

export const putSettings = async (input: {
  signatures: Record<InboxLanguage, string>
}): Promise<InboxSettings> => {
  await withTransaction(async () => {
    for (const language of INBOX_LANGUAGES) await repo.writeSignature(language, input.signatures[language])
  })

  return getSettings()
}

export const listSnippets = async (input: { page: number; pageSize: number }): Promise<Page<InboxSnippet>> => {
  const { rows, total } = await repo.listSnippets({
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize,
  })

  return toPage({ items: rows.map(toSnippet), page: input.page, pageSize: input.pageSize, total })
}

export const createSnippet = async (input: {
  title: string
  language: InboxLanguage | null
  body: string
}): Promise<InboxSnippet> => toSnippet(await repo.insertSnippet(input))

export const updateSnippet = async (input: {
  id: string
  title: string
  language: InboxLanguage | null
  body: string
}): Promise<InboxSnippet> => {
  const row = await repo.updateSnippet(input)

  if (!row) throw notFound('That ready reply does not exist')

  return toSnippet(row)
}

export const deleteSnippet = async (id: string): Promise<{ deleted: true }> => {
  if (!(await repo.deleteSnippet(id))) throw notFound('That ready reply does not exist')

  return { deleted: true }
}
