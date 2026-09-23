import { withTransaction } from '../../db/client'
import type { Page } from '../../contracts/pagination.contract'
import type { ChoiceListQuery, LeadChoice, LeadStage } from '../../contracts/lead.contract'
import { choiceInUse, choiceLocked, nameTaken, notFound } from '../../http/error'
import * as repo from './lead-choice.repo'

/**
 * Stages, sources and lost reasons. See `docs/v2/leads.md`.
 *
 * Permanent stages, `Unknown` and `Other` are locked. Hiding a source or a
 * reason takes it out of new choices and never changes an old Lead. Nothing
 * in use is deleted.
 */

const toStage = (row: repo.StageRow, activePosition: Map<string, number>): LeadStage => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  position: activePosition.get(row.id) ?? null,
  leadCount: Number(row.lead_count),
})

const toChoice = (row: repo.ChoiceRow): LeadChoice => ({
  id: row.id,
  name: row.name,
  hidden: row.hidden,
  locked: row.locked,
  leadCount: Number(row.lead_count),
})

/* ------------------------------------------------------------------ stages */

/** Every stage, in Board order, with how many Leads are in each. */
export const listStages = async (): Promise<LeadStage[]> => {
  await withTransaction(() => repo.ensureDefaults())

  const rows = await repo.listStages()
  const active = await repo.activeStageIds()
  const positions = new Map(active.map((id, index) => [id, index + 1]))

  return rows.map((row) => toStage(row, positions))
}

const stageTaken = (name: string) =>
  nameTaken(`There is already a stage called “${name}”`, { field: 'name' })

export const createStage = async (name: string): Promise<LeadStage[]> => {
  await withTransaction(async () => {
    await repo.ensureDefaults()
    await repo.lockStages()

    if (await repo.stageNameTaken(name)) throw stageTaken(name)

    await repo.insertStage(name)
  })

  return listStages()
}

/**
 * Rename a custom stage, or move any active stage (Contacted included) to a
 * new place among the active ones. New, Won and Lost never move.
 */
export const patchStage = async (input: {
  id: string
  name?: string
  position?: number
}): Promise<LeadStage[]> => {
  await withTransaction(async () => {
    await repo.ensureDefaults()
    await repo.lockStages()

    const stage = await repo.findStage(input.id)

    if (!stage) throw notFound('That stage does not exist')

    if (input.name !== undefined && input.name !== stage.name) {
      if (stage.kind !== 'custom') throw choiceLocked('The permanent stages keep their names')
      if (await repo.stageNameTaken(input.name, stage.id)) throw stageTaken(input.name)

      await repo.renameStage(stage.id, input.name)
    }

    if (input.position !== undefined) {
      if (stage.kind !== 'custom' && stage.kind !== 'contacted') {
        throw choiceLocked('New comes first, and Won and Lost come last')
      }

      const ids = (await repo.activeStageIds()).filter((id) => id !== stage.id)
      const at = Math.min(Math.max(input.position, 1), ids.length + 1) - 1

      ids.splice(at, 0, stage.id)
      await repo.writeStageOrder(ids)
    }
  })

  return listStages()
}

/** A custom stage, once it holds no Lead — Trash included. */
export const deleteStage = async (id: string): Promise<LeadStage[]> => {
  await withTransaction(async () => {
    await repo.ensureDefaults()
    await repo.lockStages()

    const stage = await repo.findStage(id)

    if (!stage) throw notFound('That stage does not exist')
    if (stage.kind !== 'custom') throw choiceLocked('The permanent stages cannot be deleted')

    try {
      await repo.deleteStage(stage.id)
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw choiceInUse('Move the leads in this stage somewhere else first — Trash included', {
          leadCount: Number(stage.lead_count),
        })
      }

      throw error
    }

    await repo.writeStageOrder(await repo.activeStageIds())
  })

  return listStages()
}

/* ----------------------------------------------------- sources and reasons */

const WORDS: Record<repo.ChoiceTable, { one: string; locked: string }> = {
  sources: { one: 'source', locked: 'Unknown cannot be renamed, hidden or deleted' },
  reasons: { one: 'reason', locked: 'Other cannot be renamed, hidden or deleted' },
}

export const listChoices = async (
  kind: repo.ChoiceTable,
  query: ChoiceListQuery,
): Promise<Page<LeadChoice>> => {
  await withTransaction(() => repo.ensureDefaults())

  const first = await repo.listChoices(kind, query)
  const pageCount = Math.max(1, Math.ceil(first.total / query.pageSize))
  const page = Math.min(query.page, pageCount)
  const result = page === query.page ? first : await repo.listChoices(kind, { ...query, page })

  return {
    items: result.rows.map(toChoice),
    page,
    pageSize: query.pageSize,
    total: result.total,
    pageCount,
    hasMore: page < pageCount,
  }
}

const loadChoice = async (kind: repo.ChoiceTable, id: string): Promise<LeadChoice> => {
  const row = await repo.findChoice(kind, id)

  if (!row) throw notFound(`That ${WORDS[kind].one} does not exist`)

  return toChoice(row)
}

const choiceTaken = (kind: repo.ChoiceTable, name: string) =>
  nameTaken(`There is already a ${WORDS[kind].one} called “${name}”`, { field: 'name' })

export const createChoice = async (kind: repo.ChoiceTable, name: string): Promise<LeadChoice> => {
  const id = await withTransaction(async () => {
    await repo.ensureDefaults()

    if (await repo.choiceNameTaken(kind, name)) throw choiceTaken(kind, name)

    return repo.insertChoice(kind, name)
  })

  return loadChoice(kind, id)
}

export const patchChoice = async (
  kind: repo.ChoiceTable,
  input: { id: string; name?: string; hidden?: boolean },
): Promise<LeadChoice> => {
  await withTransaction(async () => {
    const row = await repo.findChoice(kind, input.id)

    if (!row) throw notFound(`That ${WORDS[kind].one} does not exist`)

    const renaming = input.name !== undefined && input.name !== row.name
    const hiding = input.hidden !== undefined && input.hidden !== row.hidden

    if (row.locked && (renaming || hiding)) throw choiceLocked(WORDS[kind].locked)
    if (renaming && (await repo.choiceNameTaken(kind, input.name!, row.id)))
      throw choiceTaken(kind, input.name!)

    await repo.updateChoice(kind, row.id, { name: input.name, hidden: input.hidden })
  })

  return loadChoice(kind, input.id)
}

const isForeignKeyViolation = (error: unknown): boolean => {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : null

  return code === '23001' || code === '23503'
}

/** Only an unused one. A used one is hidden instead, and keeps its meaning. */
export const deleteChoice = async (
  kind: repo.ChoiceTable,
  id: string,
): Promise<{ id: string; deleted: true }> => {
  await withTransaction(async () => {
    const row = await repo.findChoice(kind, id)

    if (!row) throw notFound(`That ${WORDS[kind].one} does not exist`)
    if (row.locked) throw choiceLocked(WORDS[kind].locked)

    const used = Number(row.lead_count)

    if (used > 0) {
      throw choiceInUse(
        `${used === 1 ? 'One lead uses' : `${used} leads use`} this ${WORDS[kind].one}. Hide it instead.`,
        {
          leadCount: used,
        },
      )
    }

    await repo.deleteChoice(kind, row.id)
  }).catch((error: unknown) => {
    if (isForeignKeyViolation(error))
      throw choiceInUse(`This ${WORDS[kind].one} is in use. Hide it instead.`)

    throw error
  })

  return { id, deleted: true }
}
