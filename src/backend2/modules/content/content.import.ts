import { withTransaction } from '../../db/client'
import {
  type ContentSlot,
  type ContentValue,
  checkContentValue,
  sameContentValue,
} from '../../contracts/content.contract'
import { conflict, notFound } from '../../http/error'
import { contentRegistry, findContentField, originalValue, slotsOf } from './content.registry'
import * as repo from './content.repo'

/**
 * The one-time import of the wording visitors read today (`docs/v2/content.md`,
 * "Existing content and cutover").
 *
 * The source is the *effective published* legacy copy: the release wording
 * with the legacy published overrides written over it. Legacy drafts are never
 * part of it — the exporter reads only published values, and reports how many
 * drafts it left behind.
 *
 * Two processes, never one: `content-export-legacy.ts` reads the legacy
 * database (read-only) into a file, and this reads that file into V2. No
 * process holds both connections, so nothing can dual-write.
 *
 * Every function here is pure or V2-only, so the whole plan can be tested and
 * previewed before a single row is written.
 */

export type LegacyExport = {
  format: 'legacy-content-export'
  version: 1
  exportedAt: string
  /** Published overrides by language; `shared` holds the legacy `'*'` values. */
  published: Record<'de' | 'en' | 'ar' | 'shared', Record<string, unknown>>
  /** Unpublished legacy drafts that were deliberately left behind. Count only. */
  ignoredDrafts: number
}

export type ImportRow = {
  key: string
  language: ContentSlot
  value: ContentValue
  origin: 'legacy-override' | 'release-default'
}

export type ImportExclusion = {
  key: string
  language: ContentSlot
  reason:
    | 'owned-by-services'
    | 'owned-by-projects'
    | 'not-in-v2-registry'
    | 'wrong-language-slot'
  /** For a dynamic module's key: it has a published legacy override that its own cutover must keep. */
  note?: string
}

export type ImportManifest = {
  source: { exportedAt: string; ignoredDrafts: number }
  registryFields: number
  counts: {
    rows: number
    fromLegacyOverride: number
    fromReleaseDefault: number
    excluded: number
    invalid: number
    perSlot: Record<ContentSlot, { rows: number; fromLegacyOverride: number }>
  }
  /** Every V2 destination whose wording differs from the release default. */
  differsFromDefault: Array<{ key: string; language: ContentSlot; releaseDefault: ContentValue; imported: ContentValue }>
  excluded: ImportExclusion[]
  invalid: Array<{ key: string; language: ContentSlot; message: string }>
}

export type ImportPlan = { manifest: ImportManifest; rows: ImportRow[] }

const SLOTS: ContentSlot[] = ['de', 'en', 'ar', 'shared']

const exclusionFor = (key: string): ImportExclusion['reason'] => {
  if (key.startsWith('price.') || key.startsWith('services.items.') || key.startsWith('home.services.cards.')) {
    return 'owned-by-services'
  }
  if (key.startsWith('work.items.')) return 'owned-by-projects'

  return 'not-in-v2-registry'
}

/** Refuses a file that is not an export this tool wrote. */
export const readLegacyExport = (raw: unknown): LegacyExport => {
  const value = raw as Partial<LegacyExport> | null

  if (
    !value ||
    value.format !== 'legacy-content-export' ||
    value.version !== 1 ||
    typeof value.exportedAt !== 'string' ||
    !value.published ||
    SLOTS.some((slot) => typeof value.published?.[slot] !== 'object' || value.published?.[slot] === null)
  ) {
    throw new Error('That file is not a legacy content export (format "legacy-content-export", version 1)')
  }

  return { ...value, ignoredDrafts: Number(value.ignoredDrafts ?? 0) } as LegacyExport
}

/**
 * What an import would write, and everything it would leave out, with the
 * reason. Writes nothing.
 */
export const planContentImport = (source: LegacyExport): ImportPlan => {
  const rows: ImportRow[] = []
  const excluded: ImportExclusion[] = []
  const invalid: ImportManifest['invalid'] = []

  for (const slot of SLOTS) {
    for (const [key, value] of Object.entries(source.published[slot])) {
      const field = findContentField(key)

      if (!field) {
        const reason = exclusionFor(key)
        excluded.push({
          key,
          language: slot,
          reason,
          note:
            reason === 'not-in-v2-registry'
              ? undefined
              : `Published legacy wording (${JSON.stringify(value)}) must be kept by that module's cutover`,
        })
      } else if (!slotsOf(field).includes(slot)) {
        excluded.push({ key, language: slot, reason: 'wrong-language-slot' })
      }
    }
  }

  for (const field of contentRegistry) {
    for (const slot of slotsOf(field)) {
      const override = source.published[slot][field.key]
      const original = originalValue(field, slot)
      const candidate = override === undefined ? original : override
      const checked = checkContentValue(field, candidate)

      if (!checked.ok) {
        invalid.push({ key: field.key, language: slot, message: checked.issues[0]?.message ?? 'Invalid' })
        continue
      }

      rows.push({
        key: field.key,
        language: slot,
        value: checked.value,
        origin: override === undefined ? 'release-default' : 'legacy-override',
      })
    }
  }

  const perSlot = Object.fromEntries(
    SLOTS.map((slot) => [
      slot,
      {
        rows: rows.filter((row) => row.language === slot).length,
        fromLegacyOverride: rows.filter((row) => row.language === slot && row.origin === 'legacy-override').length,
      },
    ]),
  ) as ImportManifest['counts']['perSlot']

  const differsFromDefault = rows.flatMap((row) => {
    const field = findContentField(row.key)
    if (!field) return []
    const releaseDefault = originalValue(field, row.language)

    return sameContentValue(releaseDefault, row.value)
      ? []
      : [{ key: row.key, language: row.language, releaseDefault, imported: row.value }]
  })

  return {
    rows,
    manifest: {
      source: { exportedAt: source.exportedAt, ignoredDrafts: source.ignoredDrafts },
      registryFields: contentRegistry.length,
      counts: {
        rows: rows.length,
        fromLegacyOverride: rows.filter((row) => row.origin === 'legacy-override').length,
        fromReleaseDefault: rows.filter((row) => row.origin === 'release-default').length,
        excluded: excluded.length,
        invalid: invalid.length,
        perSlot,
      },
      differsFromDefault,
      excluded,
      invalid,
    },
  }
}

/**
 * Writes the plan into an empty V2 content store, as one transaction.
 *
 * Refused when any value fails today's rules — nothing is written, and the
 * manifest names them — and refused when V2 already holds content: this is a
 * one-time import, and a second one would silently overwrite the owner's V2
 * edits. The final pre-cutover check is `compareContentImport`, not a re-import.
 */
export const applyContentImport = async (
  plan: ImportPlan,
  sourceLabel: string,
): Promise<{ importId: string; written: number }> => {
  if (plan.manifest.invalid.length > 0) {
    throw conflict('Some imported values fail the V2 rules; nothing was written', {
      invalid: plan.manifest.invalid,
    })
  }

  return withTransaction(async () => {
    if ((await repo.countValues()) > 0) {
      throw conflict('V2 already holds content. The import runs once, into an empty store.')
    }

    const importId = await repo.insertImport({ sourceLabel, manifest: plan.manifest })

    for (const row of plan.rows) {
      await repo.insertValue({ key: row.key, slot: row.language, value: row.value, importId })
    }

    return { importId, written: plan.rows.length }
  })
}

/**
 * The final read-and-compare before an approved cutover: what V2 serves now
 * against what the legacy site serves now. An empty list means they agree.
 */
export const compareContentImport = async (
  plan: ImportPlan,
): Promise<Array<{ key: string; language: ContentSlot; v2: ContentValue; legacy: ContentValue }>> => {
  const stored = new Map(
    (await repo.listValues()).map((row) => [`${row.field_key}|${row.language}`, row.value]),
  )

  return plan.rows.flatMap((row) => {
    const field = findContentField(row.key)
    if (!field) return []
    const v2 = stored.get(`${row.key}|${row.language}`) ?? originalValue(field, row.language)

    return sameContentValue(v2, row.value) ? [] : [{ key: row.key, language: row.language, v2, legacy: row.value }]
  })
}

/**
 * Removes one import's rows, putting V2 back on the release wording.
 *
 * Refused while any of those rows has been edited in V2 since: a rollback
 * that erased the owner's later work would be a second problem, not a fix.
 */
export const rollbackContentImport = async (importId: string): Promise<{ removed: number }> =>
  withTransaction(async () => {
    const found = await repo.findImport(importId)
    if (!found) throw notFound('That import does not exist')
    if (found.rolled_back_at) throw conflict('That import was already rolled back')

    const edited = await repo.listEditedImportRows(importId)
    if (edited.length > 0) {
      throw conflict('Some imported fields were edited in V2 since; nothing was removed', { edited })
    }

    const removed = await repo.deleteImportRows(importId)
    await repo.markImportRolledBack(importId)

    return { removed }
  })
