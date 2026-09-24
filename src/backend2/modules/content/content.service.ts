import { withTransaction } from '../../db/client'
import { type Page, toPage } from '../../contracts/pagination.contract'
import {
  CONTENT_LANGUAGES,
  type ContentFieldDefinition,
  type ContentFieldState,
  type ContentHistoryAction,
  type ContentHistoryEntry,
  type ContentHistoryQuery,
  type ContentLanguage,
  type ContentSaveResult,
  type ContentSlot,
  type ContentSlotState,
  type ContentSnapshot,
  type ContentValue,
  type PublicContent,
  checkContentValue,
  sameContentValue,
  slotMatchesField,
} from '../../contracts/content.contract'
import { conflict, legalLocked, notFound, validationFailed } from '../../http/error'
import {
  CONTENT_PAGES,
  contentRegistry,
  findContentField,
  originalValue,
  slotsOf,
} from './content.registry'
import * as repo from './content.repo'

/**
 * What a Content request actually does.
 *
 * The rule this file keeps is the owner's, and it is the opposite of every
 * other module: *a saved field is live.* There is no draft. So everything
 * that makes that safe happens here, before the one write:
 *
 * - the value is checked by the same function the editor runs;
 * - a stale editor is refused rather than allowed to overwrite newer wording;
 * - a Legal field is refused unless the editor says it was unlocked;
 * - the change is recorded once, whole, in history.
 */

/* ----------------------------------------------------------------- lookups */

const requireField = (key: string): ContentFieldDefinition => {
  const field = findContentField(key)

  // 404, as for any record that does not exist: a key outside the release
  // registry is not an editable field.
  if (!field) throw notFound('That field is not editable')

  return field
}

const requireSlot = (field: ContentFieldDefinition, slot: ContentSlot): void => {
  if (slotMatchesField(field, slot)) return

  throw validationFailed(
    field.shared
      ? 'This value is the same in every language. Save it as "shared".'
      : 'This text is written once per language. Choose de, en, or ar.',
    { issues: [{ field: 'language', message: 'Wrong language for this field' }], missing: [] },
  )
}

const requireUnlocked = (field: ContentFieldDefinition, unlocked: boolean): void => {
  if (field.scope === 'legal' && !unlocked) throw legalLocked()
}

const refuseInvalid = (field: ContentFieldDefinition, raw: unknown): ContentValue => {
  const checked = checkContentValue(field, raw)

  if (checked.ok) return checked.value

  throw validationFailed(checked.issues[0]?.message ?? 'That value is not allowed', {
    issues: checked.issues,
    missing: [],
  })
}

/* ---------------------------------------------------------------- mapping */

const slotState = (
  field: ContentFieldDefinition,
  slot: ContentSlot,
  row: repo.ValueRow | undefined,
  flagged: boolean,
): ContentSlotState => {
  const original = originalValue(field, slot)
  const value = row?.value ?? original

  return {
    value,
    original,
    isOriginal: sameContentValue(value, original),
    revision: row?.revision ?? 0,
    needsReview: flagged,
    updatedAt: row?.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

const fieldState = (
  field: ContentFieldDefinition,
  rows: Map<string, repo.ValueRow>,
  flags: Set<string>,
): ContentFieldState => ({
  ...field,
  slots: Object.fromEntries(
    slotsOf(field).map((slot) => [
      slot,
      slotState(field, slot, rows.get(`${field.key}|${slot}`), flags.has(`${field.key}|${slot}`)),
    ]),
  ),
})

const indexRows = (rows: repo.ValueRow[]) =>
  new Map(rows.map((row) => [`${row.field_key}|${row.language}`, row]))

const loadFieldState = async (field: ContentFieldDefinition): Promise<ContentFieldState> => {
  const rows = indexRows(await repo.listValuesForKey(field.key))
  const flags = new Set(
    (await repo.listReviewFlags())
      .filter((flag) => flag.field_key === field.key)
      .map((flag) => `${flag.field_key}|${flag.language}`),
  )

  return fieldState(field, rows, flags)
}

/* ----------------------------------------------------------------- reading */

/** Everything the editor needs in one read: the registry and every live value. */
export const getContentSnapshot = async (): Promise<ContentSnapshot> => {
  const rows = indexRows(await repo.listValues())
  const flagRows = (await repo.listReviewFlags()).filter((flag) => findContentField(flag.field_key))
  const flags = new Set(flagRows.map((flag) => `${flag.field_key}|${flag.language}`))

  const reviewCounts = { de: 0, en: 0, ar: 0 } as Record<ContentLanguage, number>
  for (const flag of flagRows) {
    if (flag.language !== 'shared') reviewCounts[flag.language] += 1
  }

  return {
    pages: [...CONTENT_PAGES],
    fields: contentRegistry.map((field) => fieldState(field, rows, flags)),
    reviewCounts,
  }
}

/**
 * What a visitor's page renders: every registry field in one language, and
 * the shared facts. Stored wording where there is some, the release wording
 * otherwise. Nothing about revisions, history, or review.
 */
export const readPublicContent = async (language: ContentLanguage): Promise<PublicContent> => {
  const stored = new Map(
    (await repo.listPublicValues(language)).map((row) => [`${row.field_key}|${row.language}`, row.value]),
  )

  const fields: Record<string, ContentValue> = {}
  const shared: Record<string, ContentValue> = {}

  for (const field of contentRegistry) {
    const slot: ContentSlot = field.shared ? 'shared' : language
    const value = stored.get(`${field.key}|${slot}`) ?? originalValue(field, slot)

    if (field.shared) shared[field.key] = value
    else fields[field.key] = value
  }

  return { language, fields, shared }
}

/* ----------------------------------------------------------------- writing */

/**
 * The one write every change goes through: an edit, **Original**, or a value
 * brought back from history.
 *
 * Inside one transaction: lock the row, compare, write, record. A value that
 * is already live answers success without writing anything — which is also
 * what makes a retry safe when the first attempt succeeded but its answer was
 * lost on the way back.
 */
const writeLive = async (input: {
  field: ContentFieldDefinition
  slot: ContentSlot
  value: ContentValue
  expectedRevision: number
  action: ContentHistoryAction
  restoredFrom?: string
}): Promise<ContentSaveResult> => {
  const { field, slot } = input

  const changed = await withTransaction(async () => {
    const row = await repo.lockValue(field.key, slot)
    const before = row?.value ?? originalValue(field, slot)
    const revision = row?.revision ?? 0

    if (sameContentValue(before, input.value)) return false

    /*
     * A different revision means another tab — or a slow earlier save from
     * this one — changed the field after this editor last saw it. Refusing is
     * the point: the alternative silently reverts the newer wording.
     */
    if (revision !== input.expectedRevision) {
      throw conflict(
        'This text was changed somewhere else. Your wording was not saved; compare it with the newer version.',
        { key: field.key, language: slot, current: { value: before, revision } },
      )
    }

    const written = row
      ? await repo.updateValue({ key: field.key, slot, value: input.value, expectedRevision: revision })
      : await repo.insertValue({ key: field.key, slot, value: input.value })

    // Only reachable if a first save raced another first save of the same field.
    if (!written) {
      throw conflict('This text was changed somewhere else. Reload it and try again.', {
        key: field.key,
        language: slot,
      })
    }

    await repo.insertHistory({
      key: field.key,
      slot,
      action: input.action,
      before,
      after: input.value,
      revision: written.revision,
      restoredFrom: input.restoredFrom,
    })

    /*
     * The other two languages keep serving their own wording. They are only
     * flagged, so the owner can look at them when it suits — and this one,
     * just written by hand, is no longer in question.
     */
    if (!field.shared) {
      await repo.clearReviewFlag(field.key, slot)
      await repo.flagForReview(
        field.key,
        CONTENT_LANGUAGES.filter((language) => language !== slot),
      )
    }

    return true
  })

  return { field: await loadFieldState(field), changed }
}

/** Saves one field in one language, live. */
export const saveContentField = async (input: {
  key: string
  language: ContentSlot
  value: unknown
  expectedRevision: number
  legalUnlocked: boolean
}): Promise<ContentSaveResult> => {
  const field = requireField(input.key)
  requireSlot(field, input.language)
  requireUnlocked(field, input.legalUnlocked)

  return writeLive({
    field,
    slot: input.language,
    value: refuseInvalid(field, input.value),
    expectedRevision: input.expectedRevision,
    action: 'edit',
  })
}

/** Puts the release wording back, as a new live revision with its own history line. */
export const restoreOriginal = async (input: {
  key: string
  language: ContentSlot
  expectedRevision: number
  legalUnlocked: boolean
}): Promise<ContentSaveResult> => {
  const field = requireField(input.key)
  requireSlot(field, input.language)
  requireUnlocked(field, input.legalUnlocked)

  return writeLive({
    field,
    slot: input.language,
    value: originalValue(field, input.language),
    expectedRevision: input.expectedRevision,
    action: 'restore_original',
  })
}

/**
 * Brings back one side of an earlier change. Checked again against today's
 * rules: wording that was valid then but is not now cannot slip back in.
 */
export const restoreFromHistory = async (input: {
  historyId: string
  side: 'before' | 'after'
  expectedRevision: number
  legalUnlocked: boolean
}): Promise<ContentSaveResult> => {
  const entry = await repo.findHistory(input.historyId)
  if (!entry) throw notFound('That history entry does not exist')

  const field = requireField(entry.field_key)
  requireUnlocked(field, input.legalUnlocked)

  return writeLive({
    field,
    slot: entry.language,
    value: refuseInvalid(field, input.side === 'before' ? entry.before_value : entry.after_value),
    expectedRevision: input.expectedRevision,
    action: 'restore_history',
    restoredFrom: entry.id,
  })
}

/** The owner looked at this language and is content with it as it stands. */
export const markReviewed = async (input: {
  key: string
  language: ContentSlot
}): Promise<ContentFieldState> => {
  const field = requireField(input.key)
  requireSlot(field, input.language)

  await repo.clearReviewFlag(field.key, input.language)

  return loadFieldState(field)
}

/* ----------------------------------------------------------------- history */

const toHistoryEntry = (row: repo.HistoryRow): ContentHistoryEntry => ({
  id: row.id,
  key: row.field_key,
  language: row.language,
  action: row.action,
  before: row.before_value,
  after: row.after_value,
  revision: row.revision,
  restoredFrom: row.restored_from,
  createdAt: new Date(row.created_at).toISOString(),
})

export const listContentHistory = async (
  query: ContentHistoryQuery,
): Promise<Page<ContentHistoryEntry>> => {
  const { rows, total } = await repo.pageHistory({
    ...query,
    keys: contentRegistry.map((field) => field.key),
  })

  return toPage({ items: rows.map(toHistoryEntry), page: query.page, pageSize: query.pageSize, total })
}
