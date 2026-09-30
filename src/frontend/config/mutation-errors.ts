import type { Mutation } from '@tanstack/react-query'
import { messageFromError, notify } from '#/frontend/lib/notify'

/**
 * Every failed write says so, once, as a toast — except a mutation marked
 * `meta: { toast: false }`, whose page already shows the failure in place
 * (joining a video call), so it is not said twice under a wrong heading.
 */
export const toastMutationFailure = (error: unknown, mutation: Pick<Mutation<unknown, unknown, unknown, unknown>, 'meta'>): void => {
  if (mutation.meta?.toast === false) return

  notify.error(messageFromError(error))
}
