import { getDb } from '#/backend/db/client'
import type { InboxSettings, Snippet } from '#/shared/types/inbox.types'
import type {
  InboxLanguage,
  SignatureInput,
  SnippetsInput,
} from '#/shared/validation/inbox.validation'

/**
 * The owner's own wording: a signature per language, and the canned replies.
 *
 * One JSON row each in `app_settings` rather than columns, so adding a snippet
 * is never a migration. The defaults below are what a fresh install answers
 * with — empty, because an invented signature would go out under his name.
 */

const SIGNATURE_KEY = 'inbox.signature'
const SNIPPETS_KEY = 'inbox.snippets'

const EMPTY_SIGNATURE: Record<InboxLanguage, string> = { de: '', en: '', ar: '' }

const read = async <T>(key: string, fallback: T): Promise<T> => {
  const result = await getDb().query<{ value: unknown }>(
    'SELECT value FROM app_settings WHERE "key" = $1;',
    [key],
  )

  const value = result.rows[0]?.value

  return value === undefined || value === null ? fallback : (value as T)
}

const write = async (key: string, value: unknown): Promise<void> => {
  await getDb().query(
    `INSERT INTO app_settings ("key", value, updated_at)
     VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
     ON CONFLICT ("key") DO UPDATE
       SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;`,
    [key, JSON.stringify(value)],
  )
}

export const getSettings = async (): Promise<InboxSettings> => {
  const [signature, snippets] = await Promise.all([
    read<Record<InboxLanguage, string>>(SIGNATURE_KEY, EMPTY_SIGNATURE),
    read<Snippet[]>(SNIPPETS_KEY, []),
  ])

  return { signature: { ...EMPTY_SIGNATURE, ...signature }, snippets }
}

export const saveSignature = async (input: SignatureInput): Promise<InboxSettings> => {
  await write(SIGNATURE_KEY, input)

  return getSettings()
}

export const saveSnippets = async (input: SnippetsInput): Promise<InboxSettings> => {
  await write(SNIPPETS_KEY, input.items)

  return getSettings()
}

/**
 * The signature for one language, ready to append.
 *
 * Empty when he has not written one — and then nothing is appended at all,
 * rather than a blank line and a stray separator at the bottom of every letter.
 */
export const signatureFor = async (language: InboxLanguage): Promise<string> => {
  const { signature } = await getSettings()

  return (signature[language] ?? '').trim()
}
