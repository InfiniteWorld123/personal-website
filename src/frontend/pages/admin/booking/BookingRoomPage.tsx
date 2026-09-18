import { ApiRequestError } from '#/frontend/api/response'
import { CallRoom } from '#/frontend/features/call/CallRoom'
import { callCopy } from '#/frontend/features/call/call-copy'
import { useJoinCallAsHost } from '#/frontend/features/call/call-queries'

/**
 * The owner's way into the same room, opened by his admin session rather than
 * by a token. Same room, same window of time, other chair.
 *
 * German, like the rest of the admin: the URL carries no language segment, and
 * this is the one person who never needs it to.
 */
export function AdminBookingRoomPage({ id }: { id: string }) {
  const copy = callCopy.de
  const join = useJoinCallAsHost(id)

  const error = join.error
    ? join.error instanceof ApiRequestError
      ? join.error.message
      : copy.errors.couldNotOpen
    : null

  return (
    <div className="w-full">
      <CallRoom
        copy={copy}
        access={join.data ?? null}
        joining={join.isPending}
        joinError={error}
        onJoin={() => join.mutate()}
        onClose={() => join.reset()}
      />
    </div>
  )
}
