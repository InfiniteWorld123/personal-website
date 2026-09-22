import { withTransaction } from '../../db/client'
import { notFound } from '../../http/error'
import { reorder } from '../projects/project.order'
import * as repo from './service.repo'

/**
 * The one global manual order.
 *
 * One integer per service, 1-based, dense, covering every service — published
 * or not. The public list is this order filtered to what is live, and the
 * homepage is the same order narrowed to the stars, so there is no second
 * "featured order" to keep in step.
 *
 * A move takes effect at once, like a move in Projects: it arranges the
 * catalogue rather than changing what any service says, so it has no draft and
 * no **Publish update**.
 *
 * The arithmetic — lift the service out, insert it at the target, clamp the
 * target into range — is the Projects function, reused rather than copied.
 */

/**
 * Moves a service to an absolute position.
 *
 * Absolute rather than "up" or "down", so a move from Dashboard page 3 to
 * position 2 needs nothing but the id and the number: the browser never has
 * to hold the whole list. A position past the end means the end.
 */
export const moveService = async (input: {
  serviceId: string
  position: number
}): Promise<{ id: string; position: number; total: number }> =>
  withTransaction(async () => {
    await repo.lockOrder()

    const ids = await repo.idsInOrder()

    if (!ids.includes(input.serviceId)) throw notFound('That service does not exist')

    const ordered = reorder(ids, input.serviceId, input.position)

    await repo.writeOrder(ordered)

    return {
      id: input.serviceId,
      position: ordered.indexOf(input.serviceId) + 1,
      total: ordered.length,
    }
  })

/** Closes the gap a permanent delete leaves. Called inside that transaction. */
export const compactPositions = async (): Promise<void> => {
  await repo.writeOrder(await repo.idsInOrder())
}
