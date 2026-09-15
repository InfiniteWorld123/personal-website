import { type Db, getDb, withTransaction } from '#/backend/db/client'
import { notFoundError, validationError } from '#/backend/shared/error'
import { codeDefault, editableFieldByKey } from '#/frontend/content/editable'
import type {
  ContentDiffEntry,
  ContentFieldState,
  ContentLanguage,
  ContentRevision,
  ContentSnapshot,
  ContentValue,
  PublishedContent,
} from '#/shared/types/content.types'
import type {
  ContentResetInput,
  ContentReviewedInput,
  ContentSaveInput,
} from '#/shared/validation/content.validation'

const EDIT_LANGUAGES = ['de', 'en', 'ar'] as const

type TranslationRow = {
  key: string
  language: ContentLanguage
  draft_value: ContentValue | null
  published_value: ContentValue | null
  needs_review: boolean
  updated_at: Date | null
}

/**
 * A key is only writable if the content registry still knows it, and only in
 * the language its registry entry allows: facts and prices are held once under
 * `'*'`, everything else per language. Rejecting here rather than storing and
 * ignoring keeps the table free of rows that can never be read back.
 */
const requireWritableField = (key: string, language: ContentLanguage) => {
  const field = editableFieldByKey.get(key)

  if (!field) throw notFoundError('That text is not editable')

  if (field.shared && language !== '*') {
    throw validationError('That value is the same in every language')
  }

  if (!field.shared && language === '*') {
    throw validationError('That text is written once per language')
  }

  return field
}

/** The stored value has to match the shape the page will render it into. */
const requireMatchingShape = (key: string, value: ContentValue) => {
  const field = editableFieldByKey.get(key)
  if (!field) return

  const actual = Array.isArray(value) ? 'list' : typeof value === 'number' ? 'number' : 'text'
  const expected = field.kind === 'area' ? 'text' : field.kind

  if (actual !== expected) {
    throw validationError(`That field expects ${expected === 'list' ? 'a list' : expected}`)
  }

  if (field.kind !== 'number' && typeof value === 'string' && value.trim() === '') {
    // An empty override would render a blank headline. Clearing a field is
    // "restore the original", which is a different request.
    throw validationError('That text cannot be empty — restore the original instead')
  }
}

const toFieldState = (row: TranslationRow): ContentFieldState => ({
  key: row.key,
  language: row.language,
  draft: row.draft_value,
  published: row.published_value,
  needsReview: row.needs_review,
  updatedAt: row.updated_at?.toISOString() ?? null,
})

/**
 * Every published override, in the shape the content module writes over the
 * code's copy. Read on the server for each public render, so it is one query
 * and no joins beyond the key.
 */
export const listPublishedContent = async (): Promise<PublishedContent> => {
  const { rows } = await getDb().query<{
    key: string
    language: ContentLanguage
    published_value: ContentValue
  }>(
    `SELECT b.key, t.language, t.published_value
       FROM content_translations t
       JOIN content_blocks b ON b.id = t.content_block_id
      WHERE t.published_value IS NOT NULL`,
  )

  const published: PublishedContent = { de: {}, en: {}, ar: {}, shared: {} }

  for (const row of rows) {
    // A key the code no longer ships is dropped rather than applied: the page
    // it belonged to is gone, and writing it back would grow a dead branch.
    if (!editableFieldByKey.has(row.key)) continue

    const bucket = row.language === '*' ? published.shared : published[row.language]
    bucket[row.key] = row.published_value
  }

  return published
}

/** Everything the editor needs in one read: drafts, live values, review flags. */
export const getContentSnapshot = async (): Promise<ContentSnapshot> => {
  const { rows } = await getDb().query<TranslationRow>(
    `SELECT b.key, t.language, t.draft_value, t.published_value, t.needs_review, t.updated_at
       FROM content_translations t
       JOIN content_blocks b ON b.id = t.content_block_id
      WHERE t.draft_value IS NOT NULL
         OR t.published_value IS NOT NULL
         OR t.needs_review = true`,
  )

  const known = rows.filter((row) => editableFieldByKey.has(row.key))
  const reviewCounts: Record<string, number> = { de: 0, en: 0, ar: 0 }

  for (const row of known) {
    if (row.needs_review && row.language !== '*') reviewCounts[row.language] += 1
  }

  return {
    fields: known.map(toFieldState),
    draftCount: known.filter((row) => row.draft_value !== null).length,
    reviewCounts,
  }
}

const upsertBlock = async (db: Db, key: string): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO content_blocks (key) VALUES ($1)
       ON CONFLICT (key) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [key],
  )

  return rows[0].id
}

/**
 * Saves a draft. The site keeps serving whatever is published until the owner
 * publishes, and the other two languages are flagged so a German sentence that
 * moved on cannot quietly leave the English one behind.
 */
export const saveContentDraft = async (input: ContentSaveInput): Promise<ContentSnapshot> => {
  const field = requireWritableField(input.key, input.language)
  requireMatchingShape(input.key, input.value)

  await withTransaction(async (db) => {
    const blockId = await upsertBlock(db, input.key)

    await db.query(
      `INSERT INTO content_translations (content_block_id, language, draft_value, updated_at)
            VALUES ($1, $2, $3::jsonb, CURRENT_TIMESTAMP)
       ON CONFLICT (content_block_id, language)
       DO UPDATE SET draft_value = EXCLUDED.draft_value,
                     needs_review = false,
                     updated_at = CURRENT_TIMESTAMP`,
      [blockId, input.language, JSON.stringify(input.value)],
    )

    await db.query(
      `INSERT INTO content_revisions (content_block_id, language, value)
            VALUES ($1, $2, $3::jsonb)`,
      [blockId, input.language, JSON.stringify(input.value)],
    )

    if (!field.shared) {
      const others = EDIT_LANGUAGES.filter((language) => language !== input.language)

      for (const language of others) {
        await db.query(
          `INSERT INTO content_translations (content_block_id, language, needs_review, updated_at)
                VALUES ($1, $2, true, CURRENT_TIMESTAMP)
           ON CONFLICT (content_block_id, language)
           DO UPDATE SET needs_review = true`,
          [blockId, language],
        )
      }
    }
  })

  return getContentSnapshot()
}

/**
 * Drops the draft and the published override, which puts the site back on the
 * wording in `de.ts`. The original was never overwritten, so this needs no
 * backup of its own.
 */
export const resetContentField = async (input: ContentResetInput): Promise<ContentSnapshot> => {
  requireWritableField(input.key, input.language)

  await withTransaction(async (db) => {
    const { rows } = await db.query<{ id: string }>('SELECT id FROM content_blocks WHERE key = $1', [
      input.key,
    ])

    const blockId = rows[0]?.id
    if (!blockId) return

    await db.query(
      `UPDATE content_translations
          SET draft_value = NULL, published_value = NULL,
              needs_review = false, updated_at = CURRENT_TIMESTAMP
        WHERE content_block_id = $1 AND language = $2`,
      [blockId, input.language],
    )

    await db.query(
      `INSERT INTO content_revisions (content_block_id, language, value) VALUES ($1, $2, NULL)`,
      [blockId, input.language],
    )
  })

  return getContentSnapshot()
}

/** What the owner is about to change, oldest wording first, for the confirmation. */
export const getPublishDiff = async (): Promise<ContentDiffEntry[]> => {
  const { rows } = await getDb().query<{
    key: string
    language: ContentLanguage
    draft_value: ContentValue
    published_value: ContentValue | null
  }>(
    `SELECT b.key, t.language, t.draft_value, t.published_value
       FROM content_translations t
       JOIN content_blocks b ON b.id = t.content_block_id
      WHERE t.draft_value IS NOT NULL
      ORDER BY b.key, t.language`,
  )

  return rows
    .filter((row) => editableFieldByKey.has(row.key))
    .map((row) => ({
      key: row.key,
      language: row.language,
      // What the visitor sees today: the published override, or — when there is
      // none — the wording the code ships, which is what is actually on screen.
      from:
        row.published_value ??
        codeDefault(row.key, row.language === '*' ? 'de' : row.language) ??
        null,
      to: row.draft_value,
    }))
}

/** Promotes every draft at once. Half a page in the new wording is not a state worth having. */
export const publishContent = async (): Promise<ContentSnapshot> => {
  await getDb().query(
    `UPDATE content_translations
        SET published_value = draft_value,
            draft_value = NULL,
            updated_at = CURRENT_TIMESTAMP
      WHERE draft_value IS NOT NULL`,
  )

  return getContentSnapshot()
}

export const listContentRevisions = async (limit = 40): Promise<ContentRevision[]> => {
  const { rows } = await getDb().query<{
    id: string
    key: string
    language: ContentLanguage
    value: ContentValue | null
    created_at: Date
  }>(
    `SELECT r.id, b.key, r.language, r.value, r.created_at
       FROM content_revisions r
       JOIN content_blocks b ON b.id = r.content_block_id
      ORDER BY r.created_at DESC
      LIMIT $1`,
    [limit],
  )

  return rows
    .filter((row) => editableFieldByKey.has(row.key))
    .map((row) => ({
      id: row.id,
      key: row.key,
      language: row.language,
      value: row.value,
      createdAt: row.created_at.toISOString(),
    }))
}

/**
 * Brings an earlier wording back as a draft. Deliberately not a publish: a
 * revert is a proposal like any other edit, and goes out with the next publish.
 */
export const revertContentRevision = async (revisionId: string): Promise<ContentSnapshot> => {
  const { rows } = await getDb().query<{
    key: string
    language: ContentLanguage
    value: ContentValue | null
  }>(
    `SELECT b.key, r.language, r.value
       FROM content_revisions r
       JOIN content_blocks b ON b.id = r.content_block_id
      WHERE r.id = $1`,
    [revisionId],
  )

  const revision = rows[0]
  if (!revision) throw notFoundError('That revision no longer exists')

  // A revision with no value is a "restore the original", and reverting to it
  // means exactly that again.
  if (revision.value === null) {
    return resetContentField({ key: revision.key, language: revision.language })
  }

  return saveContentDraft({
    key: revision.key,
    language: revision.language,
    value: revision.value,
  })
}

/** The owner has looked at the other language and is content with it as it stands. */
export const markContentReviewed = async (
  input: ContentReviewedInput,
): Promise<ContentSnapshot> => {
  await getDb().query(
    `UPDATE content_translations t
        SET needs_review = false, updated_at = CURRENT_TIMESTAMP
       FROM content_blocks b
      WHERE b.id = t.content_block_id AND b.key = $1 AND t.language = $2`,
    [input.key, input.language],
  )

  return getContentSnapshot()
}
