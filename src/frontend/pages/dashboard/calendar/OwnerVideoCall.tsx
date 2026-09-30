import { Suspense, lazy, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { VideoAccess } from '#/backend2/contracts/booking.contract'
import { callCopy } from '#/frontend/features/call/call-copy'
import type { CallExit } from '#/frontend/features/call/VideoCall'
import { messageFromError } from '#/frontend/lib/notify'

/** The call screen and its SDK load only when a call opens. */
const VideoCall = lazy(() => import('#/frontend/features/call/VideoCall').then((module) => ({ default: module.VideoCall })))

const copy = callCopy.en

/**
 * The owner's side of the call, over the whole Dashboard: the same room the
 * visitor sees (approved Design Lab). Leave closes it; the appointment's
 * "End call" is what closes the room for good.
 */
export function OwnerVideoCall({
  access,
  visitorName,
  rejoin,
  onClose,
}: {
  access: VideoAccess
  visitorName: string
  /** Fetches a fresh seat for "Join again". */
  rejoin: () => Promise<VideoAccess>
  onClose: () => void
}) {
  const [current, setCurrent] = useState<VideoAccess | null>(access)
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !current) onClose()
    }

    window.addEventListener('keydown', onKey)

    return () => window.removeEventListener('keydown', onKey)
  }, [current, onClose])

  const afterCall = (why: CallExit) => {
    if (why === 'left' || why === 'removed') return onClose()

    setCurrent(null)
    setFailure(why === 'failed' ? copy.errors.couldNotOpen : copy.errors.lost)
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Video call with ${visitorName}`} className="fixed inset-0 z-[60] flex flex-col bg-[#070a13] p-2 sm:p-4">
      {current ? (
        <Suspense
          fallback={
            <p className="m-auto inline-flex items-center gap-2 text-sm text-[#a8b5d5]">
              <Loader2 aria-hidden="true" className="size-4 animate-spin" />
              {copy.status.connecting}
            </p>
          }
        >
          <VideoCall token={current.token} copy={copy} role="host" otherName={visitorName} endsAt={current.endsAt} onExit={afterCall} />
        </Suspense>
      ) : (
        <div className="m-auto grid max-w-md justify-items-center gap-4 text-center text-[#edf3ff]">
          <p role="alert" className="m-0 text-[15px]">{failure}</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="dash-btn dash-btn-primary h-9"
              disabled={busy}
              onClick={async () => {
                setBusy(true)

                try {
                  setCurrent(await rejoin())
                  setFailure(null)
                } catch (error) {
                  setFailure(messageFromError(error))
                } finally {
                  setBusy(false)
                }
              }}
            >
              {busy ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
              {copy.rejoin}
            </button>
            <button type="button" className="dash-btn dash-btn-quiet h-9" onClick={onClose}>
              {copy.leave}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
