import { getDb, withTransaction } from '../../db/client'

/**
 * The one global manual order (D10).
 *
 * One integer per project, 1-based, dense and unique, covering **every**
 * project — published, private and archived alike. The public list is this
 * same order filtered to published projects, which is what makes moving
 * something on Dashboard page 3 land exactly where the owner meant it, and
 * what lets the homepage be "the first N of the same query" rather than a
 * second featured order to keep in step.
 */

/**
 * Where the ids end up, as arithmetic.
 *
 * Split out from the transaction so the interesting half can be tested
 * without a database: move to first, to last, across a page boundary, past
 * the end, and onto itself.
 *
 * `target` is 1-based and clamped rather than rejected. The Dashboard sends
 * "move to position 25" from a page that no longer has 25 rows after a
 * filter, and the honest answer to that is the last position, not an error.
 */
export const reorder = (ids: string[], movingId: string, target: number): string[] => {
  const from = ids.indexOf(movingId)

  if (from === -1) return [...ids]

  const remaining = ids.filter((id) => id !== movingId)
  // Clamped into [1, count]: `count` is the length *including* the project
  // being moved, so the last position is reachable.
  const to = Math.min(Math.max(Math.trunc(target), 1), ids.length) - 1

  remaining.splice(to, 0, movingId)

  return remaining
}

/**
 * The move itself.
 *
 * The whole list is renumbered densely rather than the moved row alone being
 * given a fractional position: gaps and ties are what make "the first six" a
 * question with two answers. `v2_projects_position_unique` is
 * `DEFERRABLE INITIALLY DEFERRED`, so the sequence is allowed to collide with
 * itself halfway through the renumbering and is checked once at COMMIT.
 */
export const moveProject = async (input: {
  projectId: string
  position: number
}): Promise<string[]> =>
  withTransaction(async (db) => {
    await db.query('SET CONSTRAINTS ALL DEFERRED')

    // Locked in position order, so two concurrent moves queue rather than
    // interleave into a sequence neither of them asked for.
    const { rows } = await db.query<{ id: string }>(
      'SELECT id FROM v2_projects ORDER BY position FOR UPDATE',
    )

    const ordered = reorder(
      rows.map((row) => row.id),
      input.projectId,
      input.position,
    )

    for (const [index, id] of ordered.entries()) {
      await db.query('UPDATE v2_projects SET position = $2 WHERE id = $1', [id, index + 1])
    }

    return ordered
  })

/**
 * Closes the gap a permanent delete leaves behind.
 *
 * Called inside the deleting transaction: positions are unique but not
 * required to be contiguous by the database, and every other part of this
 * module assumes they are.
 */
export const compactPositions = async (): Promise<void> => {
  const db = getDb()

  await db.query('SET CONSTRAINTS ALL DEFERRED')

  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM v2_projects ORDER BY position FOR UPDATE',
  )

  for (const [index, row] of rows.entries()) {
    await db.query('UPDATE v2_projects SET position = $2 WHERE id = $1', [row.id, index + 1])
  }
}
