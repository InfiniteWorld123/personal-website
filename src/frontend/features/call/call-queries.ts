import { useMutation } from '@tanstack/react-query'
import { joinCallAsHost, joinCallAsVisitor } from '#/frontend/api/call.api'

/**
 * Joining is a mutation, not a query.
 *
 * Nothing is read: a ticket is minted and relay credentials are bought, both
 * good for minutes. Cached and replayed — which is what a query would do — the
 * second attempt would carry a ticket that has already expired.
 */

export const useJoinCallAsVisitor = (reference: string, token: string) =>
  useMutation({ mutationFn: () => joinCallAsVisitor(reference, token) })

export const useJoinCallAsHost = (bookingId: string) =>
  useMutation({ mutationFn: () => joinCallAsHost(bookingId) })
